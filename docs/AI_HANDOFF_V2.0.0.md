# KZ VoiceShield: Full AI Handoff and v2.0.0 Recovery Baseline

**Purpose.** Give this file, the repository, and the current `main` branch to a
new AI before any work. It explains what was built, which regressions occurred,
why the project was restored, and how to continue without damaging Live Shield.

**Authoritative baseline.** The active tree at `main` commit `43ab4e1` is
content-identical to Git tag `v2.0.0` (`9544a3c`). The extra restore commit is
intentional: it preserves Git history while making the checked-out source match
the v2.0.0 baseline. Only releases/tags after v2.0.0 were deleted from GitHub.

## 1. Handoff prompt for another AI

Use this prompt verbatim with the repository attached:

> You are continuing KZ VoiceShield from the verified v2.0.0 baseline. Read
> `docs/AI_HANDOFF_V2.0.0.md`, `README.md`, `docs/CAPABILITY_MATRIX.md`, and
> the current code before editing. Treat `AudioCaptureModule.kt`,
> `WhisperModule.kt`, `WhisperContext.kt`, `FastConformerContext.kt`,
> `mobile/src/hooks/useWorkspace.ts`, `mobile/src/components/LiveView.tsx`, and
> `mobile/src/bridge/WhisperBridge.ts` as a protected Live Shield contract.
> Do not alter those files or their call ordering unless the user explicitly
> authorizes it and a physical Xiaomi test plan accompanies the change. Build
> new features as isolated modules. Never claim a SIM-call audio feature works
> until it is tested on a physical Android phone. Keep rule scoring as the live
> safety decision; experimental ML/LLM output may only add explanation or show
> disagreement.

Before coding, run:

```bash
git status --short
git diff --exit-code v2.0.0 HEAD --
npm run lint && npm test && npm run build
(cd mobile && npm run typecheck && npm test -- --run)
python3 -m pytest -q backend/tests
```

The first diff command must print nothing. If it does not, stop and identify
the intentional change before continuing.

## 2. Product goal and truthful status

### Goal

KZ VoiceShield is a privacy-first Kazakh/Russian anti-fraud assistant. It should
help people recognize pressure and impersonation scams during calls, messages,
voice notes, and links; provide clear safe actions; support family protection;
and give analysts an auditable workflow. It is not allowed to pretend that it
can access Android's protected internal cellular-call audio when it cannot.

### Current status: private beta, not production

Implemented in source does **not** mean production-ready or physically proven.

| Area | Current v2.0.0 state |
| --- | --- |
| Rule-based KZ/RU fraud scoring | Implemented and the live safety baseline |
| Transcript, evidence, timeline, report/export, simulator | Implemented |
| Android Live Shield UI and microphone/ASR path | Implemented; needs physical Xiaomi regression validation |
| FastConformer KZ/RU local ASR | Implemented as verified external model download |
| Whisper model catalog/download flow | Implemented; large-model device behavior needs real-device validation |
| Local/cloud AI assistant | Implemented, cloud use requires consent and API key |
| Knowledge graph | Static, versioned in-app graph is implemented; mutable encrypted graph/sync is not |
| VoIP | Client and backend token/session scaffold implemented; not deploy-ready/end-to-end proven |
| Backend review workflow | FastAPI + encrypted SQLite + roles/audit implemented for private beta |
| ML classifier | Experimental shadow comparison only; not qualified for live decisions |
| Deepfake detection | Experimental heuristic/checkpoint path; no validated production model |
| Multi-user production service | Not complete: needs managed DB, queue, identity, monitoring, retention controls |

## 3. Non-negotiable Live Shield boundary

### Protected files

Do not change these as part of unrelated work:

1. `mobile/android/app/src/main/java/kz/voiceshield/AudioCaptureModule.kt`
2. `mobile/android/app/src/main/java/kz/voiceshield/WhisperModule.kt`
3. `mobile/android/app/src/main/java/kz/voiceshield/WhisperContext.kt`
4. `mobile/android/app/src/main/java/kz/voiceshield/FastConformerContext.kt`
5. `mobile/android/app/src/main/cpp/whisper_jni.cpp`
6. `mobile/src/bridge/WhisperBridge.ts`
7. `mobile/src/hooks/useWorkspace.ts` functions `prepareWhisper`,
   `startListening`, `switchToMicrophoneFallback`, and `stopListening`
8. `mobile/src/components/LiveView.tsx`

