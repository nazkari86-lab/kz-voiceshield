#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/backend/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing backend/.env." >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

TOKEN="$($ROOT/backend/.venv/bin/python -c 'from backend.app.config import Settings; print(next(iter(Settings.from_env().api_tokens)))')"
LIVEKIT_HOST="${LIVEKIT_URL#ws://}"
LIVEKIT_HOST="${LIVEKIT_HOST#wss://}"
LIVEKIT_HOST="${LIVEKIT_HOST%:*}"
printf 'VoiceShield backend URL: http://%s:8000\n' "$LIVEKIT_HOST"
printf 'VoiceShield API token: %s\n' "$TOKEN"
printf 'LiveKit URL: %s\n' "$LIVEKIT_URL"
printf '%s\n' 'Use the backend URL and API token in VoiceShield: Setup > Optional backend and VoIP.'
