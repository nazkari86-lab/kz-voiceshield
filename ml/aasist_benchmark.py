"""Offline AASIST benchmark and low-FPR calibration.

This tool is deliberately independent from Android and Live Shield. It produces
auditable score rows and never promotes a model to a live call decision.
"""
from __future__ import annotations

import argparse
import json
import random
import shutil
import subprocess
from collections import defaultdict
from pathlib import Path
from typing import Iterable

import numpy as np

from .aasist_inference import AasistScorer, TARGET_SAMPLE_RATE


def binary_metrics(labels: Iterable[int], scores: Iterable[float], threshold: float = 0.5) -> dict[str, float | int]:
    y = np.asarray(list(labels), dtype=np.int8)
    s = np.asarray(list(scores), dtype=np.float64)
    if y.size == 0 or y.size != s.size or not np.isfinite(s).all() or set(y.tolist()) - {0, 1}:
        raise ValueError("labels and finite scores with binary labels are required")
    if not 0.0 <= threshold <= 1.0:
        raise ValueError("threshold must be between 0 and 1")
    predicted = s >= threshold
    tp = int(np.sum(predicted & (y == 1)))
    fp = int(np.sum(predicted & (y == 0)))
    tn = int(np.sum(~predicted & (y == 0)))
    fn = int(np.sum(~predicted & (y == 1)))
    tpr = tp / (tp + fn) if tp + fn else 0.0
    fpr = fp / (fp + tn) if fp + tn else 0.0
    precision = tp / (tp + fp) if tp + fp else 0.0
    return {"threshold": float(threshold), "tp": tp, "fp": fp, "tn": tn, "fn": fn, "tpr": tpr, "fpr": fpr, "precision": precision}


def roc_auc(labels: Iterable[int], scores: Iterable[float]) -> float:
    y = np.asarray(list(labels), dtype=np.int8)
    s = np.asarray(list(scores), dtype=np.float64)
    positives = s[y == 1]
    negatives = s[y == 0]
    if not positives.size or not negatives.size:
        raise ValueError("ROC-AUC needs both classes")
    # Mann-Whitney formulation, with average credit for ties.
    comparisons = (positives[:, None] > negatives[None, :]).sum()
    ties = (positives[:, None] == negatives[None, :]).sum()
    return float((comparisons + 0.5 * ties) / (positives.size * negatives.size))


def equal_error_rate(labels: Iterable[int], scores: Iterable[float]) -> tuple[float, float]:
    y = np.asarray(list(labels), dtype=np.int8)
    s = np.asarray(list(scores), dtype=np.float64)
    thresholds = np.unique(np.r_[0.0, s, 1.0])
    points = [binary_metrics(y, s, float(t)) for t in thresholds]
    point = min(points, key=lambda item: abs(float(item["fpr"]) - (1.0 - float(item["tpr"]))))
    eer = (float(point["fpr"]) + 1.0 - float(point["tpr"])) / 2.0
    return float(eer), float(point["threshold"])


def threshold_for_fpr(labels: Iterable[int], scores: Iterable[float], target_fpr: float = 0.01) -> dict[str, float | int]:
    if not 0 < target_fpr < 1:
        raise ValueError("target_fpr must be between 0 and 1")
    y = np.asarray(list(labels), dtype=np.int8)
    s = np.asarray(list(scores), dtype=np.float64)
    candidates = np.unique(np.r_[s, 1.0])
    points = [binary_metrics(y, s, float(t)) for t in candidates]
    valid = [point for point in points if float(point["fpr"]) <= target_fpr]
    return max(valid or points, key=lambda item: float(item["tpr"]))


def _read_audio(path: Path) -> tuple[np.ndarray, int, str]:
    try:
        import soundfile as sf
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("install ml/requirements-voice-auth.txt") from exc
    try:
        samples, rate = sf.read(path, dtype="float32", always_2d=False)
        return np.asarray(samples), int(rate), "soundfile"
    except Exception as soundfile_error:
        # Some macOS libsndfile builds reject recoverable FLAC frame errors in
        # ASVspoof files. Keep the fallback explicit and local; never upload or
        # silently transcode the source dataset.
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            raise soundfile_error
        decoded = subprocess.run(
            [
                ffmpeg,
                "-v",
                "error",
                "-i",
                str(path),
                "-f",
                "f32le",
                "-ac",
                "1",
                "-ar",
                str(TARGET_SAMPLE_RATE),
                "pipe:1",
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        samples = np.frombuffer(decoded.stdout, dtype="<f4")
        if not samples.size:
            raise soundfile_error
        return samples, TARGET_SAMPLE_RATE, "ffmpeg"


def run_benchmark(manifest_path: Path, output_path: Path, scores_path: Path | None = None, max_items: int | None = None, seed: int = 7) -> dict:
    rows = [json.loads(line) for line in manifest_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    random.Random(seed).shuffle(rows)
    if max_items:
        rows = rows[:max_items]
    scorer = AasistScorer()
    scored: list[dict] = []
    errors: list[dict] = []
    for row in rows:
        path = Path(str(row["path"]))
        try:
            samples, rate, decoder = _read_audio(path)
            result = scorer.score(samples, rate)
            scored.append({**row, "syntheticProbability": result.synthetic_voice_score, "bonaFideProbability": result.bona_fide_score, "modelId": result.model_id, "decoder": decoder})
        except Exception as exc:  # keep long benchmark runs resumable at row level
            errors.append({"id": row.get("id"), "path": str(path), "error": str(exc)})
    labels = [int(row["label"] == "synthetic") for row in scored]
    scores = [float(row["syntheticProbability"]) for row in scored]
    report: dict = {"schemaVersion": "voiceshield.aasist-benchmark.v1", "model": "aasist-asvspoof2019-la", "inputRows": len(rows), "scoredRows": len(scored), "errors": len(errors), "liveDecisionUse": False, "seed": seed, "slices": {}}
    if labels and len(set(labels)) == 2:
        eer, eer_threshold = equal_error_rate(labels, scores)
        report["overall"] = {"rocAuc": roc_auc(labels, scores), "eer": eer, "eerThreshold": eer_threshold, "fpr1": threshold_for_fpr(labels, scores, 0.01), "fpr3": threshold_for_fpr(labels, scores, 0.03), "fpr5": threshold_for_fpr(labels, scores, 0.05)}
        grouped: dict[str, list[int]] = defaultdict(list)
        for index, row in enumerate(scored):
            grouped[f"codec={row.get('codec', 'unknown')}"] .append(index)
            grouped[f"generator={row.get('generatorId', 'unknown')}"] .append(index)
        for key, indexes in grouped.items():
            group_labels = [labels[index] for index in indexes]
            group_scores = [scores[index] for index in indexes]
            if len(set(group_labels)) == 2:
                report["slices"][key] = {"count": len(indexes), "rocAuc": roc_auc(group_labels, group_scores), "eer": equal_error_rate(group_labels, group_scores)[0]}
    report["errorsDetail"] = errors[:100]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if scores_path:
        scores_path.parent.mkdir(parents=True, exist_ok=True)
        scores_path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in scored), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--scores", type=Path)
    parser.add_argument("--max-items", type=int)
    args = parser.parse_args()
    print(json.dumps(run_benchmark(args.manifest, args.out, args.scores, args.max_items), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