### Why this boundary exists

Android normally does not provide a third-party app the remote party's raw SIM
call downlink. The fallback is to use microphone input while the phone is on
speakerphone, or Android Live Caption/accessibility when the user has enabled a
compatible source. This is an OS and device-policy boundary, not something that
should be bypassed with root, Magisk, hidden APIs, or deceptive permissions.

The protected pipeline is:

```text
AudioRecord(MIC, 16 kHz mono)
  -> AudioPreprocessor
  -> bounded audio queue in WhisperModule
  -> WhisperContext or FastConformerContext
  -> VS_WHISPER_TRANSCRIPT event
  -> useWorkspace transcript state
  -> transcript enhancer + rule scorer + UI
```

Its current design deliberately keeps model inference out of the `AudioRecord`
reader thread and uses a bounded queue. The UI exposes the expected limitation:
microphone capture may hear only acoustically available speaker audio, not an
internal two-way call stream.

### Required procedure for any future Live Shield edit

1. Obtain explicit user approval for the exact protected files.
2. Write a reproduction case and a rollback point first.
3. Change one layer only: capture, queue, native ASR, bridge, or UI.
4. Run unit/type/build checks.
5. Install on a physical Xiaomi and test a 30-60 second speakerphone SIM call.
6. Verify: transcript appears, Stop works, app remains responsive, speaker
   audio remains audible, and no crash occurs after the first decode.
7. If any step fails, restore the previous verified files before doing unrelated
   work. Do not bundle Live Shield experiments with graph, VoIP, UI, or ML work.

## 4. Version history, additions, and failures

This is a concise release history based on Git tags and commits. It separates
features from later user-observed regressions.

| Version/range | Major additions | Known failure or caveat |
| --- | --- | --- |
| `0.1.0` | Initial Android CI/APK pipeline | Early prototype |
| `0.3.0` | Privacy, security, call-context hardening | Not production validation |
| `0.4.0-0.5.0` | Dataset/ML transparency and transfer baseline classifier | Metrics were transfer/synthetic, not real RU/KZ call quality |
| `0.6.0-0.7.0` | Secure review backend, audio jobs, number reputation, scam tools | Private-beta backend only |
| `0.9.0-0.9.5` | QR/OCR, voice trainer, emergency flow, forwarded voice-message transcription | Android native codecs/device formats need physical testing |
| `0.9.6` | Whisper initialized before live capture | This fixed an earlier initialization ordering issue |
| `1.0.0-1.0.3` | Call protection hardening, audio fallbacks, Xiaomi setup, permission checks | First RN builds had a crash class from missing native libraries, including `libreact_featureflagsjni.so`; APK contents had to be verified, not just source |
| `1.1.0` | FastConformer KZ/RU local ASR option | External model download and device capacity must be validated |
| `1.2.0-1.2.2` | More model downloads/recovery | User observed failed/never-ready downloads; later ready-state and lifecycle fixes followed |
| `1.3.0-1.5.1` | Training practice, Gemma download, GGUF runtime, demo, download recovery | Gemma/runtime reliability was not uniform across phones |
| `1.6.0-1.6.1` | Local model catalog and isolated Gemma process | Gemma had crash risk; isolation was added to reduce blast radius |
| `1.7.0` | Local LLM analysis beside ASR, rules-vs-AI disagreement | LLM must not replace rule decisions or compete unsafely for RAM |
| `1.8.0-1.8.1` | Cloud AI providers and consent gate | Cloud credentials are sensitive; no cloud processing without explicit consent |
| `1.9.0-1.9.6` | Protected dialer, KSC2 text correction, language selection, Whisper model lifecycle fixes, full localization pass | User reported `1.9.0` as a comparatively working Live Shield baseline. KSC2 is text/ASR support, not proof that audio capture is fixed. |
| `2.0.0` | Consolidated private-beta release: default dialer, family/number protection, graph, backend, VoIP scaffold, AI capabilities | It is the selected restore baseline. It still needs physical regression and production infrastructure. |
| Removed `2.1.0` | Small updates to knowledge-context labels and VoIP setup | Released after the chosen baseline; not retained |
| Removed `2.1.1` | Changed Whisper streaming to try non-blocking capture | Not retained because Live Shield was a protected working path |
| Removed `2.1.2` | Changed capture/Whisper/Waveform flow to address stalls | User reported continued freezing after seconds and inability to stop recording |
| Removed `2.1.3` | Restored two Live Shield files to v2.0.0 source and added a guard | Still not a physical Xiaomi proof; user chose full return to v2.0.0 |

