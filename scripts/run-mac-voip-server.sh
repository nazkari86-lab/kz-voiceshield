#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/backend/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing backend/.env. Copy backend/.env.example and configure it first." >&2
  exit 1
fi

if ! command -v livekit-server >/dev/null 2>&1; then
  echo "LiveKit Server is not installed. Run: brew install livekit" >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

: "${LIVEKIT_API_KEY:?LIVEKIT_API_KEY is required}"
: "${LIVEKIT_API_SECRET:?LIVEKIT_API_SECRET is required}"

CONFIG_FILE="$(mktemp "${TMPDIR:-/tmp}/voiceshield-livekit.XXXXXX")"
trap 'rm -f "$CONFIG_FILE"' EXIT INT TERM
sed "s/^  placeholder: replace-me$/  ${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}/" "$ROOT/infra/livekit-mac.yaml" > "$CONFIG_FILE"

exec livekit-server --bind 0.0.0.0 --config "$CONFIG_FILE"
