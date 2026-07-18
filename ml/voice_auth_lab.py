"""Offline voice-authenticity benchmark contract.

This module does not record calls, generate voices, or alter Live Shield. It
validates manifests and score files produced by an explicitly consented audio
lab. The detector remains shadow-only until cross-speaker, cross-generator and
telephony evaluations pass.
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

LABELS = {"human", "synthetic"}
SPLITS = {"train", "dev", "test"}
SCHEMA_VERSION = "voiceshield.voice-auth.v1"

POLICY = {
    "liveDecisionUse": False,
    "rawAudioInRepo": False,
    "requiresConsent": True,
    "requiredCoverage": ["ru", "kz", "mixed", "telephone_codec", "speaker_disjoint", "generator_disjoint"],
    "promotionGate": "calibration + low-FPR test + cross-generator test + Xiaomi benchmark + human review",
}


def validate_manifest(rows: list[dict]) -> list[str]:
    errors: list[str] = []
    by_speaker: dict[str, set[str]] = defaultdict(set)
    by_generator: dict[str, set[str]] = defaultdict(set)
    for index, row in enumerate(rows, start=1):
        prefix = f"row {index}:"
        if row.get("schemaVersion") != SCHEMA_VERSION:
            errors.append(f"{prefix} unsupported schema")
        if row.get("label") not in LABELS:
            errors.append(f"{prefix} label must be human or synthetic")
        if row.get("split") not in SPLITS:
            errors.append(f"{prefix} split must be train/dev/test")
        if row.get("language") not in {"ru", "kz", "mixed"}:
            errors.append(f"{prefix} unsupported language")
        if not row.get("speakerId"):
            errors.append(f"{prefix} missing speakerId")
        if row.get("label") == "synthetic" and not row.get("generatorId"):
            errors.append(f"{prefix} synthetic sample missing generatorId")
        if row.get("consent") is not True:
            errors.append(f"{prefix} explicit consent is required")
        speaker = str(row.get("speakerId", ""))
        generator = str(row.get("generatorId", "human"))
        by_speaker[speaker].add(str(row.get("split")))
        by_generator[generator].add(str(row.get("split")))
    for speaker, splits in by_speaker.items():
        if len(splits) > 1:
            errors.append(f"speaker {speaker}: appears in multiple splits")
    return errors


def evaluate_scores(rows: list[dict], threshold: float = 0.5) -> dict:
    """Evaluate deterministic score rows without claiming model validity."""
    test_rows = [row for row in rows if row.get("split") == "test"]
    if not test_rows:
        raise ValueError("at least one test row is required")
    tp = fp = tn = fn = 0
    for row in test_rows:
        score = float(row.get("syntheticProbability", -1))
        if not 0 <= score <= 1:
            raise ValueError(f"invalid syntheticProbability for {row.get('id', 'unknown')}")
        predicted = score >= threshold
        actual = row.get("label") == "synthetic"
        if predicted and actual: tp += 1
        elif predicted: fp += 1
        elif actual: fn += 1
        else: tn += 1
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    fpr = fp / (fp + tn) if fp + tn else 0.0
    return {
        "schemaVersion": "voiceshield.voice-auth-evaluation.v1",
        "testCount": len(test_rows), "threshold": threshold,
        "confusionMatrix": {"tp": tp, "fp": fp, "tn": tn, "fn": fn},
        "precision": round(precision, 4), "recall": round(recall, 4), "falsePositiveRate": round(fpr, 4),
        "liveDecisionUse": False,
        "caveat": "Score evaluation is not evidence of production accuracy without cross-generator and telephony validation.",
    }


def build_manifest_template() -> dict:
    return {"schemaVersion": SCHEMA_VERSION, "policy": POLICY, "samples": []}


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate VoiceShield voice-auth manifest or score JSONL")
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--scores", type=Path)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    rows = [json.loads(line) for line in args.manifest.read_text(encoding="utf-8").splitlines() if line.strip()]
    errors = validate_manifest(rows)
    if errors:
        raise SystemExit("\n".join(errors))
    report = {"schemaVersion": SCHEMA_VERSION, "policy": POLICY, "sampleCount": len(rows), "valid": True}
    if args.scores:
        score_rows = [json.loads(line) for line in args.scores.read_text(encoding="utf-8").splitlines() if line.strip()]
        report["evaluation"] = evaluate_scores(score_rows)
    encoded = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.out:
        args.out.write_text(encoded, encoding="utf-8")
    print(encoded, end="")


if __name__ == "__main__":
    main()