### Why versions after 2.0.0 were removed

The user observed Live Shield freezes on their Xiaomi after a few seconds of
recording. The symptom appeared around the first ASR decode window. The exact
single root cause was **not proven** because no attached physical device and
logcat trace were available. It was incorrect to keep modifying capture and
streaming code while simultaneously adding unrelated functionality.

Therefore the project was restored to the selected `v2.0.0` source tree and the
following public artifacts were removed:

- GitHub releases `v2.1.0`, `v2.1.1`, `v2.1.2`, `v2.1.3`
- GitHub releases `android-v2.1.0`, `android-v2.1.1`, `android-v2.1.2`,
  `android-v2.1.3`
- Matching remote tags and local `2.1.3` APK build artifact

Historical Git commits remain for forensic comparison. They are not active in
the current source or published as releases. Do not cherry-pick their Live
Shield changes.

## 5. Current architecture and responsibility map

### Root web workspace

| Path | Responsibility |
| --- | --- |
| `src/App.tsx` | Web application composition and workspace navigation |
| `src/scoring.ts` | Deterministic rule engine, evidence, timeline, report/CSV/JSONL export contract |
| `src/apiClient.ts` | Optional backend adapter; local-first behavior remains available |
| `src/components/*.tsx` | Web case review, operations, timeline, dataset, simulator, playbook and evidence UI |
| `e2e/smoke.spec.ts` | Browser smoke paths |
| `docs/CAPABILITY_MATRIX.md` | Truthful implemented/partial/not-implemented capability inventory |
| `docs/PRODUCTION_PILOT_CHECKLIST.md` | Deployment and pilot prerequisites |

### Mobile TypeScript/React Native

| Path | Responsibility |
| --- | --- |
| `mobile/src/App.tsx` | Mobile tab/navigation composition |
| `mobile/src/hooks/useWorkspace.ts` | Central mobile session state, capture orchestration, scoring, case save/export; **protected where it touches Live Shield** |
| `mobile/src/scoring.ts` | Mobile deterministic fraud scoring |
| `mobile/src/components/LiveView.tsx` | Live Shield presentation and user controls; **protected** |
| `mobile/src/bridge/WhisperBridge.ts` | Typed JS bridge/events for ASR and microphone capture; **protected** |
| `mobile/src/data/whisperModels.ts` | Pinned ASR catalog, SHA-256, storage/RAM suitability and automatic recommendation |
| `mobile/src/data/modelManifest.ts` | Honest app/ML/data status displayed in the app |
| `mobile/src/data/knowledgeGraph.ts` | Static versioned graph: app, features, datasets, models, advice and relationships |
| `mobile/src/data/cloudAiProviders.ts` | Provider metadata/capabilities, not API secrets |
| `mobile/src/services/cloudAiClient.ts` | Consent-gated cloud AI requests with redaction boundary |
| `mobile/src/services/voipClient.ts` | Calls the backend create/join/end VoIP endpoints; no embedded server secret |
| `mobile/src/components/VoipCallView.tsx` | LiveKit room screen and call lifecycle UI |
| `mobile/src/components/LLMAssistantView.tsx` | Local/cloud AI assistant UI |
| `mobile/src/components/LocalModelCatalogView.tsx` | Public local GGUF catalog/download interface |
| `mobile/src/components/CloudProviderCatalogView.tsx` | BYOK provider configuration UI |
| `mobile/src/components/NumberShieldView.tsx` | Local number reputation, notes and family-protection UI |
| `mobile/src/components/SmsScannerView.tsx` | Explicit user-driven SMS/link analysis |
| `mobile/src/components/VoiceMessageView.tsx` | Shared/selected voice-message transcription flow |
| `mobile/src/components/SimulatorView.tsx` | Scam-training scenarios |
| `mobile/src/utils/transcriptEnhancer.ts` | Safe normalization and transparent transcript derivations |
| `mobile/src/utils/kazakhIntelligence.ts` | KZ/RU linguistic/fraud context helpers |
| `mobile/src/utils/liveAiAnalysis.ts` | Structured second-stage AI analysis; advisory only |
| `mobile/src/hooks/useOnDeviceAiRuntime.ts` | Local LLM runtime lifecycle and RAM-aware controls |
| `mobile/src/hooks/useLiveAiAnalysis.ts` | Debounced live transcript analysis controller |
| `mobile/src/I18nContext.tsx`, `mobile/src/i18n/ru.ts`, `mobile/src/i18n/kz.ts` | Current RU/KZ localization layer |

