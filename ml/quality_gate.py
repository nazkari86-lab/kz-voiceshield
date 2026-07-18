"""Promotion gate for a real RU/KZ fraud evaluation set."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from dataset import load_many


def check_holdout(paths: list[Path], minimum_per_label: int = 20, minimum_per_language: int = 10) -> dict:
    cases, rejected = load_many(paths, require_trusted=True)
    labels = {label: sum(case.label == label for case in cases) for label in ("true_positive", "false_positive", "needs_review")}
    languages = {lang: 0 for lang in ("ru", "kz", "mixed")}
    for path in paths:
        for raw in path.read_text(encoding="utf-8").splitlines():
            if not raw.strip():
                continue
            row = json.loads(raw)
            if row.get("provenance", {}).get("trusted") is True and row.get("lang") in languages:
                languages[row["lang"]] += 1
    failures: list[str] = []
    for label in ("true_positive", "false_positive"):
        if labels[label] < minimum_per_label:
            failures.append(f"label {label} needs at least {minimum_per_label}; got {labels[label]}")
    for language, count in languages.items():
        if count < minimum_per_language:
            failures.append(f"language {language} needs at least {minimum_per_language}; got {count}")
    if rejected:
        failures.append(f"rejected rows present: {len(rejected)}")
    return {
        "schemaVersion": "voiceshield.real-holdout-gate.v1",
        "eligibleCases": len(cases), "labels": labels, "languages": languages,
        "rejected": len(rejected), "passed": not failures, "failures": failures,
        "promotion": "blocked" if failures else "eligible_for_independent_review",
        "rule": "This gate checks dataset readiness, not model accuracy or live-call reliability.",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Check whether a trusted RU/KZ holdout is ready")
    parser.add_argument("datasets", nargs="+", type=Path)
    parser.add_argument("--min-label", type=int, default=20)
    parser.add_argument("--min-language", type=int, default=10)
    args = parser.parse_args()
    report = check_holdout(args.datasets, args.min_label, args.min_language)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if not report["passed"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
