# KZ VoiceShield 2.2.2

## Quality alignment

- Synchronized web, mobile, Android, backend, MCP, and knowledge-graph version
  metadata to `2.2.2`.
- Added a CI version-consistency check so a release cannot report different
  versions across clients and services.
- Added the reproducible offline ASVspoof/AASIST benchmark and compact metadata
  pack from the downloaded dataset.
- Kept AASIST as an offline evidence signal only. It does not change Live
  Shield risk, end calls, or replace the deterministic rules.
- Bundled AASIST and a sherpa-compatible Silero VAD model behind explicit,
  isolated native modules. Both accept copied frames only and expose readiness
  and scores to the offline quality lab.
- Added SHA-256/size verification with atomic model activation and native
  resource cleanup, so interrupted or corrupted model copies do not become
  active and repeated React Native reloads do not retain inference sessions.
- Removed an unused Number Shield import and restored the full mobile test
  suite.

## Verification

- Web unit tests: 52 passed.
- Mobile Jest tests: 111 passed.
- Backend tests: 30 passed.
- ML tests: 53 passed with the FastConformer environment.
- Browser smoke tests: 3 passed.
- Mobile TypeScript check: passed.

## Still outside this release

- Physical Xiaomi call-route, latency, memory, and thermal validation.
- Production RU/KZ telephone calibration for ASR and synthetic-voice scores.
- Physical Xiaomi validation of the Android ONNX modules, including latency,
  memory, thermal behavior, and model-score calibration for RU/KZ telephone
  audio.
- Public multi-user deployment with managed PostgreSQL, durable queues, OIDC,
  HTTPS, and abuse moderation.
