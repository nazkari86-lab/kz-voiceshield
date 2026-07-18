import asyncio
from pathlib import Path

import pytest

from backend.app import training_tts
from backend.app.training_tts import TrainingTtsService, TrainingTtsSettings, TrainingTtsUnavailable


def test_training_tts_caches_audio_and_exposes_only_voice_hash(tmp_path: Path, monkeypatch):
    calls = 0

    def fake_request(text: str, settings: TrainingTtsSettings, speed: float) -> bytes:
        nonlocal calls
        calls += 1
        assert text == "Назовите код из SMS"
        assert settings.voice_id == "custom-voice-id"
        assert speed == 0.95
        return b"fake-mp3"

    monkeypatch.setattr(training_tts, "_request_elevenlabs", fake_request)
    service = TrainingTtsService(TrainingTtsSettings(
        api_key="server-only-key",
        voice_id="custom-voice-id",
        cache_dir=tmp_path,
    ))

    first = asyncio.run(service.synthesize("  Назовите   код из SMS ", "RU"))
    second = asyncio.run(service.synthesize("Назовите код из SMS", "RU"))

    assert calls == 1
    assert first.cached is False
    assert second.cached is True
    assert first.audio_base64 != ""
    assert first.voice_id_hash == second.voice_id_hash
    assert "custom-voice-id" not in first.voice_id_hash
    assert list(tmp_path.glob("*.mp3"))


def test_training_tts_rejects_long_text_without_provider_call(tmp_path: Path):
    service = TrainingTtsService(TrainingTtsSettings(
        api_key="server-only-key",
        voice_id="custom-voice-id",
        cache_dir=tmp_path,
    ))

    with pytest.raises(ValueError, match="too long"):
        asyncio.run(service.synthesize("x" * 3001, "RU"))


def test_training_tts_requires_both_server_secrets(tmp_path: Path):
    service = TrainingTtsService(TrainingTtsSettings(cache_dir=tmp_path))

    with pytest.raises(TrainingTtsUnavailable, match="not configured"):
        asyncio.run(service.synthesize("Тест", "RU"))


def test_edge_tts_works_without_api_key_and_caches_by_provider(tmp_path: Path, monkeypatch):
    calls = 0

    async def fake_edge(text: str, voice_id: str, speed: float) -> bytes:
        nonlocal calls
        calls += 1
        assert text == "Тестовый звонок"
        assert voice_id == "ru-RU-SvetlanaNeural"
        assert speed == 0.95
        return b"edge-mp3"

    monkeypatch.setattr(training_tts, "_request_edge_tts", fake_edge)
    service = TrainingTtsService(TrainingTtsSettings(cache_dir=tmp_path, edge_tts_enabled=True))

    first = asyncio.run(service.synthesize("Тестовый звонок", "RU"))
    second = asyncio.run(service.synthesize("Тестовый звонок", "RU"))

    assert service.available is True
    assert calls == 1
    assert first.provider == "edge-tts"
    assert first.model_id == "edge-tts"
    assert first.cached is False
    assert second.cached is True
