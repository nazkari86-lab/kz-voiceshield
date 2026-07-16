"""Safe, offline registry and quality report for external datasets.

This module never copies raw audio into the APK and never marks external data
as trusted. It is intentionally independent from the Live Shield runtime.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


REGISTRY = {
    "difraud_sms": {"path": "fraud/difraud_sms_train.jsonl", "role": "text_transfer", "license": "MIT", "trusted": False},
    "difraud_job_scams": {"path": "fraud/difraud_job_scams_train.jsonl", "role": "text_transfer", "license": "MIT", "trusted": False},
    "trilingual_fraud": {"path": "fraud/trilingual_fraud_consumer_protection_v2.csv", "role": "text_transfer", "license": "MIT", "trusted": False},
    "kazakh_speech": {"path": "asr/kazakh_speech_train.csv", "role": "asr_evaluation", "license": "CC BY 4.0", "trusted": False},
    "asvspoof2021_df_labels": {"path": "deepfake/asvspoof2021_df_labels.parquet", "role": "deepfake_evaluation", "license": "ODbL", "trusted": False},
    "asvspoof2021_df_audio_sample": {"path": "deepfake/asvspoof2021_df_test-00000-of-00080.parquet", "role": "deepfake_evaluation", "license": "ODbL", "trusted": False},
    "lcnn_asvspoof2019": {"path": "deepfake/lcnn_best.pt", "role": "checkpoint_candidate", "license": "MIT", "trusted": False},
}


def sha256(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inspect_dataset(root: Path, name: str, spec: dict) -> dict:
    path = root / spec["path"]
    result = {"id": name, **spec, "exists": path.is_file(), "bytes": path.stat().st_size if path.is_file() else 0}
    if path.is_file():
        result["sha256"] = sha256(path)
    return result


def build_report(root: Path) -> dict:
    entries = [inspect_dataset(root, name, spec) for name, spec in REGISTRY.items()]
    return {
        "schemaVersion": "voiceshield.dataset.registry.v1",
        "rawRoot": str(root),
        "entries": entries,
        "policy": {
            "externalTrusted": False,
            "shipRawAudio": False,
            "liveDecisionUse": False,
            "recommendedUse": "offline evaluation, transfer training, and model-card reporting",
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a safe offline VoiceShield dataset registry")
    parser.add_argument("--root", type=Path, default=Path("data/external/2026-07-15"))
    parser.add_argument("--out", type=Path, default=Path("ml/artifacts/dataset_registry.json"))
    args = parser.parse_args()
    report = build_report(args.root)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"out": str(args.out), "datasets": len(report["entries"]), "present": sum(item["exists"] for item in report["entries"])}))


if __name__ == "__main__":
    main()
