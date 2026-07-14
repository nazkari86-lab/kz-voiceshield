#!/usr/bin/env bash
set -euo pipefail

# The Android JNI archive is intentionally fetched at build time instead of
# committed. Its source API is vendored under app/src/main/java/com/k2fsa.
VERSION="1.13.4"
ARCHIVE="sherpa-onnx-v${VERSION}-android-static-link-onnxruntime.tar.bz2"
URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/v${VERSION}/${ARCHIVE}"
SHA256="e23223a35d4878b0f61f6d0ae47095ce090fd10d0d8ce41550f91fdbf7d431b1"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESTINATION="$ROOT_DIR/android/app/src/main/jniLibs"
CACHE_DIR="${SHERPA_ONNX_CACHE_DIR:-$ROOT_DIR/.cache/sherpa-onnx}"
ARCHIVE_PATH="$CACHE_DIR/$ARCHIVE"

mkdir -p "$CACHE_DIR" "$DESTINATION"

verify_archive() {
  [[ -f "$ARCHIVE_PATH" ]] || return 1
  [[ "$(shasum -a 256 "$ARCHIVE_PATH" | awk '{print $1}')" == "$SHA256" ]]
}

if ! verify_archive; then
  rm -f "$ARCHIVE_PATH"
  curl --fail --location --retry 3 --retry-all-errors --output "$ARCHIVE_PATH" "$URL"
fi
verify_archive || { echo "Sherpa archive SHA-256 mismatch" >&2; exit 1; }

TEMP_DIR="$(mktemp -d)"
trap 'find "$TEMP_DIR" -depth -delete 2>/dev/null || true' EXIT
tar -xjf "$ARCHIVE_PATH" -C "$TEMP_DIR"

for abi in arm64-v8a armeabi-v7a; do
  source="$TEMP_DIR/jniLibs/$abi/libsherpa-onnx-jni.so"
  [[ -f "$source" ]] || { echo "Missing $abi JNI library in Sherpa archive" >&2; exit 1; }
  mkdir -p "$DESTINATION/$abi"
  cp "$source" "$DESTINATION/$abi/libsherpa-onnx-jni.so"
done

echo "sherpa-onnx Android JNI $VERSION is ready for arm64-v8a and armeabi-v7a"
