from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib


LABEL_TO_VERDICT = {
    "true_positive": "fraud",
    "false_positive": "safe",
    "needs_review": "needs_review",
}


class ModelUnavailable(RuntimeError):
    pass


class ModelService:
    def __init__(self, model_path: Path | None) -> None:
        self._bundle: dict[str, Any] | None = None
        self._metadata: dict[str, Any] = {}
        if model_path is None:
            return
        if not model_path.is_file():
            raise ModelUnavailable(f"Model bundle not found: {model_path}")
        loaded = joblib.load(model_path)
        if not isinstance(loaded, dict) or "classifier" not in loaded or "vectorizer" not in loaded:
            raise ModelUnavailable("Model artifact is legacy or incomplete; retrain it with the current pipeline")
        self._bundle = loaded
        metadata_path = model_path.with_name("metadata.json")
        if metadata_path.is_file():
            self._metadata = json.loads(metadata_path.read_text(encoding="utf-8"))

    @property
    def available(self) -> bool:
        return self._bundle is not None

    def assess(self, transcript: str) -> dict[str, Any]:
        if self._bundle is None:
            raise ModelUnavailable("Experimental ML model is not configured")
        vectorizer = self._bundle["vectorizer"]
        classifier = self._bundle["classifier"]
        vectors = (
            vectorizer.transform([transcript])
            if hasattr(vectorizer, "transform")
            else vectorizer.encode([transcript], normalize_embeddings=True)
        )
        probabilities = classifier.predict_proba(vectors)[0]
        classes = [str(value) for value in classifier.classes_]
        predicted_index = max(range(len(probabilities)), key=lambda index: probabilities[index])
        predicted_label = classes[predicted_index]
        fraud_probability = probabilities[classes.index("true_positive")] if "true_positive" in classes else 0.0
        confidence = int(round(float(probabilities[predicted_index]) * 100))
        score = int(round(float(fraud_probability) * 100))
        return {
            "verdict": LABEL_TO_VERDICT.get(predicted_label, "needs_review"),
            "score": max(0, min(100, score)),
            "confidence": max(0, min(100, confidence)),
            "model": str(self._metadata.get("modelVersion", "experimental-baseline")),
            "embeddingModel": str(self._metadata.get("embeddingModel") or self._metadata.get("vectorizer", "tfidf")),
            "signals": ["Experimental transfer baseline; not used for live decisions"],
        }
