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

For real deployment, store the encryption key and tokens in a cloud secret manager,
use managed PostgreSQL/object storage, terminate TLS at the ingress, enable backups,
and replace static tokens with an OIDC provider.

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

## Tests

```bash
backend/.venv/bin/pytest backend/tests
```
