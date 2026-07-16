from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any
from uuid import uuid4
from threading import Lock

from fastapi import BackgroundTasks, Depends, FastAPI, File, HTTPException, Query, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware

from .config import Principal, Settings
from .ml_service import ModelService, ModelUnavailable
from .models import AudioJobResponse, CasePayload, KnowledgeGraphPayload, TranscriptRequest, WorkflowPatch
from .repository import CaseVersionConflict, Repository
from .security import PayloadCipher, authenticate, require_roles
from .transcription import Transcriber, transcriber_from_env
from .privacy import detect_language, redact_text


ALLOWED_AUDIO_TYPES = {
    "audio/aac", "audio/flac", "audio/m4a", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav", "audio/webm", "audio/x-m4a",
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
    livekit_rooms: dict[str, dict[str, Any]] = {}
    livekit_lock = Lock()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        yield
        repository.close()

    app = FastAPI(title="KZ VoiceShield API", version="2.1.0", lifespan=lifespan)
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
        return {"ok": True, "version": app.version, "mlAvailable": resolved_model.available}

    @app.get("/readyz")
    def readiness() -> dict[str, Any]:
        database_ok = repository.health_check()
        return {
            "ok": database_ok,
            "version": app.version,
            "database": "ok" if database_ok else "failed",
            "mlAvailable": resolved_model.available,
            "serverSttConfigured": resolved_transcriber.__class__.__name__ != "DisabledTranscriber",
            "retainAudio": resolved_settings.retain_audio,
            "maxAudioBytes": resolved_settings.max_audio_bytes,
            "livekitConfigured": livekit_configured(),
            "capabilities": {
                "serverStt": resolved_transcriber.__class__.__name__ != "DisabledTranscriber",
                "serverVad": resolved_transcriber.__class__.__name__ == "FasterWhisperTranscriber",
                "liveKitVoip": livekit_configured(),
                "serverPiiRedaction": True,
                "trainedKazakhStreamingAsr": False,
                "deepfakeModel": False,
            },
        }

    def livekit_configured() -> bool:
        return all((resolved_settings.livekit_url, resolved_settings.livekit_api_key, resolved_settings.livekit_api_secret))

    def livekit_token(room: str, identity: str) -> str:
        try:
            from livekit import api
        except ImportError as error:
            raise HTTPException(status_code=503, detail="LiveKit server dependency is not installed") from error
        token = api.AccessToken(resolved_settings.livekit_api_key, resolved_settings.livekit_api_secret)
        return token.with_identity(identity).with_name(identity).with_grants(
            api.VideoGrants(room_join=True, room=room, can_publish=True, can_subscribe=True)
        ).to_jwt()

    @app.post("/calls/create")
    def create_call(principal: Principal = Depends(authenticate)) -> dict[str, Any]:
        if not livekit_configured():
            raise HTTPException(status_code=503, detail="LiveKit is not configured on this backend")
        call_id = f"call_{uuid4().hex}"
        with livekit_lock:
            livekit_rooms[call_id] = {"ended": False}
        token = livekit_token(call_id, principal.user_id)
        repository.audit(principal.user_id, "voip_call_created", {"callId": call_id})
        return {"callId": call_id, "room": call_id, "serverUrl": resolved_settings.livekit_url, "token": token}

    @app.post("/calls/{call_id}/join")
    def join_call(call_id: str, principal: Principal = Depends(authenticate)) -> dict[str, Any]:
        if not livekit_configured():
            raise HTTPException(status_code=503, detail="LiveKit is not configured on this backend")
        with livekit_lock:
            call = livekit_rooms.get(call_id)
        if not call or call["ended"]:
            raise HTTPException(status_code=404, detail="VoIP call not found or already ended")
        return {"callId": call_id, "room": call_id, "serverUrl": resolved_settings.livekit_url, "token": livekit_token(call_id, principal.user_id)}

    @app.post("/calls/{call_id}/end")
    def end_call(call_id: str, principal: Principal = Depends(authenticate)) -> dict[str, Any]:
        with livekit_lock:
            call = livekit_rooms.get(call_id)
            if not call:
                raise HTTPException(status_code=404, detail="VoIP call not found")
            call["ended"] = True
        repository.audit(principal.user_id, "voip_call_ended", {"callId": call_id})
        return {"ok": True, "callId": call_id}

    @app.post("/analyze-transcript")
    def analyze_transcript(
        body: TranscriptRequest,
        principal: Principal = Depends(authenticate),
    ) -> dict[str, Any]:
        try:
            assessment = resolved_model.assess(body.transcript)
        except ModelUnavailable as error:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
        rule_score = body.ruleAnalysis.get("score")
        disagreement: dict[str, Any]
        if isinstance(rule_score, (int, float)):
            bounded_rule = max(0, min(100, float(rule_score)))
            delta = round(float(assessment["score"]) - bounded_rule, 1)
            if delta >= 20:
                kind = "rules_low_ml_high"
            elif delta <= -20:
                kind = "rules_high_ml_low"
            else:
                kind = "aligned"
            disagreement = {"kind": kind, "ruleScore": round(bounded_rule, 1), "mlScore": assessment["score"], "delta": delta}
        else:
            disagreement = {"kind": "insufficient_rule_score", "ruleScore": None, "mlScore": assessment["score"], "delta": None}
        safe_transcript = redact_text(body.transcript)
        language = detect_language(body.transcript)
        repository.audit(principal.user_id, "transcript_analyzed", {"length": len(safe_transcript), "language": language, "disagreement": disagreement["kind"]})
        return {"ml": assessment, "disagreement": disagreement, "redactedTranscript": safe_transcript, "language": language}

    def process_audio_job(job_id: str, audio_bytes: bytes, suffix: str, actor: str) -> None:
        repository.update_audio_job(job_id, "processing")
        try:
            transcript, confidence = resolved_transcriber.transcribe(audio_bytes, suffix)
            result: dict[str, Any] = {"transcript": transcript, "redactedTranscript": redact_text(transcript), "language": detect_language(transcript), "transcriptConfidence": confidence}
            if resolved_model.available:
                result["ml"] = resolved_model.assess(transcript)
            repository.update_audio_job(job_id, "completed", result=result)
            repository.audit(actor, "audio_job_completed", {"jobId": job_id, "transcriptLength": len(transcript)})
        except Exception as error:
            repository.update_audio_job(job_id, "failed", error=str(error))
            repository.audit(actor, "audio_job_failed", {"jobId": job_id, "reason": type(error).__name__})

    @app.post("/transcribe-audio", response_model=AudioJobResponse, status_code=status.HTTP_202_ACCEPTED)
    async def transcribe_audio(
        background_tasks: BackgroundTasks,
        audio: UploadFile = File(...),
        principal: Principal = Depends(authenticate),
    ) -> dict[str, Any]:
        content_type = (audio.content_type or "").lower()
        if content_type not in ALLOWED_AUDIO_TYPES:
            raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Unsupported audio type")
        body = await audio.read(resolved_settings.max_audio_bytes + 1)
        if not body:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Audio file is empty")
        if len(body) > resolved_settings.max_audio_bytes:
            raise HTTPException(status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail="Audio file is too large")
        job_id = str(uuid4())
        retained = body if resolved_settings.retain_audio else None
        repository.create_audio_job(job_id, content_type, retained, principal.user_id)
        suffix = Path(audio.filename or "audio.bin").suffix[:10] or ".bin"
        background_tasks.add_task(process_audio_job, job_id, body, suffix, principal.user_id)
        return {"jobId": job_id, "status": "queued"}

    @app.get("/audio-jobs/{job_id}", response_model=AudioJobResponse)
    def get_audio_job(job_id: str, _: Principal = Depends(authenticate)) -> dict[str, Any]:
        job = repository.get_audio_job(job_id)
        if job is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio job not found")
        return job

    @app.put("/cases/{case_id}")
    def sync_case(case_id: str, body: CasePayload, principal: Principal = Depends(authenticate)) -> dict[str, Any]:
        if body.id != case_id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Case ID does not match path")
        payload = body.model_dump(mode="json")
        if principal.role == "analyst":
            payload = repository.preserve_workflow(payload, repository.get_case(case_id))
        synced_at = repository.upsert_case(case_id, payload, principal.user_id)
        return {"ok": True, "remoteId": case_id, "syncedAt": synced_at}

    @app.get("/cases")
    def list_cases(
        case_status: str | None = Query(default=None, alias="status", pattern="^(new|reviewing|escalated|closed)$"),
        assigned_to: str | None = Query(default=None, alias="assignedTo", min_length=1, max_length=120),
        limit: int = Query(default=100, ge=1, le=500),
        _: Principal = Depends(require_roles("reviewer", "admin")),
    ) -> dict[str, Any]:
        items = repository.list_cases(case_status, limit, assigned_to)
        return {"items": items, "count": len(items)}

    @app.get("/cases/{case_id}")
    def get_case(case_id: str, _: Principal = Depends(require_roles("reviewer", "admin"))) -> dict[str, Any]:
        item = repository.get_case(case_id)
        if item is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
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
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
        if updated is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
        return updated

    @app.get("/audit-log")
    def audit_log(
        case_id: str | None = Query(default=None, alias="caseId"),
        limit: int = Query(default=100, ge=1, le=500),
        _: Principal = Depends(require_roles("reviewer", "admin")),
    ) -> dict[str, Any]:
        items = repository.list_audit(case_id, limit)
        return {"items": items, "count": len(items)}

    @app.get("/knowledge-graph")
    def get_knowledge_graph(principal: Principal = Depends(authenticate)) -> dict[str, Any]:
        payload = repository.get_knowledge_graph(principal.user_id)
        return {"graph": payload, "found": payload is not None}

    @app.put("/knowledge-graph")
    def sync_knowledge_graph(body: KnowledgeGraphPayload, principal: Principal = Depends(authenticate)) -> dict[str, Any]:
        payload = body.model_dump(mode="json")
        graph_size = len(str(payload.get("graph", {})).encode("utf-8"))
        if graph_size > 2_000_000:
            raise HTTPException(status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail="Knowledge graph is too large")
        updated_at = repository.save_knowledge_graph(principal.user_id, payload)
        return {"ok": True, "serverUpdatedAt": updated_at, "schemaVersion": body.schemaVersion}

    return app
