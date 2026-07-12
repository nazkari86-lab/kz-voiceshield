# VoiceShield Production Pilot Checklist

Status target: move 0.7.x from private beta to a controlled production pilot.

## Done in-repo

- Web workspace with transparent rule scoring, case library, dataset export, reviewer workflow, operations queue, backend adapter, and deploy configs.
- Android private-beta app with Live Caption path, Whisper JNI path, model verification, device-context signals, local storage, privacy controls, and release APK/AAB automation.
- FastAPI backend with Bearer roles, encrypted SQLite case storage, audit log, case sync, reviewer workflow, queued audio jobs, optional faster-whisper, ML comparison endpoint, readiness endpoint, Dockerfile, and deterministic tests.
- ML transfer pipeline with provenance gates, synthetic/external adapters, model card, training-data snapshot, and explicit caveats that transfer metrics are not real RU/KZ validation.

## Must finish outside local code

1. Deploy web app publicly.
   - Configure domain and HTTPS.
   - Set `VITE_VOICESHIELD_API_URL` only after backend auth and CORS are ready.
   - Keep `VITE_VOICESHIELD_API_TOKEN` out of public production builds; use OIDC/session exchange instead.

2. Deploy backend as a controlled service.
   - Store `VOICESHIELD_ENCRYPTION_KEY` and auth configuration in a secret manager.
   - Restrict CORS to the exact production web origin.
   - Put `/readyz` behind the load balancer health check.
   - Enable logs, metrics, error alerts, backup checks, and incident runbooks.

3. Replace single-instance storage.
   - Migrate cases/audit to managed PostgreSQL.
   - Move retained audio to encrypted object storage.
   - Replace process-local background tasks with Redis/Celery, SQS, or another durable queue.
   - Add disaster-recovery restore tests.

4. Replace static tokens.
   - Add OIDC/SSO and short-lived API tokens.
   - Model tenants/organizations before onboarding more than one partner.
   - Add reviewer comments, mentions, SLA timers, notifications, and explicit assignment ownership.

5. Validate audio.
   - Run server Whisper or approved STT in the target environment.
   - Measure WER separately for Russian, Kazakh, and mixed speech.
   - Test noisy calls, speakerphone, headset, and device-specific capture limits on physical Xiaomi/Samsung phones.
   - Add diarization only after the base ASR path is stable.

6. Build real RU/KZ evaluation data.
   - Collect consented, reviewer-labelled real scam and safe calls.
   - Keep synthetic/external data out of the held-out test set.
   - Report false positives per 100 safe calls, critical precision, scheme recall, calibration, and rules-vs-ML disagreement.
   - Do not use the transfer baseline for live decisions until real RU/KZ holdout results pass.

7. Prepare Android pilot distribution.
   - Run Play Console Internal Testing.
   - Document supported Android versions and degraded modes.
   - Verify model download, caption access, microphone fallback, notification access, battery settings, and data deletion on pilot devices.

8. Secure a pilot partner.
   - Best first partners: bank fraud team, mobile operator, contact center, consumer-protection group, or university cyber lab.
   - Define pilot scope, data-processing terms, reviewer workflow, emergency escalation path, and success metrics before collecting calls.
