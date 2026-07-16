#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/backend/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing backend/.env. Copy backend/.env.example and configure it first." >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a
cd "$ROOT"
exec "$ROOT/backend/.venv/bin/uvicorn" backend.app.main:app --host 0.0.0.0 --port 8000
