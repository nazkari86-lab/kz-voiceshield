#!/usr/bin/env bash
set -u

# Resumable research-data downloader. This never touches the Android app.
BASE_DIR="${1:-$(cd "$(dirname "$0")/.." && pwd)/data/external/2026-07-19/deepfake/asvspoof2021_df}"
RETRY_SECONDS="${RETRY_SECONDS:-180}"
mkdir -p "$BASE_DIR"

declare -a FILES=(
  "ASVspoof2021_DF_eval_part00.tar.gz|8637050238|https://zenodo.org/api/records/4835108/files/ASVspoof2021_DF_eval_part00.tar.gz/content"
  "ASVspoof2021_DF_eval_part01.tar.gz|8624944890|https://zenodo.org/api/records/4835108/files/ASVspoof2021_DF_eval_part01.tar.gz/content"
  "ASVspoof2021_DF_eval_part02.tar.gz|8616337195|https://zenodo.org/api/records/4835108/files/ASVspoof2021_DF_eval_part02.tar.gz/content"
  "ASVspoof2021_DF_eval_part03.tar.gz|8656151261|https://zenodo.org/api/records/4835108/files/ASVspoof2021_DF_eval_part03.tar.gz/content"
)

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

file_size() {
  if stat -f %z "$1" >/dev/null 2>&1; then
    stat -f %z "$1"
  else
    stat -c %s "$1"
  fi
}

network_ready() {
  curl -fsS --connect-timeout 15 --max-time 30 -o /dev/null https://zenodo.org/api/records/4835108
}

download_one() {
  local name="$1" expected="$2" url="$3" path size
  path="$BASE_DIR/$name"
  while true; do
    size=0
    [[ -f "$path" ]] && size="$(file_size "$path")"
    if [[ "$size" -eq "$expected" ]]; then
      log "complete: $name ($size bytes)"
      return 0
    fi
    if ! network_ready; then
      log "network unavailable; retrying $name in ${RETRY_SECONDS}s"
      sleep "$RETRY_SECONDS"
      continue
    fi
    log "resuming $name at $size/$expected bytes"
    if curl -fL --retry 3 --retry-delay 10 --connect-timeout 30 --speed-time 60 --speed-limit 1024 -C - -o "$path" "$url"; then
      size="$(file_size "$path")"
      if [[ "$size" -eq "$expected" ]]; then
        log "complete: $name ($size bytes)"
        return 0
      fi
      log "connection ended at $size/$expected; retrying in ${RETRY_SECONDS}s"
    else
      log "download failed for $name; retrying in ${RETRY_SECONDS}s"
    fi
    sleep "$RETRY_SECONDS"
  done
}

log "ASVspoof resumable download started"
for entry in "${FILES[@]}"; do
  IFS='|' read -r name expected url <<< "$entry"
  download_one "$name" "$expected" "$url"
done
log "all ASVspoof DF audio parts are complete"
