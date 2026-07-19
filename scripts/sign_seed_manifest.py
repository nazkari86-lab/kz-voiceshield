#!/usr/bin/env python3
"""Sign the public VoiceShield seed manifest with an Ed25519 private key."""

from __future__ import annotations

import base64
import json
import os
from datetime import UTC, datetime
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / "ml" / "seeds" / "voiceshield_seed_kz.json"


def main() -> None:
    raw_key = os.environ.get("VOICESHIELD_OTA_PRIVATE_KEY_B64", "")
    if not raw_key:
        raise SystemExit("VOICESHIELD_OTA_PRIVATE_KEY_B64 is required")
    seed = json.loads(SEED.read_text(encoding="utf-8"))
    payload = {"schemaVersion": seed["SCHEMA_VERSION"], "version": seed["VERSION"], "publishedAt": seed.get("PUBLISHED_AT", datetime.now(UTC).isoformat()), "rules": seed["RULES"]}
    private_key = Ed25519PrivateKey.from_private_bytes(base64.b64decode(raw_key))
    canonical = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    manifest = {**payload, "signature": base64.b64encode(private_key.sign(canonical)).decode("ascii")}
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
