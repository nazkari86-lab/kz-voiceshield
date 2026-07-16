from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Principal:
    user_id: str
    role: str


@dataclass(frozen=True)
class Settings:
    database_path: Path
    encryption_key: str
    api_tokens: dict[str, Principal]
    model_path: Path | None
    retain_audio: bool = False
    max_audio_bytes: int = 25 * 1024 * 1024
    cors_origins: tuple[str, ...] = ()
    livekit_url: str | None = None
    livekit_api_key: str | None = None
    livekit_api_secret: str | None = None

    @classmethod
    def from_env(cls) -> "Settings":
        encryption_key = os.environ.get("VOICESHIELD_ENCRYPTION_KEY", "").strip()
        if not encryption_key:
            raise RuntimeError("VOICESHIELD_ENCRYPTION_KEY is required")

        raw_tokens = os.environ.get("VOICESHIELD_API_TOKENS", "").strip()
        if not raw_tokens:
            raise RuntimeError("VOICESHIELD_API_TOKENS is required")
        token_payload = json.loads(raw_tokens)
        api_tokens = {
            token: Principal(user_id=str(value["userId"]), role=str(value["role"]))
            for token, value in token_payload.items()
        }
        if not api_tokens:
            raise RuntimeError("VOICESHIELD_API_TOKENS must contain at least one token")
        invalid_roles = {principal.role for principal in api_tokens.values()} - {"analyst", "reviewer", "admin"}
        if invalid_roles:
            raise RuntimeError(f"Unsupported API roles: {sorted(invalid_roles)}")

        model_value = os.environ.get("VOICESHIELD_MODEL_PATH", "").strip()
        origins = tuple(origin.strip() for origin in os.environ.get("VOICESHIELD_CORS_ORIGINS", "").split(",") if origin.strip())
        return cls(
            api_tokens=api_tokens,
            cors_origins=origins,
            database_path=Path(os.environ.get("VOICESHIELD_DATABASE_PATH", "backend/data/voiceshield.db")),
            encryption_key=encryption_key,
            max_audio_bytes=int(os.environ.get("VOICESHIELD_MAX_AUDIO_BYTES", str(25 * 1024 * 1024))),
            model_path=Path(model_value) if model_value else None,
            retain_audio=os.environ.get("VOICESHIELD_RETAIN_AUDIO", "false").lower() == "true",
            livekit_url=os.environ.get("LIVEKIT_URL", "").strip() or None,
            livekit_api_key=os.environ.get("LIVEKIT_API_KEY", "").strip() or None,
            livekit_api_secret=os.environ.get("LIVEKIT_API_SECRET", "").strip() or None,
        )
