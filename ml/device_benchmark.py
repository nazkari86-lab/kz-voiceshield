"""Summarise manually captured Android inference timings.

Input is JSONL. One row represents one completed offline transcription run:
``{"device":"Xiaomi ...", "modelId":"...", "audioMs":10000, "wallMs":4200, "peakRssMb":610}``
No audio, transcript, API key or call identifier is accepted.
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    index = round((len(ordered) - 1) * fraction)
    return ordered[index]


def build_report(rows: list[dict]) -> dict:
    grouped: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for row in rows:
        required = {"device", "modelId", "audioMs", "wallMs", "peakRssMb"}
        if not required.issubset(row) or float(row["audioMs"]) <= 0 or float(row["wallMs"]) <= 0:
            raise ValueError("Each benchmark row needs positive device/model/audioMs/wallMs/peakRssMb fields")
        grouped[(str(row["device"]), str(row["modelId"]))].append(row)
    models = []
    for (device, model_id), items in sorted(grouped.items()):
        wall = [float(item["wallMs"]) for item in items]
        rtf = [float(item["wallMs"]) / float(item["audioMs"]) for item in items]
        memory = [float(item["peakRssMb"]) for item in items]
        models.append({
            "device": device,
            "modelId": model_id,
            "runs": len(items),
            "p50WallMs": round(percentile(wall, 0.5), 1),
            "p95WallMs": round(percentile(wall, 0.95), 1),
            "p50RealTimeFactor": round(percentile(rtf, 0.5), 3),
            "p95RealTimeFactor": round(percentile(rtf, 0.95), 3),
            "maxPeakRssMb": round(max(memory), 1),
            "liveCandidate": percentile(rtf, 0.95) <= 1.0,
        })
    return {
        "schemaVersion": "voiceshield.device-benchmark.v1",
        "models": models,
        "caveat": "Timing evidence from one device is not a general compatibility claim. Live Shield remains unchanged.",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Summarise VoiceShield device benchmark JSONL")
    parser.add_argument("runs", type=Path)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    rows = [json.loads(line) for line in args.runs.read_text(encoding="utf-8").splitlines() if line.strip()]
    encoded = json.dumps(build_report(rows), ensure_ascii=False, indent=2) + "\n"
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(encoded, encoding="utf-8")
    print(encoded, end="")


if __name__ == "__main__":
    main()
