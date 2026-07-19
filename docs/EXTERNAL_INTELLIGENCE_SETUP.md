# External Intelligence Setup

External providers are optional evidence sources. They do not replace local
rules, do not store raw inputs in VoiceShield, and do not end or block calls.

## Backend environment

Put keys only in `backend/.env` or a secret manager:

```dotenv
NUMVERIFY_API_KEY=
ABSTRACTAPI_PHONE_API_KEY=
PHISHTANK_API_KEY=
VOICESHIELD_EXTERNAL_INTEL_TIMEOUT_SECONDS=8
```

Configure one phone provider first. If both are present, VoiceShield tries
NumVerify and falls back to AbstractAPI when the first request fails.

PhishTank can be used without an app key with a lower rate limit. Supplying a
key is recommended for a shared backend. It checks URLs only, never phone
numbers.

## Endpoints

- `GET /intel/number?number=+77001234567`
- `POST /intel/url` with `{ "url": "https://example.com" }`

Both require the existing backend bearer token. Responses contain
`evidenceOnly: true`; the mobile app must show the provider result as an
additional signal rather than a verified caller identity.

## Privacy and cost controls

- API keys never use `VITE_*` variables and are never shipped in the APK.
- Number and URL inputs are sent only to the selected provider for the lookup;
  they are not persisted by the VoiceShield backend.
- Add client-side caching and rate limits before enabling this for many users.
- Firestore is not added as a second storage system: the existing encrypted
  crowd-report outbox and backend repository already provide the same MVP
  workflow without a new cloud credential.

## Offline anti-spoofing

The local AASIST ONNX artifact is exposed through `ml/aasist_inference.py` and
`VoiceShieldEngine.analyze_with_audio`. It is intentionally not wired into the
protected Live Shield path. Its score is uncalibrated for RU/KZ telephone
audio and must not trigger automatic call actions.
