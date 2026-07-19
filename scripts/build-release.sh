#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/mobile"

JAVA_MAJOR="$(java -version 2>&1 | sed -nE 's/.*version "([0-9]+).*/\1/p' | head -1)"
if [[ -z "$JAVA_MAJOR" || "$JAVA_MAJOR" -lt 11 ]]; then
  echo "Java 11+ is required for release builds; detected Java ${JAVA_MAJOR:-unknown}." >&2
  exit 4
fi

if [[ ! -f android/keystore.properties ]]; then
  echo "Release signing is not configured: create android/keystore.properties first." >&2
  exit 2
fi

npm run typecheck
npm test -- --runInBand
./android/gradlew -p android testReleaseUnitTest --no-daemon
./android/gradlew -p android assembleRelease bundleRelease --no-daemon

APK="android/app/build/outputs/apk/release/app-release.apk"
APKSIGNER="$(find "${ANDROID_HOME:-}"/build-tools -name apksigner -type f 2>/dev/null | sort -V | tail -1)"
if [[ ! -f "$APK" || -z "$APKSIGNER" ]]; then
  echo "Release artifact or apksigner not found." >&2
  exit 3
fi
"$APKSIGNER" verify --verbose --print-certs "$APK"
mkdir -p ../dist
cp "$APK" ../dist/kz-voiceshield-release.apk
echo "Signed release created at ${ROOT}/dist/kz-voiceshield-release.apk"
