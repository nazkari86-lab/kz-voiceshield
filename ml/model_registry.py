"""Truthful offline model-candidate registry.

Entries are candidates, not runtime dependencies. A candidate is blocked until
its exact artifact, checksum, license and device benchmark are recorded.
"""
from __future__ import annotations

from pathlib import Path


MODEL_CANDIDATES = (
    {
        "id": "silero-vad-onnx",
        "role": "offline speech-presence and audio-quality evaluation",
        "format": "onnx",
        "source": "https://github.com/snakers4/silero-vad",
        "license": "MIT",
        "artifact": "models/silero-vad.onnx",
        "liveDecisionUse": False,
        "requires": ["artifact SHA-256", "Xiaomi benchmark", "offline false-positive review"],
    },
    {
        "id": "asvspoof2021-lcnn",
        "role": "offline speech-deepfake benchmark candidate",
        "format": "pytorch/checkpoint",
        "source": "https://www.asvspoof.org/index2021.html",
        "license": "ODC-By for evaluation data; checkpoint license must be verified separately",
        "artifact": "models/lcnn-asvspoof2019.pt",
        "liveDecisionUse": False,
        "requires": ["artifact SHA-256", "ONNX conversion validation", "RU/KZ telephony evaluation"],
    },
    {
        "id": "sherpa-onnx-runtime",
        "role": "isolated Android ASR experiment runtime",
        "format": "native/onnx runtime",
        "source": "https://k2-fsa.github.io/sherpa/onnx/android/index.html",
        "license": "Apache-2.0",
        "artifact": "runtimes/sherpa-onnx",
        "liveDecisionUse": False,
        "requires": ["compatible RU/KZ model", "APK size review", "physical-device benchmark"],
    },
)


def build_model_lab_report(root: Path) -> dict:
    candidates = []
    for candidate in MODEL_CANDIDATES:
        path = root / candidate["artifact"]
        candidates.append({
            **candidate,
            "present": path.is_file() or path.is_dir(),
            "status": "candidate" if not (path.is_file() or path.is_dir()) else "unverified-local-artifact",
        })
    return {
        "schemaVersion": "voiceshield.model-lab.v1",
        "policy": {
            "autoDownload": False,
            "shipInApk": False,
            "liveShieldMutation": False,
            "liveDecisionUse": False,
            "promotionRule": "checksum + license + offline evaluation + Xiaomi benchmark + explicit review",
        },
        "candidates": candidates,
    }
