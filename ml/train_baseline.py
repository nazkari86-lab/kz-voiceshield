from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
from sentence_transformers import SentenceTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import train_test_split

from dataset import TrainingCase, load_trusted_cases

EMBEDDING_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"


def rule_label(case: TrainingCase) -> str:
    if case.rule_score >= 65:
        return "true_positive"
    if case.rule_score < 35:
        return "false_positive"
    return "needs_review"


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the VoiceShield RU/KZ baseline classifier")
    parser.add_argument("dataset", type=Path, help="Trusted VoiceShield JSONL export")
    parser.add_argument("--output", type=Path, default=Path("ml/artifacts/baseline"))
    args = parser.parse_args()

    cases, rejected = load_trusted_cases(args.dataset)
    if len(cases) < 30:
        raise SystemExit("At least 30 unique trusted cases are required before training.")
    label_counts = {label: sum(case.label == label for case in cases) for label in sorted({case.label for case in cases})}
    if len(label_counts) < 3 or min(label_counts.values()) < 5:
        raise SystemExit("All three labels need at least five trusted examples.")

    train, test = train_test_split(cases, test_size=0.2, random_state=42, stratify=[case.label for case in cases])
    embedder = SentenceTransformer(EMBEDDING_MODEL)
    train_vectors = embedder.encode([case.transcript for case in train], normalize_embeddings=True, show_progress_bar=True)
    test_vectors = embedder.encode([case.transcript for case in test], normalize_embeddings=True, show_progress_bar=True)
    classifier = LogisticRegression(max_iter=2000, class_weight="balanced", random_state=42)
    classifier.fit(train_vectors, [case.label for case in train])
    predictions = classifier.predict(test_vectors)

    report = classification_report([case.label for case in test], predictions, output_dict=True, zero_division=0)
    disagreements = [
        {"id": case.case_id, "rule": rule_label(case), "ml": prediction, "label": case.label}
        for case, prediction in zip(test, predictions, strict=True)
        if rule_label(case) != prediction
    ]
    metadata = {
        "schemaVersion": "voiceshield.model.v1",
        "datasetSchemaVersion": "voiceshield.dataset.v2",
        "embeddingModel": EMBEDDING_MODEL,
        "classifier": "logistic-regression",
        "trainCount": len(train),
        "testCount": len(test),
        "rejectedCount": len(rejected),
        "labelBalance": label_counts,
        "classificationReport": report,
        "confusionMatrix": confusion_matrix([case.label for case in test], predictions, labels=list(classifier.classes_)).tolist(),
        "classes": list(classifier.classes_),
        "ruleMlDisagreements": disagreements,
    }

    args.output.mkdir(parents=True, exist_ok=True)
    joblib.dump(classifier, args.output / "classifier.joblib")
    (args.output / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    (args.output / "rejected.json").write_text(json.dumps(rejected, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(args.output), "train": len(train), "test": len(test), "disagreements": len(disagreements)}))


if __name__ == "__main__":
    main()
