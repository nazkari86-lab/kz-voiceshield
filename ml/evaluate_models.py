"""Offline, reproducible comparison of the baseline and an external LLM.

This is an evaluation tool, not a live decision path. External/transfer data is
allowed only when explicitly requested, and every report carries that caveat.
LLM predictions are supplied as JSONL so the benchmark remains deterministic
and does not put API keys or network calls into tests.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Iterable

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import balanced_accuracy_score, classification_report, f1_score
from sklearn.model_selection import train_test_split

from dataset import TrainingCase, load_many
from train_baseline import rule_label

LABELS = ["false_positive", "true_positive", "needs_review"]


def _train_predict(train: list[TrainingCase], test: list[TrainingCase]) -> list[str]:
    vectorizer = TfidfVectorizer(analyzer="char_wb", ngram_range=(1, 4), min_df=2, max_features=30000)
    train_vectors = vectorizer.fit_transform(case.transcript for case in train)
    test_vectors = vectorizer.transform(case.transcript for case in test)
    classifier = LogisticRegression(max_iter=2500, class_weight="balanced", random_state=42)
    classifier.fit(train_vectors, [case.label for case in train])
    return [str(value) for value in classifier.predict(test_vectors)]


def _metrics(truth: list[str], predictions: list[str]) -> dict:
    report = classification_report(truth, predictions, labels=LABELS, output_dict=True, zero_division=0)
    return {
        "macroF1": round(f1_score(truth, predictions, labels=LABELS, average="macro", zero_division=0), 4),
        "balancedAccuracy": round(balanced_accuracy_score(truth, predictions), 4),
        "byLabel": {
            label: {
                "precision": round(float(report[label]["precision"]), 4),
                "recall": round(float(report[label]["recall"]), 4),
                "f1": round(float(report[label]["f1-score"]), 4),
                "support": int(report[label]["support"]),
            }
            for label in LABELS
        },
    }


def _load_llm_predictions(path: Path | None) -> dict[str, str]:
    if path is None:
        return {}
    result: dict[str, str] = {}
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        row = json.loads(line)
        case_id = str(row.get("id", ""))
        label = str(row.get("label", ""))
        if not case_id or label not in LABELS:
            raise ValueError(f"Invalid LLM prediction at line {line_number}")
        if case_id in result:
            raise ValueError(f"Duplicate LLM prediction id: {case_id}")
        result[case_id] = label
    return result


def evaluate(paths: Iterable[Path], llm_predictions: Path | None = None, allow_untrusted: bool = False) -> dict:
    cases, rejected = load_many(list(paths), require_trusted=not allow_untrusted)
    if len(cases) < 30:
        raise ValueError(f"At least 30 valid cases are required; got {len(cases)}")
    labels = [case.label for case in cases]
    if len(set(labels)) < 2 or min(labels.count(label) for label in set(labels)) < 5:
        raise ValueError("Each observed label needs at least five cases")
    train, test = train_test_split(cases, test_size=0.2, random_state=42, stratify=labels)
    truth = [case.label for case in test]
    baseline = _train_predict(train, test)
    report = {
        "schemaVersion": "voiceshield.evaluation.v1",
        "caseCount": len(cases),
        "trainCount": len(train),
        "testCount": len(test),
        "rejectedCount": len(rejected),
        "allowUntrusted": allow_untrusted,
        "evaluationCaveat": "Transfer/untrusted data is not evidence of production RU/KZ call performance." if allow_untrusted else "Only reviewer-trusted data was evaluated.",
        "baseline": _metrics(truth, baseline),
        "ruleVsBaselineDisagreements": sum(rule_label(case) != prediction for case, prediction in zip(test, baseline, strict=True)),
    }
    llm = _load_llm_predictions(llm_predictions)
    if llm:
        paired = [(case, llm[case.case_id]) for case in test if case.case_id in llm]
        if paired:
            report["llm"] = _metrics([case.label for case, _ in paired], [prediction for _, prediction in paired])
            report["llmPairedCount"] = len(paired)
            report["llmVsBaselineDisagreements"] = sum(
                llm[case.case_id] != baseline[index] for index, case in enumerate(test) if case.case_id in llm
            )
        else:
            report["llmPairedCount"] = 0
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate VoiceShield models offline")
    parser.add_argument("datasets", nargs="+", type=Path)
    parser.add_argument("--llm-predictions", type=Path)
    parser.add_argument("--allow-untrusted", action="store_true")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    report = evaluate(args.datasets, args.llm_predictions, args.allow_untrusted)
    encoded = json.dumps(report, ensure_ascii=False, indent=2)
    if args.out:
        args.out.write_text(encoded + "\n", encoding="utf-8")
    print(encoded)


if __name__ == "__main__":
    main()
