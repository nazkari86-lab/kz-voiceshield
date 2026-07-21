from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any
from uuid import uuid4
from threading import Lock
import base64
import json

from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    File,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware

from .config import Principal, Settings
from .ml_service import ModelService, ModelUnavailable
from .models import AccountRegisterRequest, AudioJobResponse, CasePayload, CrowdReportBatch, FamilyCreateRequest, FamilyJoinRequest, TranscriptAnalysisResponse, TranscriptRequest, WorkflowPatch
from .repository import CaseVersionConflict, Repository
from .security import PayloadCipher, authenticate, require_roles
from .transcription import Transcriber, transcriber_from_env
from .privacy import detect_language, redact_text
from .mcp_gateway import handle_mcp
from .training_tts import TrainingTtsService, TrainingTtsSettings, TrainingTtsUnavailable
from .external_intel import ExternalIntelService, ExternalIntelSettings, ExternalIntelUnavailable


ALLOWED_AUDIO_TYPES = {
    "audio/aac",
    "audio/flac",
    "audio/m4a",
    "audio/mp4",
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
    "audio/webm",
    "audio/x-m4a",
}


def create_app(
    settings: Settings | None = None,
    transcriber: Transcriber | None = None,
    model_service: ModelService | None = None,
) -> FastAPI:
    resolved_settings = settings or Settings.from_env()
    cipher = PayloadCipher(resolved_settings.encryption_key)
    repository = Repository(resolved_settings.database_path, cipher)
    resolved_model = model_service or ModelService(resolved_settings.model_path)
    resolved_transcriber = transcriber or transcriber_from_env()
    training_tts = TrainingTtsService(TrainingTtsSettings(
        api_key=resolved_settings.training_tts_api_key,
        voice_id=resolved_settings.training_tts_voice_id,
        model_id=resolved_settings.training_tts_model_id,
        cache_dir=resolved_settings.training_tts_cache_dir,
        edge_tts_enabled=resolved_settings.training_edge_tts_enabled,
        edge_tts_voice_ru=resolved_settings.training_edge_tts_voice_ru,
        edge_tts_voice_kz=resolved_settings.training_edge_tts_voice_kz,
    ))
    external_intel = ExternalIntelService(ExternalIntelSettings(
        numverify_api_key=resolved_settings.numverify_api_key,
        abstract_api_key=resolved_settings.abstract_api_key,
        phishtank_api_key=resolved_settings.phishtank_api_key,
        timeout_seconds=resolved_settings.external_intel_timeout_seconds,
    ))
    livekit_rooms: dict[str, dict[str, Any]] = {}
    livekit_lock = Lock()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        yield
        repository.close()

    app = FastAPI(title="KZ VoiceShield API", version="2.2.2", lifespan=lifespan)
    app.state.settings = resolved_settings
    app.state.repository = repository
    app.state.model_service = resolved_model
    app.state.transcriber = resolved_transcriber
    if resolved_settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_credentials=False,
            allow_headers=["Authorization", "Content-Type"],
            allow_methods=["GET", "POST", "PUT", "PATCH", "OPTIONS"],
            allow_origins=list(resolved_settings.cors_origins),
        )

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {
            "ok": True,
            "version": app.version,
            "apiVersion": "v1",
            "mlAvailable": resolved_model.available,
        }

    def service_capabilities() -> dict[str, bool]:
        return {
            "serverStt": resolved_transcriber.__class__.__name__
            != "DisabledTranscriber",
            "serverVad": resolved_transcriber.__class__.__name__
            == "FasterWhisperTranscriber",
            "liveKitVoip": livekit_configured(),
            "serverPiiRedaction": True,
            "mcpGateway": True,
            "trainedKazakhStreamingAsr": False,
            "deepfakeModel": False,
            "trainingTts": training_tts.available,
            "externalNumberLookup": external_intel.number_available,
            "externalPhishingLookup": external_intel.phishing_available,
        }

    @app.get("/readyz")
    def readiness() -> dict[str, Any]:
        database_ok = repository.health_check()
        return {
            "ok": database_ok,
            "version": app.version,
            "apiVersion": "v1",
            "database": "ok" if database_ok else "failed",
            "mlAvailable": resolved_model.available,
            "serverSttConfigured": resolved_transcriber.__class__.__name__
            != "DisabledTranscriber",
            "retainAudio": resolved_settings.retain_audio,
            "maxAudioBytes": resolved_settings.max_audio_bytes,
            "livekitConfigured": all(
                (
                    resolved_settings.livekit_url,
                    resolved_settings.livekit_api_key,
                    resolved_settings.livekit_api_secret,
                )
            ),
            "capabilities": service_capabilities(),
        }

    def livekit_configured() -> bool:
        return all(
            (
                resolved_settings.livekit_url,
                resolved_settings.livekit_api_key,
                resolved_settings.livekit_api_secret,
            )
        )

    @app.get("/diagnostics")
    def diagnostics(principal: Principal = Depends(authenticate)) -> dict[str, Any]:
        """Authenticated operational metadata; never returns tokens, keys, or case data."""
        database_ok = repository.health_check()
        repository.audit(principal.user_id, "backend_diagnostics_read", {})
        return {
            "ok": database_ok,
            "apiVersion": "v1",
            "serviceVersion": app.version,
            "capabilities": service_capabilities(),
            "limits": {"maxAudioBytes": resolved_settings.max_audio_bytes},
            "privacy": {"retainAudio": resolved_settings.retain_audio, "serverPiiRedaction": True},
        }

    @app.post("/account/register")
    def register_account(body: AccountRegisterRequest) -> dict[str, Any]:
        account, session_token = repository.create_account(body.deviceId, body.displayName.strip(), body.phone)
        repository.audit(account["userId"], "account_registered", {"deviceId": body.deviceId})
        return {"account": account, "sessionToken": session_token, "phoneVerification": "not_configured"}

    @app.get("/account/me")
    def account_me(principal: Principal = Depends(authenticate)) -> dict[str, Any]:
        account = repository.get_account(principal.user_id)
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")
        return {"account": account, "family": repository.get_family(principal.user_id)}

    @app.post("/account/logout")
    def account_logout(request: Request, principal: Principal = Depends(authenticate)) -> dict[str, bool]:
        credentials = request.headers.get("Authorization", "")
        if credentials.lower().startswith("bearer "):
            repository.revoke_session(credentials[7:].strip())
        repository.audit(principal.user_id, "account_logout", {})
        return {"ok": True}

    @app.post("/family")
    def create_family(body: FamilyCreateRequest, principal: Principal = Depends(authenticate)) -> dict[str, Any]:
        if principal.role != "member":
            raise HTTPException(status_code=403, detail="A user account is required")
        return {"family": repository.create_family_group(principal.user_id, body.name.strip())}

    @app.get("/family")
    def get_family(principal: Principal = Depends(authenticate)) -> dict[str, Any]:
        return {"family": repository.get_family(principal.user_id)}

    @app.post("/family/invite")
    def invite_family(principal: Principal = Depends(authenticate)) -> dict[str, Any]:
        invite = repository.create_family_invite(principal.user_id)
        if not invite:
            raise HTTPException(status_code=403, detail="Only a family owner can create invites")
        return {"inviteCode": invite, "expires": "single-use"}

    @app.post("/family/join")
    def join_family(body: FamilyJoinRequest, principal: Principal = Depends(authenticate)) -> dict[str, Any]:
        family = repository.join_family(body.inviteCode, principal.user_id)
        if not family:
            raise HTTPException(status_code=404, detail="Invite is invalid or already used")
        return {"family": family}

    @app.get("/intel/number")
    def lookup_external_number(number: str = Query(min_length=7, max_length=24), principal: Principal = Depends(authenticate)) -> dict[str, Any]:
        try:
            result = external_intel.lookup_number(number)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        except ExternalIntelUnavailable as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        repository.audit(principal.user_id, "external_number_lookup", {"provider": result["provider"]})
        return result

    @app.post("/intel/url")
    def check_external_url(payload: dict[str, Any], principal: Principal = Depends(authenticate)) -> dict[str, Any]:
        url = payload.get("url") if isinstance(payload.get("url"), str) else ""
        try:
            result = external_intel.check_url(url)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        except ExternalIntelUnavailable as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        repository.audit(principal.user_id, "external_url_lookup", {"provider": result["provider"]})
        return result

    @app.post("/reputation/reports")
    def receive_crowd_reports(body: CrowdReportBatch, principal: Principal = Depends(authenticate)) -> dict[str, Any]:
        accepted = 0
        for report in body.reports:
            if repository.upsert_crowd_report(report.id, report.model_dump(mode="json"), principal.user_id):
                accepted += 1
        return {"ok": True, "accepted": accepted, "duplicates": len(body.reports) - accepted}

    @app.get("/reputation/reports")
    def list_crowd_reports(
        limit: int = Query(default=100, ge=1, le=500),
        _: Principal = Depends(require_roles("reviewer", "admin")),
    ) -> dict[str, Any]:
        items = repository.list_crowd_reports(limit)
        return {"items": items, "count": len(items)}

    @app.get("/api/seed/voiceshield-kz")
    def seed_manifest(_: Principal = Depends(authenticate)) -> dict[str, Any]:
        if not resolved_settings.ota_private_key_b64:
            raise HTTPException(status_code=503, detail="OTA signing key is not configured")
        seed_path = Path(__file__).resolve().parents[2] / "ml" / "seeds" / "voiceshield_seed_kz.json"
        try:
            seed = json.loads(seed_path.read_text(encoding="utf-8"))
            payload = {"schemaVersion": seed["SCHEMA_VERSION"], "version": seed["VERSION"], "publishedAt": seed.get("PUBLISHED_AT", "2026-07-19T00:00:00Z"), "rules": seed["RULES"]}
            from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
            private_key = Ed25519PrivateKey.from_private_bytes(base64.b64decode(resolved_settings.ota_private_key_b64))
            signature = base64.b64encode(private_key.sign(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))).decode("ascii")
        except (OSError, KeyError, ValueError) as error:
            raise HTTPException(status_code=503, detail="OTA seed manifest is unavailable") from error
        return {**payload, "signature": signature}

    @app.get("/api/number-feed/kz")
    def number_feed(_: Principal = Depends(authenticate)) -> dict[str, Any]:
        if not resolved_settings.ota_private_key_b64 or not resolved_settings.number_feed_path:
            raise HTTPException(status_code=503, detail="Number feed is not configured")
        try:
            feed = json.loads(resolved_settings.number_feed_path.read_text(encoding="utf-8"))
            payload = {"schemaVersion": "voiceshield.number-feed.v1", "version": str(feed["version"]), "publishedAt": str(feed["publishedAt"]), "entries": feed["entries"]}
            from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
            private_key = Ed25519PrivateKey.from_private_bytes(base64.b64decode(resolved_settings.ota_private_key_b64))
            signature = base64.b64encode(private_key.sign(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))).decode("ascii")
        except (OSError, KeyError, TypeError, ValueError) as error:
            raise HTTPException(status_code=503, detail="Number feed is unavailable") from error
        return {**payload, "signature": signature}

    @app.post("/mcp")
    def mcp_endpoint(
        payload: dict[str, Any], principal: Principal = Depends(authenticate)
    ) -> dict[str, Any]:
        """Authenticated, read-only MCP-compatible tool gateway.

        The allow-list is deliberately separate from case mutation and call
        control endpoints. MCP tools cannot end calls, send messages, access
        contacts, execute shell commands, or read arbitrary files.
        """
        repository.audit(principal.user_id, "mcp_request", {"method": payload.get("method")})
        return handle_mcp(payload, {
            "ok": repository.health_check(),
            "version": app.version,
            "apiVersion": "v1",
            "mlAvailable": resolved_model.available,
            "capabilities": service_capabilities(),
        })

    def livekit_token(room: str, identity: str, name: str) -> str:
        try:
            from livekit import api
        except ImportError as error:
            raise HTTPException(
                status_code=503, detail="LiveKit server dependency is not installed"
            ) from error
        token = api.AccessToken(
            resolved_settings.livekit_api_key, resolved_settings.livekit_api_secret
        )
        token = (
            token.with_identity(identity)
            .with_name(name)
            .with_grants(
                api.VideoGrants(
                    room_join=True, room=room, can_publish=True, can_subscribe=True
                )
            )
        )
        return token.to_jwt()

    @app.post("/calls/create")
    def create_call(principal: Principal = Depends(authenticate)) -> dict[str, Any]:
        if not livekit_configured():
            raise HTTPException(
                status_code=503, detail="LiveKit is not configured on this backend"
            )
        call_id = f"call_{uuid4().hex}"
        with livekit_lock:
            livekit_rooms[call_id] = {"createdBy": principal.user_id, "ended": False}
        participant_identity = f"{principal.user_id}-{uuid4().hex[:12]}"
        token = livekit_token(call_id, participant_identity, principal.user_id)
        repository.audit(principal.user_id, "voip_call_created", {"callId": call_id})
        return {
            "callId": call_id,
            "room": call_id,
            "serverUrl": resolved_settings.livekit_url,
            "token": token,
        }

    @app.post("/calls/{call_id}/join")
    def join_call(
        call_id: str, principal: Principal = Depends(authenticate)
    ) -> dict[str, Any]:
        if not livekit_configured():
            raise HTTPException(
                status_code=503, detail="LiveKit is not configured on this backend"
            )
        with livekit_lock:
            call = livekit_rooms.get(call_id)
        if not call or call.get("ended"):
            raise HTTPException(
                status_code=404, detail="VoIP call not found or already ended"
            )
        # A LiveKit room permits one connection per identity. A user may join the
        # same call from two devices, so each issued token needs a distinct ID.
        participant_identity = f"{principal.user_id}-{uuid4().hex[:12]}"
        token = livekit_token(call_id, participant_identity, principal.user_id)
        repository.audit(principal.user_id, "voip_call_joined", {"callId": call_id})
        return {
            "callId": call_id,
            "room": call_id,
            "serverUrl": resolved_settings.livekit_url,
            "token": token,
        }

    @app.post("/calls/{call_id}/end")
    async def end_call(
        call_id: str, principal: Principal = Depends(authenticate)
    ) -> dict[str, Any]:
        with livekit_lock:
            call = livekit_rooms.get(call_id)
            if not call:
                raise HTTPException(status_code=404, detail="VoIP call not found")
        if livekit_configured():
            try:
                from livekit import api

                async with api.LiveKitAPI(
                    resolved_settings.livekit_url,
                    resolved_settings.livekit_api_key,
                    resolved_settings.livekit_api_secret,
                ) as client:
                    await client.room.delete_room(api.DeleteRoomRequest(room=call_id))
            except ImportError as error:
                raise HTTPException(
                    status_code=503, detail="LiveKit server dependency is not installed"
                ) from error
            except api.ServerError as error:
                # LiveKit creates a room only when the first participant joins.
                # Ending a newly-created-but-never-connected call is still valid.
                if error.code != "not_found":
                    raise HTTPException(
                        status_code=502, detail="LiveKit could not terminate the protected call"
                    ) from error
            except Exception as error:
                raise HTTPException(
                    status_code=502, detail="LiveKit could not terminate the protected call"
                ) from error
        with livekit_lock:
            call["ended"] = True
        repository.audit(principal.user_id, "voip_call_ended", {"callId": call_id})
        return {"ok": True, "callId": call_id}

    @app.post("/analyze-transcript", response_model=TranscriptAnalysisResponse)
    def analyze_transcript(
        body: TranscriptRequest,
        principal: Principal = Depends(authenticate),
    ) -> dict[str, Any]:
        assessment = None
        if resolved_model.available:
            try:
                assessment = resolved_model.assess(body.transcript)
            except ModelUnavailable:
                assessment = None
        safe_transcript = redact_text(body.transcript)
        language = detect_language(body.transcript)
        repository.audit(
            principal.user_id,
            "transcript_analyzed",
            {"length": len(safe_transcript), "language": language},
        )
        rule_score = int(body.ruleAnalysis.get("score", 0)) if isinstance(body.ruleAnalysis.get("score", 0), (int, float)) else 0
        if assessment is None:
            disagreement = "unavailable"
        elif rule_score >= 60 and assessment["score"] < 40:
            disagreement = "rules_high_ml_low"
        elif rule_score < 40 and assessment["score"] >= 60:
            disagreement = "rules_low_ml_high"
        else:
            disagreement = "aligned"
        return {
            "ml": assessment,
            "mlAvailable": resolved_model.available,
            "disagreement": disagreement,
            "redactedTranscript": safe_transcript,
            "language": language,
        }

    @app.post("/training/tts")
    async def training_tts_endpoint(
        body: dict[str, Any], principal: Principal = Depends(authenticate)
    ) -> dict[str, Any]:
        """Generate synthetic speech for the training simulator only.

        The endpoint intentionally has no relationship with call capture or
        transcription. The provider key stays on the backend and the response
        exposes only a hashed voice identifier.
        """
        text = body.get("text")
        language = body.get("language", "RU")
        speed = body.get("speed", 0.95)
        voice_id = body.get("voiceId")
        if not isinstance(text, str) or not isinstance(language, str) or (voice_id is not None and not isinstance(voice_id, str)):
            raise HTTPException(status_code=422, detail="text and language are required")
        requested_voice = str(voice_id or training_tts.settings.voice_id).strip()
        if not training_tts.available or not requested_voice and not training_tts.settings.edge_tts_enabled:
            raise HTTPException(status_code=503, detail="Training voice provider is not configured")
        try:
            result = await training_tts.synthesize(text, language, float(speed), voice_id=voice_id)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        except TrainingTtsUnavailable as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        repository.audit(principal.user_id, "training_tts_generated", {
            "language": language.upper(),
            "textLength": len(text),
            "provider": result.provider,
            "voiceIdHash": result.voice_id_hash,
            "cached": result.cached,
        })
        return {
            "audioBase64": result.audio_base64,
            "mimeType": result.mime_type,
            "source": "synthetic_training",
            "provider": result.provider,
            "voiceIdHash": result.voice_id_hash,
            "modelId": result.model_id,
            "cached": result.cached,
        }

    @app.get("/training/voices")
    async def training_voices_endpoint(
        _: Principal = Depends(authenticate),
    ) -> dict[str, Any]:
        """Return selectable ElevenLabs and Microsoft Edge voices without exposing secrets."""
        if not training_tts.available:
            raise HTTPException(status_code=503, detail="Training voice provider is not configured")
        try:
            voices = await training_tts.list_voices()
        except TrainingTtsUnavailable as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        return {"items": [
            {"voiceId": voice.voice_id, "name": voice.name, "category": voice.category, "labels": voice.labels}
            for voice in voices
        ]}

    def process_audio_job(
        job_id: str, audio_bytes: bytes, suffix: str, actor: str
    ) -> None:
        repository.update_audio_job(job_id, "processing")
        try:
            transcript, confidence = resolved_transcriber.transcribe(
                audio_bytes, suffix
            )
            result: dict[str, Any] = {
                "transcript": transcript,
                "redactedTranscript": redact_text(transcript),
                "language": detect_language(transcript),
                "transcriptConfidence": confidence,
            }
            if resolved_model.available:
                result["ml"] = resolved_model.assess(transcript)
            repository.update_audio_job(job_id, "completed", result=result)
            repository.audit(
                actor,
                "audio_job_completed",
                {"jobId": job_id, "transcriptLength": len(transcript)},
            )
        except Exception as error:
            repository.update_audio_job(job_id, "failed", error=str(error))
            repository.audit(
                actor,
                "audio_job_failed",
                {"jobId": job_id, "reason": type(error).__name__},
            )

    @app.post(
        "/transcribe-audio",
        response_model=AudioJobResponse,
        status_code=status.HTTP_202_ACCEPTED,
    )
    async def transcribe_audio(
        background_tasks: BackgroundTasks,
        audio: UploadFile = File(...),
        principal: Principal = Depends(authenticate),
    ) -> dict[str, Any]:
        content_type = (audio.content_type or "").lower()
        if content_type not in ALLOWED_AUDIO_TYPES:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Unsupported audio type",
            )
        body = await audio.read(resolved_settings.max_audio_bytes + 1)
        if not body:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Audio file is empty"
            )
        if len(body) > resolved_settings.max_audio_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail="Audio file is too large",
            )
        job_id = str(uuid4())
        retained = body if resolved_settings.retain_audio else None
        repository.create_audio_job(job_id, content_type, retained, principal.user_id)
        suffix = Path(audio.filename or "audio.bin").suffix[:10] or ".bin"
        background_tasks.add_task(
            process_audio_job, job_id, body, suffix, principal.user_id
        )
        return {"jobId": job_id, "status": "queued"}

    @app.get("/audio-jobs/{job_id}", response_model=AudioJobResponse)
    def get_audio_job(
        job_id: str, _: Principal = Depends(authenticate)
    ) -> dict[str, Any]:
        job = repository.get_audio_job(job_id)
        if job is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Audio job not found"
            )
        return job

    @app.put("/cases/{case_id}")
    def sync_case(
        case_id: str, body: CasePayload, principal: Principal = Depends(authenticate)
    ) -> dict[str, Any]:
        if body.id != case_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Case ID does not match path",
            )
        payload = body.model_dump(mode="json")
        if principal.role == "analyst":
            payload = repository.preserve_workflow(
                payload, repository.get_case(case_id)
            )
        synced_at = repository.upsert_case(case_id, payload, principal.user_id)
        return {"ok": True, "remoteId": case_id, "syncedAt": synced_at}

    @app.get("/cases")
    def list_cases(
        case_status: str | None = Query(
            default=None, alias="status", pattern="^(new|reviewing|escalated|closed)$"
        ),
        limit: int = Query(default=100, ge=1, le=500),
        _: Principal = Depends(require_roles("reviewer", "admin")),
    ) -> dict[str, Any]:
        items = repository.list_cases(case_status, limit)
        return {"items": items, "count": len(items)}

    @app.get("/cases/{case_id}")
    def get_case(
        case_id: str, _: Principal = Depends(require_roles("reviewer", "admin"))
    ) -> dict[str, Any]:
        item = repository.get_case(case_id)
        if item is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Case not found"
            )
        return item

    @app.patch("/cases/{case_id}/workflow")
    def patch_workflow(
        case_id: str,
        body: WorkflowPatch,
        principal: Principal = Depends(require_roles("reviewer", "admin")),
    ) -> dict[str, Any]:
        patch = body.model_dump(exclude_none=True)
        try:
            updated = repository.patch_case(case_id, patch, principal.user_id)
        except CaseVersionConflict as error:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail=str(error)
            ) from error
        if updated is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Case not found"
            )
        return updated

    @app.get("/audit-log")
    def audit_log(
        case_id: str | None = Query(default=None, alias="caseId"),
        limit: int = Query(default=100, ge=1, le=500),
        _: Principal = Depends(require_roles("reviewer", "admin")),
    ) -> dict[str, Any]:
        items = repository.list_audit(case_id, limit)
        return {"items": items, "count": len(items)}

    return app
