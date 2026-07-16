#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CPP_DIR="$ROOT_DIR/android/app/src/main/cpp/whisper.cpp"

if [[ -d "$CPP_DIR/.git" ]]; then
  git -C "$CPP_DIR" fetch --depth 1 origin v1.7.5
  git -C "$CPP_DIR" checkout v1.7.5
else
  git clone --depth 1 --branch v1.7.5 https://github.com/ggerganov/whisper.cpp.git "$CPP_DIR"
fi

required=(
  "include/whisper.h"
  "src/whisper.cpp"
  "ggml/include/ggml.h"
  "ggml/src/ggml.c"
  "ggml/src/ggml-alloc.c"
  "ggml/src/ggml-backend.cpp"
  "ggml/src/ggml-quants.c"
  "CMakeLists.txt"
)

for file in "${required[@]}"; do
  test -f "$CPP_DIR/$file" || {
    echo "Missing required whisper.cpp file: $file" >&2
    exit 1
  }
done

echo "whisper.cpp v1.7.5 is ready at $CPP_DIR"