### Android native Kotlin/C++

| Path | Responsibility |
| --- | --- |
| `AndroidManifest.xml` | Declares only needed Android permissions, Telecom services, capture service and share intents |
| `MainActivity.kt` | React Native startup plus text/audio share intent intake |
| `MainPackage.kt` | Registration point for every Kotlin React Native module |
| `AudioCaptureModule.kt` | `AudioRecord` lifecycle, 16 kHz microphone chunks, route status; **protected** |
| `WhisperModule.kt` | Bounded queue, ASR context lifecycle, transcript event emission; **protected** |
| `WhisperContext.kt` and `whisper_jni.cpp` | JNI wrapper for local Whisper inference; **protected** |
| `FastConformerContext.kt` | Sherpa-ONNX KZ/RU offline recognizer; **protected** |
| `AudioPreprocessor.kt` | Lightweight PCM preprocessing used by live capture; **protected by dependency** |
| `ModelDownloader.kt` | Verified download/resume/hash/activation of ASR and GGUF model files |
| `VoiceMessageModule.kt` | File picker, decode/resample and one-shot transcription for shared audio |
| `CallScreeningService.kt`, `CallScreeningModule.kt` | Official Android call-screening integration and user-authorized actions |
| `VoiceShieldInCallService.kt`, `VoiceShieldCallActivity.kt`, `VoiceShieldCallController.kt` | Official default-dialer/InCallService UI and call controls; cannot bypass Android call-audio policy |
| `PhoneReputationStore.kt`, `PhoneReputationPolicy.kt` | Device-local encrypted number reputation rules/decisions |
| `ContactsModule.kt` | Consent-based contacts import for family protection |
| `SmsScannerModule.kt` | Explicit user-authorized SMS scanning |
| `SecureStorageModule.kt`, `EncryptedLocalStore.kt` | Android Keystore-backed local secret/case storage |
| `OverlayService.kt`, `OverlayModule.kt` | User-authorized protection overlay/foreground service |
| `AccessibilityReaderService.kt`, `AccessibilityModule.kt` | Optional accessibility-caption path; user must enable it |
| `NotificationSignalService.kt`, `NotificationAccessModule.kt` | Notification risk-type signals without keeping OTP values |
| `ImageScanModule.kt` | ML Kit OCR/QR ingestion then local risk analysis |
| `LLMInferenceModule.kt`, `GemmaInferenceService.kt`, `GemmaRuntimePolicy.kt` | Local LLM inference in an isolated process and policy guard |
| `SileroVADModule.kt` | Voice-activity detection module; validate model/runtime before claiming production use |
| `DeepfakeDetectorModule.kt` | Experimental deepfake interface; no production-valid anti-spoof model is bundled |
| `LiveAlertModule.kt`, `LiveAlertNotifier.kt` | Alerts/vibration/critical warning delivery |
| `AppRegistry.kt`, `ProtectionSessionState.kt` | Cross-module session state and React event bridge |

### Backend and ML

| Path | Responsibility |
| --- | --- |
| `backend/app/factory.py` | FastAPI routes, optional ML comparison, audio jobs, encrypted case workflow, audit and VoIP token endpoints |
| `backend/app/config.py` | Environment configuration, principals, encryption and LiveKit settings |
| `backend/app/security.py`, `backend/app/privacy.py` | Auth, payload encryption, PII redaction/language helpers |
| `backend/app/repository.py` | Encrypted SQLite cases, workflow, audit records, queued audio metadata |
| `backend/app/transcription.py` | Server STT abstraction; disabled until configured |
| `backend/app/ml_service.py` | Experimental ML model loading/assessment |
| `backend/tests/` | API, privacy and ML service tests |
| `ml/dataset.py`, `ml/dataset_registry.py` | Dataset schema/provenance/duplicate and split safeguards |
| `ml/train_baseline.py`, `ml/evaluate_models.py` | Reproducible baseline training/evaluation |
| `ml/prepare_ksc2_language_pack.py`, `ml/prepare_kazakh_linguistic_pack.py` | Generate compact app-safe linguistic assets; do not bundle raw corpus data |
| `ml/finetune_gemma.py`, `ml/prepare_finetune.py` | Future fine-tuning preparation, not proof of a shipped model |

