# Verified Baseline: v2.0.2

The Git tag `v2.0.2` and its GitHub release are the verified KZ VoiceShield
baseline. The release contains the signed Android APK `app-release.apk`.

On 2026-07-17, the user confirmed that this version works correctly on their
device. Treat that confirmation as the reference point for future work.

## Change discipline

- Do not modify the Live Shield capture or ASR contract as part of unrelated
  product, UI, backend, knowledge graph, or VoIP work.
- Before any approved Live Shield change, create a rollback point from
  `v2.0.2`, make the smallest possible change, and run a physical Xiaomi call
  regression test.
- Keep the rule-based score as the safety decision. ML and LLM output remain
  advisory and must not silently replace it.
- New releases must include a signed APK asset and pass the repository test,
  build, and APK signature checks.

## Restore reference

```bash
git diff --exit-code v2.0.2 -- \
  mobile/android/app/src/main/java/kz/voiceshield/AudioCaptureModule.kt \
  mobile/android/app/src/main/java/kz/voiceshield/WhisperModule.kt \
  mobile/android/app/src/main/java/kz/voiceshield/WhisperContext.kt \
  mobile/android/app/src/main/java/kz/voiceshield/FastConformerContext.kt \
  mobile/android/app/src/main/cpp/whisper_jni.cpp \
  mobile/src/bridge/WhisperBridge.ts \
  mobile/src/hooks/useWorkspace.ts \
  mobile/src/components/LiveView.tsx
```
