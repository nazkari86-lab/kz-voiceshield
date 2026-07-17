"""Offline ASR and anti-fraud quality reports.

The lab deliberately consumes already-produced JSONL predictions instead of
calling a recognizer. That keeps evaluation reproducible, prevents API keys or
private audio from entering the repository, and makes it impossible for this
module to influence Live Shield decisions.
"""
from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Iterable


QUALITY_LAB_SCHEMA = "voiceshield.quality-lab.v1"
ASR_REQUIRED_FIELDS = {"id", "language", "reference", "hypothesis"}
FRAUD_REQUIRED_FIELDS = {"id", "text", "expectedRisk", "expectedMinimumScore"}


def normalize_transcript(value: str) -> str:
    """Normalise formatting only; never apply linguistic corrections for WER."""
    return re.sub(r"\s+", " ", re.sub(r"[^\w]+", " ", value.lower(), flags=re.UNICODE)).strip()


def _distance(left: list[str] | str, right: list[str] | str) -> int:
    previous = list(range(len(right) + 1))
    for index, token in enumerate(left, 1):
        current = [index]
        for other_index, other in enumerate(right, 1):
            current.append(min(
                previous[other_index] + 1,
                current[other_index - 1] + 1,
                previous[other_index - 1] + (token != other),
            ))
        previous = current
    return previous[-1]


def error_rates(reference: str, hypothesis: str) -> dict[str, float | int]:
    reference_words = normalize_transcript(reference).split()
    hypothesis_words = normalize_transcript(hypothesis).split()
    reference_chars = "".join(reference_words)
    hypothesis_chars = "".join(hypothesis_words)
    word_errors = _distance(reference_words, hypothesis_words)
    char_errors = _distance(reference_chars, hypothesis_chars)
    return {
        "wordErrors": word_errors,
        "referenceWords": len(reference_words),
        "wer": round(word_errors / max(1, len(reference_words)), 4),
        "charErrors": char_errors,
        "referenceChars": len(reference_chars),
        "cer": round(char_errors / max(1, len(reference_chars)), 4),
    }


def _read_jsonl(path: Path, required_fields: set[str]) -> list[dict]:
    rows: list[dict] = []
    ids: set[str] = set()
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        row = json.loads(line)
        if not isinstance(row, dict) or not required_fields.issubset(row):
            raise ValueError(f"{path}:{line_number}: missing required quality-lab fields")
        row_id = str(row["id"])
        if not row_id or row_id in ids:
            raise ValueError(f"{path}:{line_number}: duplicate or empty id")
        ids.add(row_id)
        rows.append(row)
    return rows


def evaluate_asr(rows: Iterable[dict], model_id: str) -> dict:
    by_language: dict[str, list[dict]] = defaultdict(list)
    rows = list(rows)
    for row in rows:
        language = str(row["language"]).lower()
        if language not in {"kk", "ru", "mixed"}:
            raise ValueError(f"Unsupported ASR language: {language}")
        by_language[language].append(error_rates(str(row["reference"]), str(row["hypothesis"])))

    def summarize(items: list[dict]) -> dict:
        words = sum(int(item["referenceWords"]) for item in items)
        chars = sum(int(item["referenceChars"]) for item in items)
        return {
            "samples": len(items),
            "wer": round(sum(int(item["wordErrors"]) for item in items) / max(1, words), 4),
            "cer": round(sum(int(item["charErrors"]) for item in items) / max(1, chars), 4),
        }

    return {
        "schemaVersion": QUALITY_LAB_SCHEMA,
        "kind": "asr-evaluation",
        "modelId": model_id,
        "sampleCount": len(rows),
        "overall": summarize([error_rates(str(row["reference"]), str(row["hypothesis"])) for row in rows]),
        "byLanguage": {language: summarize(items) for language, items in sorted(by_language.items())},
        "caveat": "Offline benchmark only. It does not prove telephone-call quality or change Live Shield.",
    }


def verify_fraud_regression(rows: Iterable[dict], scorer) -> dict:
    failures: list[dict] = []
    checked = 0
    for row in rows:
        expected_risk = str(row["expectedRisk"])
        if expected_risk not in {"critical", "high", "medium", "low"}:
            raise ValueError(f"Unsupported expected risk: {expected_risk}")
        score = int(scorer(str(row["text"])))
        checked += 1
        if score < int(row["expectedMinimumScore"]):
            failures.append({"id": row["id"], "expectedMinimumScore": row["expectedMinimumScore"], "actualScore": score})
    return {
        "schemaVersion": QUALITY_LAB_SCHEMA,
        "kind": "fraud-regression",
        "checked": checked,
        "passed": not failures,
        "failures": failures,
        "caveat": "Synthetic/public regression cases prevent accidental scoring regressions; they are not production evidence.",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Run reproducible VoiceShield quality-lab reports")
    subcommands = parser.add_subparsers(dest="command", required=True)
    asr = subcommands.add_parser("asr")
    asr.add_argument("predictions", type=Path, help="JSONL: id, language, reference, hypothesis")
    asr.add_argument("--model-id", required=True)
    asr.add_argument("--out", type=Path)
    args = parser.parse_args()
    if args.command == "asr":
        report = evaluate_asr(_read_jsonl(args.predictions, ASR_REQUIRED_FIELDS), args.model_id)
        encoded = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
        if args.out:
            args.out.parent.mkdir(parents=True, exist_ok=True)
            args.out.write_text(encoded, encoding="utf-8")
        print(encoded, end="")


if __name__ == "__main__":
    main()