## 6. What is already present but incomplete

### Knowledge graph

`mobile/src/data/knowledgeGraph.ts` already contains a static graph with
versioned nodes and edges for app features, ASR/LLM/VAD/deepfake models,
datasets, operating advice, and physical-device diagnostic status. It can answer
facts that are encoded in the graph, such as app version and model role.

It is **not** yet a complete personal knowledge system: no encrypted mutable
user notes, no durable graph database, no conflict-aware sync, no analytics
derived from verified device errors, and no trustworthy automatic source update.

### VoIP

The backend has `POST /calls/create`, `POST /calls/{id}/join`, and
`POST /calls/{id}/end`. It generates short-lived LiveKit tokens only when
`LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` are configured. The
app has a LiveKit room UI. This is a correct architectural scaffold, not a
working public calling service yet:

- no deployed LiveKit server/TURN configuration is committed;
- room state is in backend memory, so it is not durable or horizontally safe;
- there is no invitation/discovery flow for a second participant;
- no billing, rate limiting, abuse protection, observability or call-retention
  policy exists;
- VoIP audio is not silently wired into Live Shield. That must be explicit and
  separately tested, with clear consent and a bounded analysis pipeline.

### ML and deepfake

The ML baseline is character TF-IDF plus logistic regression. It is intentionally
shadow-only: compare ML verdict/score with deterministic rules and present
disagreement. The current data snapshot includes transfer/synthetic sources;
it does not contain enough consented reviewer-labelled RU/KZ real calls to
justify automatic decisions.

Deepfake/VAD interfaces and dataset references exist, but a validated Android
ONNX anti-spoof detector is not bundled. Do not market experimental heuristics
or a converted checkpoint as real deepfake protection.

## 7. Safe roadmap from v2.0.0 without touching Live Shield

All work below must avoid the protected files in section 3 unless separately
authorized.

### Priority 1: make existing foundations honest and useful

1. **Knowledge graph v2, isolated module.** Add encrypted local storage for
   user-created notes, links and saved troubleshooting observations. Keep the
   base graph read-only and versioned; store user overlays separately. Add import,
   export, schema migration and conflict-safe merge. Never let AI silently alter
   canonical facts.
2. **App self-knowledge.** Generate an immutable `build-info.json` during the
   build with version, git commit, build time, enabled modules, model catalog
   revision and known limitations. Feed it into the knowledge graph and assistant
   context so it answers version/capability questions truthfully.
3. **Model health registry.** On model download, save verified hash, size,
   ready state, last load error and device capacity result in encrypted local
   storage. Show exact diagnostic reasons instead of a vague non-ready state.
4. **Transcript-quality review.** Keep raw transcript immutable, store
   normalization/correction as derived text, expose corrections and let the user
   accept/reject them. Never overwrite evidence with an LLM correction.
5. **Dataset governance.** Add quality dashboard counts, duplicate clusters,
   language balance, source/license/provenance, reviewer agreement and frozen
   train/dev/test manifests. Only real consented, redacted and reviewed cases
   may enter a future RU/KZ evaluation set.

### Priority 2: finish VoIP as an independent product flow

1. Deploy LiveKit with TLS and TURN, using a dedicated environment.
2. Move room state from memory into the backend database with expiry and audit.
3. Add a signed invite/deep-link flow, join permissions, rate limits, reporting
   and abuse controls.
4. Add monitoring: connection success, ICE/TURN failures, token errors,
   call duration and crash telemetry without audio/transcript retention by
   default.
5. Add explicit opt-in "analyze this VoIP call" mode. Its audio ingestion must
   be a new tested pipeline, not a modification of SIM Live Shield. Start with
   post-call/manual transcript analysis before live streaming.
6. Test two real devices on Wi-Fi, LTE, NAT-restricted network and headset/speaker
   paths before presenting it as working.

### Priority 3: real ML quality, still advisory

1. Create a consent and redaction protocol with human review.
2. Build a real RU/KZ call holdout split that never overlaps training data.
3. Measure precision/recall, FPR, calibration, per-language errors and fraud
   scheme coverage. Store test manifests and reproducible model hashes.
4. Add embedding retrieval only after evaluating it on that holdout. Use it to
   retrieve similar reviewed examples and evidence, not to directly terminate
   a user's call.
