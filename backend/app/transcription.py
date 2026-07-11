from __future__ import annotations

import math
import os
import tempfile
from pathlib import Path
from typing import Protocol


class Transcriber(Protocol):
    def transcribe(self, audio: bytes, suffix: str) -> tuple[str, int]: ...


class DisabledTranscriber:
    def transcribe(self, audio: bytes, suffix: str) -> tuple[str, int]:
        raise RuntimeError("Server STT is not configured")


class FasterWhisperTranscriber:
    def __init__(self, model_name: str, device: str = "cpu", compute_type: str = "int8") -> None:
        try:
            from faster_whisper import WhisperModel
        except ImportError as error:
            raise RuntimeError("Install backend/requirements-stt.txt to enable server STT") from error
        self._model = WhisperModel(model_name, device=device, compute_type=compute_type)

    def transcribe(self, audio: bytes, suffix: str) -> tuple[str, int]:
        path: str | None = None
        try:
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temporary:
                temporary.write(audio)
                path = temporary.name
            segments, _ = self._model.transcribe(path, language=None, vad_filter=True)
            materialized = list(segments)
            transcript = " ".join(segment.text.strip() for segment in materialized if segment.text.strip()).strip()
            if not transcript:
                raise RuntimeError("STT returned an empty transcript")
            average_log_probability = sum(segment.avg_logprob for segment in materialized) / max(1, len(materialized))
            confidence = int(round(max(0.0, min(1.0, math.exp(average_log_probability))) * 100))
            return transcript, confidence
        finally:
            if path:
                Path(path).unlink(missing_ok=True)


def transcriber_from_env() -> Transcriber:
    model_name = os.environ.get("VOICESHIELD_WHISPER_MODEL", "").strip()
    if not model_name:
        return DisabledTranscriber()
    return FasterWhisperTranscriber(
        model_name=model_name,
        device=os.environ.get("VOICESHIELD_WHISPER_DEVICE", "cpu"),
        compute_type=os.environ.get("VOICESHIELD_WHISPER_COMPUTE_TYPE", "int8"),
    )

