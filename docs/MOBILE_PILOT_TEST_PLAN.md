# VoiceShield 1.1 Mobile Pilot Test Plan

This plan validates the actual protection paths on physical Android phones. It
does not claim that Android can universally expose the remote call party's
audio: each run records which permitted capture source was used.

## Test matrix

Run every scenario on at least one Xiaomi/HyperOS phone and one Samsung device:

| Area | Required cases | Evidence to save |
|---|---|---|
| Install/start | Fresh install, upgrade, restart, offline start | APK SHA-256, Android version, logcat crash buffer |
| Model | FastConformer download, interrupted download, checksum rejection, re-open after restart | Model name, download duration, free storage before/after |
| Speech | Kazakh, Russian, mixed KZ/RU, quiet speech, speakerphone, headset, noisy room | consented reference text, transcript, WER calculation |
| Capture | Live Caption, microphone fallback, shared WhatsApp/Telegram OGG, Xiaomi call recording | available source and explicit degraded-mode result |
| Risk | safe call, fake bank, OTP request, remote access, family emergency | expected risk, detected scheme, actions shown |
| Privacy | revoke consent, delete data, deny microphone, disable accessibility | UI state, absence of retained transcript/audio |
| Reliability | 30-minute active session, screen lock, incoming second call, battery saver | battery delta, thermal state, errors, restart/crash status |

## Acceptance gates

- No crash, ANR, or unhandled native-library error in five fresh launches.
- FastConformer model verifies by SHA-256 before use and remains available after
  process restart.
- Every capture route clearly identifies whether the transcript covers both
  parties, owner microphone only, or an imported recording.
- Record WER separately for Russian, Kazakh, and mixed conversations. Do not
  claim a quality number from synthetic or transfer-only data.
- Critical warning is reviewed against at least 100 consented safe samples
  before enabling any automatic high-risk action.

## Collected diagnostics

Never export raw audio, OTPs, full phone numbers, or notification text. Keep
only a consented test identifier, Android model/API, selected ASR engine,
language class, transcript latency, error code, and reviewer outcome.