5. Keep rule score, ML score and LLM explanation separate. A disagreement is a
   signal for caution/review, not a reason to hide a deterministic warning.

### Priority 4: production backend

1. PostgreSQL with encryption strategy, migrations and backups.
2. Object storage with per-case retention controls for opt-in audio/evidence.
3. Durable job queue and worker for STT/ML, idempotency keys and retry policy.
4. OIDC/SSO, short-lived sessions, role enforcement, audit events and key rotation.
5. HTTPS, CORS allowlist, secrets manager, rate limits, alerts, structured logs
   and incident runbook.
6. Reviewer assignment, escalation SLA, bank-contact workflow and evidence bundle
   formats agreed with real partner organizations.

## 8. External blockers and test matrix

| Blocker | Why code alone cannot solve it | Required evidence |
| --- | --- | --- |
| SIM-call remote audio | Android/MIUI protects cellular downlink | Xiaomi test: speakerphone, captions, Bluetooth, different Android versions |
| Real ASR quality | Needs representative RU/KZ call speech/noise | WER/CER report by language and device condition |
| Fraud classifier quality | No real consented labeled RU/KZ holdout | Reviewer-labelled holdout metrics and calibration |
| Deepfake protection | Needs validated model/benchmark/mobile runtime | ASVspoof-style evaluation plus real-device inference latency |
| VoIP | Needs deployed LiveKit/TURN and two devices | End-to-end call matrix, token/ICE failure telemetry |
| Multi-user workflow | Needs real identity, managed DB and retention policy | Security review and pilot workflow acceptance |

## 9. Verification commands and release checklist

### Deterministic checks

```bash
npm run lint
npm test
npm run build
(cd mobile && npm run typecheck && npm test -- --run)
python3 -m pytest -q backend/tests
(cd mobile/android && ./gradlew :app:assembleRelease)
```

For a candidate APK also verify the actual artifact, not only source:

```bash
aapt dump badging mobile/android/app/build/outputs/apk/release/app-release.apk
apksigner verify --verbose --print-certs mobile/android/app/build/outputs/apk/release/app-release.apk
unzip -l mobile/android/app/build/outputs/apk/release/app-release.apk | rg 'libreact_featureflagsjni|libsherpa-onnx-jni'
```

### Physical Xiaomi gate for a release that touches Live Shield

1. Fresh install over a clean previous version and confirm all requested
   permissions/settings explicitly.
2. Prepare a verified ASR model and confirm the UI reports it ready.
3. Test microphone transcription outside a call.
4. Test 30-60 second normal SIM speakerphone call: transcript, score, Stop,
   UI responsiveness and speaker output.
5. Test the same with Bluetooth and confirm the app gives a limitation notice
   rather than silently claiming capture.
6. Repeat after app background/foreground and after model switching.
7. Collect logcat and device/model/MIUI version for any failure.

No release may be called fixed or production-ready until this gate passes.

## 10. Important factual statements for future AI responses

- Say **"implemented in private beta"**, not "working for all phones", unless
  physical tests prove it.
- Say **"experimental shadow ML"**, not "trained fraud AI", until real RU/KZ
  reviewer-labelled evaluation exists.
- Say **"VoIP scaffold/client"**, not "working secure calls", until LiveKit is
  deployed and two-device calls pass.
- Say **"static knowledge graph"**, not "synced personal knowledge base", until
  encrypted persistent overlay and sync are built.
- Never say the app listens to the other party's internal SIM-call audio. The
  microphone/speakerphone path is acoustic capture with device-dependent quality.
- Never use root/Magisk, hidden APIs or permission bypasses to evade Android
  privacy restrictions.
- Keep API keys in Android Keystore-backed storage and never commit secrets.

## 11. First safe implementation sequence

The best next engineering milestone is **Knowledge Graph v2 and Model Health**,
because it creates visible product value without touching audio capture:

1. Add `KnowledgeGraphStore` as a new encrypted storage overlay.
2. Add schema migrations, versioned import/export and tests.
3. Generate build info and inject it as a read-only graph node.
4. Add model health facts from existing downloader events.
5. Add an assistant context builder that only reads verified graph facts.
6. Test these modules independently.
7. Only then start VoIP deployment work in backend/mobile files that do not call
   Live Shield internals.

This sequence makes the app able to explain its exact version, features, model
status and known limitations without risking the selected v2.0.0 Live Shield
baseline.
