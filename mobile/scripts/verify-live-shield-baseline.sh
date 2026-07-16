#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

verify_file() {
  expected=$1
  relative_path=$2
  absolute_path="$ROOT_DIR/$relative_path"

  if command -v sha256sum >/dev/null 2>&1; then
    actual=$(sha256sum "$absolute_path" | awk '{print $1}')
  else
    actual=$(shasum -a 256 "$absolute_path" | awk '{print $1}')
  fi

  if [ "$actual" != "$expected" ]; then
    echo "Protected Live Shield baseline changed: $relative_path" >&2
    echo "Expected: $expected" >&2
    echo "Actual:   $actual" >&2
    echo "Use the physically verified v2.0.0 implementation unless the user explicitly authorizes a new baseline." >&2
    exit 1
  fi
}

verify_file "14193002179311150fd650a3badd18bce4676ce23241080ed5d931ddc3c02a9d" \
  "android/app/src/main/java/kz/voiceshield/WhisperModule.kt"
verify_file "a877a4bcc1a9239acfbbef1f747557a02b0078106fbcdaf3806751df6f9fd889" \
  "android/app/src/main/java/kz/voiceshield/AudioCaptureModule.kt"

echo "Live Shield baseline matches v2.0.0."
