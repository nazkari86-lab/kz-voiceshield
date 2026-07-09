# KZ VoiceShield Mobile

React Native Android prototype for on-device RU/KZ phone-fraud protection.

It keeps the existing web workspace intact and adds a separate mobile app under `mobile/`.

## What Is Included

- React Native 0.79 Android scaffold with Hermes and New Architecture flags.
- Kotlin native modules for call screening, accessibility transcript reading, overlay badge, audio capture, model download, and Whisper JNI bridge.
- Local TypeScript scoring pipeline shared by live transcript and manual review.
- Setup wizard for overlay, call screening, accessibility, and Whisper model preparation.
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
JAVA_HOME="$PWD/../.jdk/Contents/Home" ANDROID_HOME="$HOME/Library/Android/sdk" ./gradlew assembleDebug --no-daemon
```

## Whisper

The checked-in JNI file compiles without vendored native sources, then switches to real transcription once `whisper.cpp` is present. To fetch `whisper.cpp` v1.7.5:

```bash
cd mobile
chmod +x scripts/fetch-whisper.sh
./scripts/fetch-whisper.sh
```

The fetched sources are intentionally git-ignored. After fetching, `android/app/src/main/cpp/CMakeLists.txt` links the `whisper` target during the next clean native build.
