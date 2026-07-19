"""Offline AASIST inference adapter.

This module is intentionally separate from the Android/Live Shield audio path.
The bundled checkpoint is trained on ASVspoof data, so its output is an
evidence signal for review, not a calibrated RU/KZ production decision.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import wave

import numpy as np


DEFAULT_MODEL_PATH = (
    Path(__file__).resolve().parent
    / "artifacts"
    / "voice-auth"
    / "aasist"
    / "aasist.onnx"
)
TARGET_SAMPLE_RATE = 16_000
WINDOW_SAMPLES = 64_600


class AasistUnavailable(RuntimeError):
    """Raised when the optional offline AASIST runtime is unavailable."""


@dataclass(frozen=True)
class AasistScore:
    """One auditable AASIST result.

    ``synthetic_voice_score`` is a probability-like model signal, not a
    calibrated probability. A higher value means the model found more spoof
    evidence under the configured two-class output mapping.
    """

    synthetic_voice_score: float
    bona_fide_score: float
    model_id: str
    sample_rate: int
    window_samples: int
    calibrated: bool = False

    def to_dict(self) -> dict[str, object]:
        return {
            "syntheticVoiceScore": self.synthetic_voice_score,
            "bonaFideScore": self.bona_fide_score,
            "audioModel": self.model_id,
            "audioSampleRate": self.sample_rate,
            "audioWindowSamples": self.window_samples,
            "audioScoreCalibrated": self.calibrated,
        }


def _resample_linear(samples: np.ndarray, source_rate: int) -> np.ndarray:
    if source_rate <= 0:
        raise ValueError("sample_rate must be positive")
    if source_rate == TARGET_SAMPLE_RATE:
        return samples.astype(np.float32, copy=False)
    if samples.size == 0:
        return np.empty(0, dtype=np.float32)
    target_length = max(1, round(samples.size * TARGET_SAMPLE_RATE / source_rate))
    source_positions = np.arange(samples.size, dtype=np.float64)
    target_positions = np.linspace(0, samples.size - 1, target_length)
    return np.interp(target_positions, source_positions, samples).astype(np.float32)


def _prepare_waveform(samples: np.ndarray, sample_rate: int) -> np.ndarray:
    waveform = np.asarray(samples, dtype=np.float32)
    if waveform.ndim == 2:
        # Accept either [channels, samples] or [samples, channels].
        axis = 0 if waveform.shape[0] <= 8 else 1
        waveform = waveform.mean(axis=axis)
    if waveform.ndim != 1:
        raise ValueError("waveform must be a mono vector or a small channel matrix")
    waveform = _resample_linear(waveform, int(sample_rate))
    waveform = np.nan_to_num(waveform, nan=0.0, posinf=0.0, neginf=0.0)
    waveform = np.clip(waveform, -1.0, 1.0)
    if waveform.size > WINDOW_SAMPLES:
        waveform = waveform[:WINDOW_SAMPLES]
    if waveform.size < WINDOW_SAMPLES:
        waveform = np.pad(waveform, (0, WINDOW_SAMPLES - waveform.size))
    return waveform.astype(np.float32, copy=False)


class AasistScorer:
    """Lazy ONNX Runtime wrapper for the bundled AASIST checkpoint."""

    def __init__(self, model_path: Path | str = DEFAULT_MODEL_PATH) -> None:
        self.model_path = Path(model_path)
        self._session = None

    def _load(self):
        if self._session is not None:
            return self._session
        try:
            import onnxruntime as ort
        except ImportError as exc:  # pragma: no cover - depends on environment
            raise AasistUnavailable(
                "onnxruntime is not installed; install ml/requirements-voice-auth.txt"
            ) from exc
        if not self.model_path.is_file():
            raise AasistUnavailable(f"AASIST model not found: {self.model_path}")
        self._session = ort.InferenceSession(
            str(self.model_path), providers=["CPUExecutionProvider"]
        )
        inputs = self._session.get_inputs()
        if len(inputs) != 1 or inputs[0].name != "wav":
            raise AasistUnavailable("Unexpected AASIST ONNX input contract")
        return self._session

    def score(self, samples: np.ndarray, sample_rate: int = TARGET_SAMPLE_RATE) -> AasistScore:
        session = self._load()
        waveform = _prepare_waveform(samples, sample_rate)
        output = session.run(None, {"wav": waveform[None, :]})[0]
        logits = np.asarray(output, dtype=np.float64).reshape(-1)
        if logits.size != 2 or not np.isfinite(logits).all():
            raise AasistUnavailable("Unexpected or invalid AASIST output")
        logits -= logits.max()
        probabilities = np.exp(logits)
        probabilities /= probabilities.sum()
        # The exported checkpoint follows the maintained wrapper convention:
        # class 1 is bona fide and class 0 is spoof.
        bona_fide = float(probabilities[1])
        synthetic = float(probabilities[0])
        return AasistScore(
            synthetic_voice_score=round(synthetic, 6),
            bona_fide_score=round(bona_fide, 6),
            model_id="aasist-asvspoof2019-la",
            sample_rate=TARGET_SAMPLE_RATE,
            window_samples=WINDOW_SAMPLES,
        )

    def score_file(self, path: Path | str) -> AasistScore:
        """Score a PCM WAV file without adding a soundfile dependency."""
        with wave.open(str(path), "rb") as handle:
            channels = handle.getnchannels()
            sample_rate = handle.getframerate()
            width = handle.getsampwidth()
            frames = handle.readframes(handle.getnframes())
        if width != 2:
            raise ValueError("AASIST WAV input must be 16-bit PCM")
        samples = np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768.0
        if channels > 1:
            samples = samples.reshape(-1, channels).mean(axis=1)
        return self.score(samples, sample_rate)
