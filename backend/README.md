# VoiceShield Backend

Local-first remains the default. This service is optional and provides authenticated
ML comparison, encrypted case sync, reviewer workflow/audit APIs, and queued audio
transcription.

## Local run

```bash
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements-dev.txt
cp backend/.env.example backend/.env
# Fill the encryption key and replace the example token, then export the values.
set -a; source backend/.env; set +a
backend/.venv/bin/uvicorn backend.app.main:app --reload
```

Configure the web app separately:

```bash
VITE_VOICESHIELD_API_URL=http://localhost:8000
VITE_VOICESHIELD_API_TOKEN=<same development token>
```

## Training voices

The training simulator supports Microsoft Edge Neural voices through `edge-tts`
without an API key. The backend needs internet access; generated MP3 files are
cached locally. `ru-RU-SvetlanaNeural` and `kk-KZ-AigulNeural` are the defaults.
Set `VOICESHIELD_EDGE_TTS_ENABLED=false` only when this provider must be disabled.
If ElevenLabs is configured, its account catalog is shown alongside the Edge
voices and selected ElevenLabs voices take precedence.

`VITE_*` values are visible to browser users, so this token setup is only for local
or controlled deployments. A public deployment must place the web app behind OIDC/
SSO and exchange the user session for short-lived API tokens.

## Security defaults

- API endpoints except `/health` require Bearer auth.
- Roles: `analyst`, `reviewer`, `admin`.
- Case payloads, audit details, optional audio, and transcription results are encrypted
  before SQLite persistence.
- Original audio is not retained unless `VOICESHIELD_RETAIN_AUDIO=true`.
- Uploads are allowlisted by media type and size-limited.
- The service refuses to start without an encryption key and token map.
- The experimental transfer model returns `503` when no valid model bundle is configured.
- `GET /readyz` reports database reachability, API version, model availability, STT configuration,
  audio retention, max upload size, and capability flags for container/load-balancer health checks.
- Authenticated `GET /diagnostics` exposes operational metadata for the mobile setup
  screen without returning tokens, encryption keys, case data, or audio.
- Reviewer workflow updates can include `expectedUpdatedAt`; stale versions return
  `409` instead of silently overwriting another reviewer.

For real deployment, store the encryption key and tokens in a cloud secret manager,
use managed PostgreSQL/object storage, terminate TLS at the ingress, enable backups,
and replace static tokens with an OIDC provider.

## LiveKit VoIP prototype

The backend exposes `POST /calls/create`, `POST /calls/{callId}/join`, and
`POST /calls/{callId}/end`. It issues room tokens only when `LIVEKIT_URL`,
`LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` are configured. The LiveKit secret
is never part of the mobile app. These endpoints establish the secure token
boundary; a native LiveKit client and a separate consented STT/analyzer worker
must be deployed before real calls are enabled.

For a local-network prototype on a Mac, install LiveKit with `brew install livekit`,
configure `backend/.env` with a LAN address such as `ws://192.168.1.10:7880`, then
run `scripts/run-mac-voip-server.sh` and `scripts/run-mac-backend.sh` in separate
terminals. The Android app stores the backend URL and API token in Android Keystore.
The Mac firewall must allow TCP 7880/7881 and UDP 7882 on the same Wi-Fi network.
`http://<private-LAN-IP>:8000` is acceptable only for a trusted private Wi-Fi test.
Use TLS, a domain and TURN before exposing it outside the local network; never use
plain HTTP on public Wi-Fi or for production personal data.

## Audio transcription

The default transcriber fails explicitly because no STT engine is configured. To use
server Whisper:

```bash
backend/.venv/bin/pip install -r backend/requirements-stt.txt
export VOICESHIELD_WHISPER_MODEL=small
```

The upload endpoint returns `202` plus a job ID. Poll `GET /audio-jobs/{jobId}` until
the status is `completed` or `failed`. The web adapter does this automatically.
The built-in worker is process-local: interrupted jobs are marked failed on restart.
Use Redis/Celery, SQS, or another durable queue before running multiple API instances.

`GET /readyz` reports explicit capability flags. `serverVad` is true only for the
Faster-Whisper transcriber, while `trainedKazakhStreamingAsr` and `deepfakeModel`
remain false until real, versioned model artifacts are installed and verified.
Audio jobs and transcript analysis also return a redacted transcript and a
conservative `kk`/`ru`/`mixed` signal. The redacted value is the one suitable for
audit, export, and cloud model transmission.

## MCP tools

The authenticated `POST /mcp` endpoint is an MCP-compatible, read-only gateway
for the assistant. It supports `initialize`, `tools/list`, and `tools/call` for
the allow-listed transcript triage, app knowledge, redaction, and backend status
tools. It does not expose shell, arbitrary SQL, contacts, files, SMS sending, call
control, or raw audio. The mobile app uses the same local tool contract first and
can call the gateway explicitly when a backend token is configured. Only the MCP
method name is written to the audit log; raw tool arguments and transcript text
are not stored there.

## Reviewer workflow API

Reviewers and admins can list cases with `GET /cases`, read one case with
`GET /cases/{caseId}`, and update workflow state with `PATCH /cases/{caseId}/workflow`.
To prevent lost updates in a shared review queue, pass the case's current
`updatedAt` as `expectedUpdatedAt`:

```json
{
  "status": "reviewing",
  "assignedTo": "reviewer-2",
  "expectedUpdatedAt": "2026-07-11T10:00:00Z"
}
```

If another reviewer changed the case first, the API returns `409`.

## Tests

```bash
backend/.venv/bin/python -m pytest backend/tests
```
