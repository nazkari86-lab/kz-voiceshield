"""Server-side TTS for the training simulator.

This module is deliberately separate from call transcription. It never accepts
call audio and never participates in the Live Shield audio lifecycle.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import tempfile
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class TrainingTtsSettings:
    api_key: str = ""
    voice_id: str = ""
    model_id: str = "eleven_multilingual_v2"
    timeout_seconds: float = 30.0
    cache_dir: Path = Path("backend/data/training-tts-cache")
    edge_tts_enabled: bool = False
    edge_tts_voice_ru: str = "ru-RU-SvetlanaNeural"
    edge_tts_voice_kz: str = "kk-KZ-AigulNeural"


@dataclass(frozen=True)
class TrainingTtsResult:
    audio_base64: str
    mime_type: str
    provider: str
    voice_id_hash: str
    model_id: str
    cached: bool


@dataclass(frozen=True)
class TrainingVoiceOption:
    voice_id: str
    name: str
    category: str | None
    labels: dict[str, str]


EDGE_VOICES = (
    TrainingVoiceOption("edge:ru-RU-SvetlanaNeural", "Svetlana", "Microsoft Edge", {"language": "RU", "provider": "edge-tts"}),
    TrainingVoiceOption("edge:ru-RU-DmitryNeural", "Dmitry", "Microsoft Edge", {"language": "RU", "provider": "edge-tts"}),
    TrainingVoiceOption("edge:kk-KZ-AigulNeural", "Aigul", "Microsoft Edge", {"language": "KZ", "provider": "edge-tts"}),
    TrainingVoiceOption("edge:kk-KZ-DauletNeural", "Daulet", "Microsoft Edge", {"language": "KZ", "provider": "edge-tts"}),
)


class TrainingTtsUnavailable(RuntimeError):
    """Raised when the optional training voice provider is not configured."""


def _voice_hash(voice_id: str) -> str:
    return hashlib.sha256(voice_id.encode("utf-8")).hexdigest()[:16]


def _cache_key(text: str, voice_id: str, model_id: str, language: str, speed: float) -> str:
    payload = json.dumps(
        {"text": text, "voice": voice_id, "model": model_id, "language": language, "speed": speed},
        ensure_ascii=False,
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _request_elevenlabs(text: str, settings: TrainingTtsSettings, speed: float) -> bytes:
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{settings.voice_id}"
    body = json.dumps(
        {
            "text": text,
            "model_id": settings.model_id,
            "voice_settings": {"stability": 0.52, "similarity_boost": 0.78, "speed": speed},
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
            "xi-api-key": settings.api_key,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=settings.timeout_seconds) as response:
            audio = response.read()
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as error:
        raise TrainingTtsUnavailable("Training voice provider is temporarily unavailable") from error
    if not audio or len(audio) > 8 * 1024 * 1024:
        raise TrainingTtsUnavailable("Training voice provider returned invalid audio")
    return audio


def _request_voice_catalog(settings: TrainingTtsSettings) -> list[TrainingVoiceOption]:
    request = urllib.request.Request(
        "https://api.elevenlabs.io/v1/voices",
        method="GET",
        headers={"Accept": "application/json", "xi-api-key": settings.api_key},
    )
    try:
        with urllib.request.urlopen(request, timeout=settings.timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError) as error:
        raise TrainingTtsUnavailable("Training voice catalog is temporarily unavailable") from error
    result: list[TrainingVoiceOption] = []
    for item in payload.get("voices", []) if isinstance(payload, dict) else []:
        if not isinstance(item, dict) or not isinstance(item.get("voice_id"), str):
            continue
        labels = item.get("labels") if isinstance(item.get("labels"), dict) else {}
        result.append(TrainingVoiceOption(
            voice_id=item["voice_id"],
            name=str(item.get("name") or "Unnamed voice")[:120],
            category=str(item["category"])[:80] if item.get("category") else None,
            labels={str(k)[:40]: str(v)[:80] for k, v in labels.items() if isinstance(k, str) and isinstance(v, str)},
        ))
    return result[:200]


async def _request_edge_tts(text: str, voice_id: str, speed: float) -> bytes:
    """Generate audio through the public Edge speech endpoint via edge-tts.

    This provider needs no API key, but it does require internet access. The
    import stays optional so installations that only use ElevenLabs do not
    fail at module import time.
    """
    try:
        import edge_tts
    except ImportError as error:
        raise TrainingTtsUnavailable("edge-tts is not installed on the backend") from error
    rate_percent = round((speed - 1.0) * 100)
    communicator = edge_tts.Communicate(
        text,
        voice=voice_id,
        rate=f"{rate_percent:+d}%",
    )
    chunks: list[bytes] = []
    try:
        async for chunk in communicator.stream():
            if chunk.get("type") == "audio" and isinstance(chunk.get("data"), bytes):
                chunks.append(chunk["data"])
    except Exception as error:  # edge-tts exposes provider-specific exceptions
        raise TrainingTtsUnavailable("Microsoft Edge voice provider is unavailable") from error
    audio = b"".join(chunks)
    if not audio or len(audio) > 8 * 1024 * 1024:
        raise TrainingTtsUnavailable("Microsoft Edge voice provider returned invalid audio")
    return audio


class TrainingTtsService:
    def __init__(self, settings: TrainingTtsSettings) -> None:
        self.settings = settings

    @property
    def available(self) -> bool:
        return bool((self.settings.api_key and self.settings.voice_id) or self.settings.edge_tts_enabled)

    async def list_voices(self) -> list[TrainingVoiceOption]:
        voices: list[TrainingVoiceOption] = []
        if self.settings.api_key:
            voices.extend(await asyncio.to_thread(_request_voice_catalog, self.settings))
        if self.settings.edge_tts_enabled:
            voices.extend(EDGE_VOICES)
        if not voices:
            raise TrainingTtsUnavailable("No training voice provider is configured")
        return voices[:220]

    async def synthesize(
        self,
        text: str,
        language: str,
        speed: float = 0.95,
        voice_id: str | None = None,
    ) -> TrainingTtsResult:
        normalized = " ".join(text.split())
        if not normalized:
            raise ValueError("Training text is empty")
        if len(normalized) > 3_000:
            raise ValueError("Training text is too long")
        safe_language = language.upper() if language.upper() in {"RU", "KZ", "EN"} else "RU"
        safe_speed = min(1.2, max(0.7, float(speed)))
        requested_voice_id = (voice_id or "").strip()
        default_edge_voice = self.settings.edge_tts_voice_kz if safe_language == "KZ" else self.settings.edge_tts_voice_ru
        active_voice_id = requested_voice_id or (self.settings.voice_id if self.settings.api_key else f"edge:{default_edge_voice}")
        use_edge = active_voice_id.startswith("edge:") or (not self.settings.api_key and not requested_voice_id)
        if use_edge:
            if not self.settings.edge_tts_enabled:
                message = "Microsoft Edge voice provider is disabled" if self.settings.api_key or requested_voice_id else "Training voice provider is not configured"
                raise TrainingTtsUnavailable(message)
            edge_voice_id = active_voice_id.removeprefix("edge:") or default_edge_voice
            provider_voice_id = f"edge:{edge_voice_id}"
            model_id = "edge-tts"
        else:
            if not self.settings.api_key or (not self.settings.voice_id and not requested_voice_id):
                raise TrainingTtsUnavailable("Training ElevenLabs voice is not configured")
            edge_voice_id = ""
            provider_voice_id = active_voice_id
            model_id = self.settings.model_id
        key = _cache_key(normalized, provider_voice_id, model_id, safe_language, safe_speed)
        cache_path = self.settings.cache_dir / f"{key}.mp3"
        if cache_path.exists() and cache_path.stat().st_size > 0:
            audio = await asyncio.to_thread(cache_path.read_bytes)
            cached = True
        else:
            if use_edge:
                audio = await _request_edge_tts(normalized, edge_voice_id, safe_speed)
            else:
                request_settings = TrainingTtsSettings(
                    api_key=self.settings.api_key,
                    voice_id=active_voice_id,
                    model_id=self.settings.model_id,
                    timeout_seconds=self.settings.timeout_seconds,
                    cache_dir=self.settings.cache_dir,
                )
                audio = await asyncio.to_thread(_request_elevenlabs, normalized, request_settings, safe_speed)
            self.settings.cache_dir.mkdir(parents=True, exist_ok=True)
            fd, temporary = tempfile.mkstemp(prefix=f"{key}.", suffix=".tmp", dir=self.settings.cache_dir)
            try:
                with os.fdopen(fd, "wb") as handle:
                    handle.write(audio)
                os.replace(temporary, cache_path)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)
            cached = False
        return TrainingTtsResult(
            audio_base64=base64.b64encode(audio).decode("ascii"),
            mime_type="audio/mpeg",
            provider="edge-tts" if use_edge else "elevenlabs",
            voice_id_hash=_voice_hash(provider_voice_id),
            model_id=model_id,
            cached=cached,
        )
