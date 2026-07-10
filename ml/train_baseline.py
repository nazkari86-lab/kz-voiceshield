from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from sklearn.model_selection import train_test_split

from dataset import TrainingCase, load_many

EMBEDDING_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"


def rule_label(case: TrainingCase) -> str:
    if case.rule_score >= 65:
        return "true_positive"
    if case.rule_score < 35:
        return "false_positive"
    return "needs_review"


def _vectorize(train_texts, test_texts, kind: str):
    if kind == "embeddings":
        # Optional heavier path; only if sentence-transformers is installed.
        from sentence_transformers import SentenceTransformer

        embedder = SentenceTransformer(EMBEDDING_MODEL)
        return (
            embedder.encode(train_texts, normalize_embeddings=True),
            embedder.encode(test_texts, normalize_embeddings=True),
            {"vectorizer": "sentence-transformers", "embeddingModel": EMBEDDING_MODEL},
        )
    # Default: multilingual char n-gram TF-IDF (no torch; works offline for ru/kz/ko/zh).
    vectorizer = TfidfVectorizer(analyzer="char_wb", ngram_range=(1, 4), min_df=2, max_features=20000)
    train_vectors = vectorizer.fit_transform(train_texts)
    test_vectors = vectorizer.transform(test_texts)
    return train_vectors, test_vectors, {"vectorizer": "tfidf-char-wb-1-4"}


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the VoiceShield baseline classifier")
    parser.add_argument("datasets", nargs="+", type=Path, help="One or more v2 JSONL files")
    parser.add_argument("--output", type=Path, default=Path("ml/artifacts/baseline"))
    parser.add_argument("--vectorizer", choices=["tfidf", "embeddings"], default="tfidf")
    parser.add_argument("--allow-untrusted", action="store_true",
                        help="Include synthetic/external (untrusted) rows — EXPERIMENTAL transfer training only")
    parser.add_argument("--model-version", default="0.1.0-baseline")
    args = parser.parse_args()

    cases, rejected = load_many(args.datasets, require_trusted=not args.allow_untrusted)
    if len(cases) < 30:
        raise SystemExit(f"At least 30 cases required; got {len(cases)}. "
                         "Add real trusted data, or pass --allow-untrusted for a transfer run.")
    label_counts = {label: sum(case.label == label for case in cases) for label in sorted({case.label for case in cases})}
    if len(label_counts) < 2 or min(label_counts.values()) < 5:
        raise SystemExit(f"Need >=2 labels with >=5 examples each; got {label_counts}.")

    train, test = train_test_split(cases, test_size=0.2, random_state=42, stratify=[case.label for case in cases])
    train_vectors, test_vectors, vec_meta = _vectorize(
        [case.transcript for case in train], [case.transcript for case in test], args.vectorizer
    )
    classifier = LogisticRegression(max_iter=2000, class_weight="balanced", random_state=42)
    classifier.fit(train_vectors, [case.label for case in train])
    predictions = list(classifier.predict(test_vectors))
    truth = [case.label for case in test]

    report = classification_report(truth, predictions, output_dict=True, zero_division=0)
    disagreements = [
        {"id": case.case_id, "rule": rule_label(case), "ml": prediction, "label": case.label}
        for case, prediction in zip(test, predictions, strict=True)
        if rule_label(case) != prediction
    ]
    metadata = {
        "schemaVersion": "voiceshield.model.v1",
        "datasetSchemaVersion": "voiceshield.dataset.v2",
        "modelVersion": args.model_version,
        "trainingMode": "transfer-untrusted" if args.allow_untrusted else "trusted-real",
        "classifier": "logistic-regression",
        **vec_meta,
        "trainCount": len(train),
        "testCount": len(test),
        "rejectedCount": len(rejected),
        "labelBalance": label_counts,
        "accuracy": round(report.get("accuracy", 0.0), 4),
        "macroF1": round(f1_score(truth, predictions, average="macro", zero_division=0), 4),
        "classificationReport": report,
        "confusionMatrix": confusion_matrix(truth, predictions, labels=list(classifier.classes_)).tolist(),
        "classes": list(classifier.classes_),
        "ruleMlDisagreements": len(disagreements),
        "evaluationCaveat": (
            "Evaluated on a held-out split of transfer/synthetic data (ru/kz/ko/zh), "
            "NOT on real reviewer-labelled RU/KZ calls. Not for live decisions."
            if args.allow_untrusted else
            "Evaluated on a reviewer-trusted held-out split."
        ),
    }

    args.output.mkdir(parents=True, exist_ok=True)
    joblib.dump(classifier, args.output / "classifier.joblib")
    (args.output / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    (args.output / "rejected.json").write_text(json.dumps(rejected[:200], ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "output": str(args.output), "mode": metadata["trainingMode"],
        "train": len(train), "test": len(test),
        "accuracy": metadata["accuracy"], "macroF1": metadata["macroF1"],
    }))


if __name__ == "__main__":
    main()
