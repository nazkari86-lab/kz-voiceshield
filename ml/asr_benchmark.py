"""Offline RU/KZ ASR benchmark from manifest + hypothesis JSONL.

The runner accepts hypotheses instead of invoking one particular ASR engine,
so Whisper/FastConformer/cloud comparisons remain reproducible and isolated
from the protected Live Shield pipeline.
"""
from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path


def _tokens(text: str) -> list[str]:
    return re.findall(r"[\w']+", text.casefold(), flags=re.UNICODE)


def _distance(reference: list[str], hypothesis: list[str]) -> int:
    previous = list(range(len(hypothesis) + 1))
    for row, expected in enumerate(reference, start=1):
        current = [row]
        for column, actual in enumerate(hypothesis, start=1):
            current.append(min(current[-1] + 1, previous[column] + 1, previous[column - 1] + (expected != actual)))
        previous = current
    return previous[-1]


def wer(reference: str, hypothesis: str) -> float:
    expected, actual = _tokens(reference), _tokens(hypothesis)
    return _distance(expected, actual) / max(1, len(expected))


def cer(reference: str, hypothesis: str) -> float:
    expected = list(re.sub(r"\s+", " ", reference.casefold()).strip())
    actual = list(re.sub(r"\s+", " ", hypothesis.casefold()).strip())
    return _distance(expected, actual) / max(1, len(expected))


def evaluate(rows: list[dict]) -> dict:
    if not rows:
        raise ValueError("at least one benchmark row is required")
    required = {"id", "language", "reference", "hypothesis", "split"}
    for row in rows:
        missing = required - row.keys()
        if missing:
            raise ValueError(f"{row.get('id', 'unknown')}: missing {sorted(missing)}")
        if row["language"] not in {"ru", "kz", "mixed"}:
            raise ValueError(f"{row['id']}: unsupported language")
        if row["split"] not in {"dev", "test"}:
            raise ValueError(f"{row['id']}: ASR benchmark must use dev or test")
    groups: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        groups[str(row["language"])].append(row)

    def aggregate(items: list[dict]) -> dict:
        return {
            "count": len(items),
            "wer": round(sum(wer(str(x["reference"]), str(x["hypothesis"])) for x in items) / len(items), 4),
            "cer": round(sum(cer(str(x["reference"]), str(x["hypothesis"])) for x in items) / len(items), 4),
        }

    return {
        "schemaVersion": "voiceshield.asr-evaluation.v1",
        "sampleCount": len(rows),
        "byLanguage": {key: aggregate(value) for key, value in sorted(groups.items())},
        "overall": aggregate(rows),
        "caveat": "Offline transcript comparison only; this does not prove live phone-call capture quality.",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate RU/KZ ASR hypotheses offline")
    parser.add_argument("rows", type=Path, help="JSONL with id/language/reference/hypothesis/split")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    rows = [json.loads(line) for line in args.rows.read_text(encoding="utf-8").splitlines() if line.strip()]
    encoded = json.dumps(evaluate(rows), ensure_ascii=False, indent=2) + "\n"
    if args.out:
        args.out.write_text(encoded, encoding="utf-8")
    print(encoded, end="")


if __name__ == "__main__":
    main()
