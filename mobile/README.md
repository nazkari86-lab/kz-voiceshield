# KZ VoiceShield Mobile

React Native Android prototype for on-device RU/KZ phone-fraud protection.

It keeps the existing web workspace intact and adds a separate mobile app under `mobile/`.

## What Is Included

- React Native 0.79 Android scaffold with Hermes and New Architecture flags.
- Kotlin native modules for call screening, accessibility transcript reading, overlay badge, audio capture, model download, and Whisper JNI bridge.
- Local TypeScript scoring pipeline shared by live transcript and manual review.
- Context-aware risk amplification from package-name-only signals for banking, remote-access, and screen-sharing apps during an active protection session.
- Scheme classification, visible device-context evidence, and a local 30-second anti-pressure pause for high-risk calls.
- Explicit privacy consent and session-gated Accessibility/notification processing.
- AES-GCM Android Keystore storage, one-time plaintext migration, secret redaction, and complete local-data deletion.
- Privacy-preserving caller verification without retaining raw numbers, optional OTP/bank-notification type detection, and official bank callback directory.
- Encrypted trusted-family contact with user-initiated call and risk-summary sharing.
- Setup status for overlay, call screening, microphone, notifications, battery optimization, Xiaomi/Android app settings, and Whisper preparation.
- Pinned Whisper model size/SHA-256 verification and download progress.
- CMake/JNI bridge that automatically links `whisper.cpp` when the sources are fetched.

## Run

```bash
cd mobile
npm install
npm run android
```

Android CLI builds require a full JDK, not only a JRE. Use JDK 17 for React Native 0.79 / Android Gradle Plugin 8.x:

```bash
cd mobile/android
JAVA_HOME="$PWD/../.jdk/Contents/Home" ANDROID_HOME="$HOME/Library/Android/sdk" ./gradlew testReleaseUnitTest assembleRelease bundleRelease --no-daemon
```

## Whisper

The checked-in JNI bridge refuses to report the model as ready unless real `whisper.cpp` is linked and the model loads successfully. To fetch `whisper.cpp` v1.7.5:

```bash
cd mobile
chmod +x scripts/fetch-whisper.sh
./scripts/fetch-whisper.sh
```

The fetched sources are intentionally git-ignored. After fetching, `android/app/src/main/cpp/CMakeLists.txt` links the `whisper` target during the next clean native build.

## Privacy Boundary

VoiceShield does not upload audio or transcript data in local-only mode. Accessibility and notification classification stop outside a user-started protection session. Only approved system caption packages can contribute text. Notification text is reduced natively to a risk type and is not retained. Raw caller numbers are not retained. Saved transcripts are redacted and encrypted with a non-exportable Android Keystore key.

Microphone `VOICE_RECOGNITION` is a fallback and cannot guarantee capture of the remote side of a cellular call on every Android device. Live Caption is preferred when available. The app must show a degraded-mode message rather than claim full two-sided transcription when the device does not expose it.
