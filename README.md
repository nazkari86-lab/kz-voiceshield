# KZ VoiceShield

[![CI](https://github.com/nazkari86-lab/kz-voiceshield/actions/workflows/ci.yml/badge.svg)](https://github.com/nazkari86-lab/kz-voiceshield/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[Privacy policy](PRIVACY.md)

KZ VoiceShield is a local-first anti-scam call review workspace for Kazakh and Russian conversations.

It helps a reviewer paste or capture a call transcript, score scam risk, inspect matched evidence, review the risk timeline, explore threat rules, simulate real-world scam scenarios, save cases, label outcomes, and export reports or datasets. Version 1.8.1 is a private-beta system: the web and Android apps can run locally, and the optional FastAPI backend supports authenticated case sync, reviewer workflow, audit logging, queued audio transcription, and experimental ML comparison. It is still not a production anti-fraud platform until public deployment, real RU/KZ validation, durable storage/queues, and production identity are in place.

## Core Workflow

### Web Workspace

1. Paste a transcript, upload a `.txt` file, import `.jsonl` cases, upload audio to a configured backend, or use browser live speech recognition.
2. Review the scam risk score, confidence, case ID, and matched signals.
3. Check evidence by category: impersonation, SMS/PIN request, money transfer, urgency, isolation, unofficial channel, remote access, family emergency, or investment scam.
4. Review the timeline, threat lab, simulator, saved case library, dataset panel, and operator playbook.
5. Label the case as unreviewed, true positive, false positive, or needs review.
6. Move the case through `new -> reviewing -> escalated -> closed`, assign a reviewer, set bank-contact/evidence flags, and export a report or evidence bundle.
7. Monitor the Operations queue for escalations, bank-contact backlog, stale open cases, and unsynced local cases.
8. Export a plain-text case report, JSONL training dataset, CSV audit table, or train/dev/test split.

### Mobile Workspace

The repository also includes a React Native Android prototype in `mobile/`:

- Kotlin native modules for call screening, accessibility transcript reading, overlay badge, audio capture, Whisper JNI, and model download.
- React Native live screen, setup wizard, bridge wrappers, and local RU/KZ scoring.
- Live on-device AI analysis runs the selected Gemma or public GGUF model alongside speech recognition, streams a structured risk/scheme/evidence/action result, and highlights rules-vs-AI disagreement.
- The AI assistant and live protection share one model context; generation is serialized, transcript updates are coalesced, and RAM-aware limits prevent oversized models from competing with live ASR.
- Context-aware mobile scoring: a suspicious transcript is strengthened when a banking, remote-access, or screen-sharing app is opened during an active protection session.
- Detected scam scheme, device-context evidence, and a 30-second anti-pressure pause for high-risk calls.
- Explicit privacy consent, session-gated caption access, Android Keystore case storage, secret redaction, and full local-data deletion.
- Privacy-preserving call verification, optional OTP/bank-notification type signals, encrypted trusted-family contact, and official bank callback directory.
- Pre-answer local Phone Reputation Score with device-bound number identifiers, complaints, trust/block lists, repeat/mass-dial detection, night rules, critical auto-blocking, and rule backup/import.
- On-device Scam Tools for pasted SMS, messenger text, phishing links, fake bank domains, shortened URLs, raw-IP links, punycode, and direct APK links.
- Android resources, manifest permissions, JNI/CMake scaffold, and `scripts/fetch-whisper.sh` for pulling `whisper.cpp`.

Run the mobile TypeScript check with:

```bash
cd mobile
npm install
npm run typecheck
```

Android Gradle builds require JDK 17. The checked-in Gradle wrapper lives in `mobile/android/gradlew`.

## Features

- Kazakh/Russian scam phrase detection with weighted threat rules.
- Scheme classification for fake-bank, safe-account, fake-police, investment, family-emergency, courier, remote-access, SIM-swap, eGov, marketplace, and messenger scams.
- Privacy-preserving device context: the Android app observes package names and notification risk types only during an active session; it does not upload audio, expose OTP values, retain raw phone numbers, or retain bank-screen content.
- Verified Whisper model download with a pinned size and SHA-256 digest, progress reporting, and corrupted-model cleanup.
- Verified on-device FastConformer KZ/RU INT8 download, with a pinned GitHub Release asset, SHA-256 verification, and Sherpa-ONNX runtime for Android phones.
- Optional on-device Gemma/GGUF analysis of the evolving live transcript without uploading audio or text; automatic analysis is debounced and can be disabled per device.
- Dataset provenance and reviewer trust state; untrusted imported cases are excluded from train/dev/test split exports.
- Reproducible multilingual transfer baseline in `ml/` using character TF-IDF and logistic regression, with an optional sentence-embedding mode, duplicate/provenance gates, and explicit rules-vs-ML disagreement output.
- Live browser speech-to-text when supported by the browser.
- Sample scenarios for bank takeover, AI voice family emergency, investment/crypto, delivery/customs, messenger takeover, victim-called setup, and safe calls.
- Explainable scoring with matched terms and category-level advice.
- Case ID, confidence score, immediate response checklist, and downloadable report.
- Multi-view workspace: Case Review, Timeline, Threat Lab, Simulator, Cases, Dataset, Playbook.
- Local case library stored in browser `localStorage`.
- Analyst labels and notes for dataset review.
- Reviewer workflow with statuses, assignees, audit log, decision history, incident timeline, and escalation flags.
- Backend reviewer workflow supports single-case retrieval and optimistic locking through `expectedUpdatedAt` on workflow patches.
- Evidence bundle export for handoff to bank fraud teams, internal supervisors, or incident responders.
- Operations dashboard for escalation queue, bank-contact queue, status counts, stale cases, and backend sync state.
- JSONL and CSV dataset exports for future ML/NLP training.
- Dataset quality checks for label balance, duplicates, false-positive review, average length, and schema version.
- Deterministic train/dev/test split export for baseline classifier experiments.
- Optional authenticated backend for queued server transcription, encrypted case sync, reviewer workflow/audit, and ML comparison without replacing local rule scoring.
- `.jsonl` bulk import for previously reviewed transcripts.
- Audio-file intake placeholder in local-only mode and `/transcribe-audio` upload when `VITE_VOICESHIELD_API_URL` is configured.
- Safe-context handling so ordinary text and defensive warnings stay at zero risk.
- Local-first private-beta mode with no required backend and no transcript upload unless the operator configures the optional API.

## Threat Coverage

- Bank/security-service impersonation.
- Police, regulator, prosecutor, or government pressure.
- SMS/OTP/PIN/CVV/IIN extraction.
- Safe-account, loan, cash-out, and urgent transfer scripts.
- Remote access and screen-sharing requests.
- WhatsApp/Telegram account takeover.
- AI voice or family emergency scams.
- Delivery/customs smishing and payment links.
- Investment, crypto, guaranteed-profit, romance, job, and marketplace scams.
- Reverse-vishing setup calls where the victim calls a fake number from a notice.

## Run Locally

```bash
npm install
npm run dev
```

Open the Vite URL printed in the terminal.

## Build

```bash
npm run build
```

## Lint

```bash
npm run lint
```

## Test

```bash
npm test
```

44 deterministic web scoring and dataset tests, 6 mobile scoring/privacy tests, 7 Kotlin privacy-classifier tests, 1 ML dataset-gate test, and 3 browser smoke tests.

## Deploy

The repository includes production-ready SPA fallbacks for both Vercel and Netlify:

- `vercel.json` rewrites routes to `index.html`.
- `netlify.toml` builds with `npm run build` and publishes `dist`.
- `.env.example` configures the optional backend URL and controlled-deployment token.

## Optional Backend Contract

When `VITE_VOICESHIELD_API_URL` is set, the frontend keeps rule scoring local but can call:

- `POST /analyze-transcript` with `{ transcript, ruleAnalysis }`, returning `{ ml }` or the ML object directly.
- `POST /transcribe-audio` with multipart field `audio`, returning `202` with `{ jobId, status: "queued" }`.
- `GET /audio-jobs/:id` for queued transcription status and results.
- `PUT /cases/:id` with the serialized case schema, returning `{ ok, remoteId?, syncedAt? }`.
- `GET /cases`, `GET /cases/:id`, `PATCH /cases/:id/workflow`, and `GET /audit-log` for reviewer/admin operations.
- `GET /readyz` for deploy health checks, including database status, model availability, STT configuration, audio retention, and upload limit.

The ML object is normalized as `{ verdict: "fraud" | "safe" | "needs_review", score, confidence, model, embeddingModel?, signals[] }`. The UI shows disagreements such as "rules high, ML low" instead of replacing the rule score.

The server implementation and deployment notes are in [`backend/README.md`](backend/README.md). Static browser tokens are only for local or controlled testing; an internet-facing deployment requires OIDC/SSO and short-lived tokens.
The remaining production-pilot work is tracked in [`docs/PRODUCTION_PILOT_CHECKLIST.md`](docs/PRODUCTION_PILOT_CHECKLIST.md).

## CI

GitHub Actions runs dependency audits, lint, unit tests, production builds, Playwright browser smoke tests, Kotlin unit tests, and signed APK/AAB builds.

## Product Notes

This is a private beta, not a final fraud-detection engine. The next production steps are:

- deploy the web app and backend publicly with HTTPS, domain, CORS, and secrets configured;
- deploy server Whisper or another approved STT provider and validate RU/KZ WER on real calls;
- migrate encrypted SQLite storage to managed PostgreSQL, object storage, and a durable audio queue for multi-instance use;
- validate ML/NLP scoring on a real reviewer-labelled RU/KZ holdout;
- replace controlled-deployment tokens with OIDC/SSO and short-lived sessions;
- run Play Console Internal Testing on physical Xiaomi/Samsung devices;
- secure a bank, operator, contact-center, or consumer-protection pilot partner;
- add official reporting/export formats for banks or consumer-protection teams.

## Mobile 1.1.0

The Android private beta adds a FastConformer KZ/RU speech option. The model is
an external 132 MB GitHub Release asset so it can be updated independently from
the APK; the app checks its SHA-256 before activation. The reproducible Android
build downloads the matching Sherpa-ONNX JNI release using a pinned checksum.
See [`docs/MOBILE_PILOT_TEST_PLAN.md`](docs/MOBILE_PILOT_TEST_PLAN.md) for the
required Xiaomi/Samsung validation matrix before a broader pilot.

## Mobile 1.7.0

The live protection screen can use the same selected local model as the AI
assistant. During an active session, speech recognition remains the transcript
source while the LLM periodically analyzes a bounded transcript snapshot and
shows its risk, suspected scheme, evidence, immediate action, and disagreement
with deterministic rules. Only one LLM context is kept in memory. Devices with
insufficient RAM are asked to choose a smaller model instead of attempting an
unsafe concurrent load.

## Mobile 1.8.1

The Android AI assistant adds a secure cloud API hub for OpenAI, Anthropic,
Gemini, Groq, Cerebras, OpenRouter, xAI, DeepSeek, and Mistral. Provider model
lists are loaded dynamically, OpenRouter exposes free/paid filtering, and the
selected API model is shared by assistant chat and Live AI analysis. Credentials
are encrypted through Android Keystore, the key-entry screen blocks capture,
and plaintext HTTP is disabled. See [`docs/CLOUD_AI_SECURITY.md`](docs/CLOUD_AI_SECURITY.md)
for the implemented capability and threat-model boundary.

## Tech Stack

- React 19
- Vite
- TypeScript
- Oxlint
- Lucide icons
