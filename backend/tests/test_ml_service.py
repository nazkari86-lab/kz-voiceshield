from __future__ import annotations

import json
from pathlib import Path

import joblib
import pytest
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression

from backend.app.ml_service import ModelService, ModelUnavailable


def test_loads_complete_bundle_and_runs_inference(tmp_path: Path):
    transcripts = [
        "назовите код из sms срочно",
        "переведите деньги на безопасный счет",
        "напоминание о записи в клинику",
        "никому не сообщайте коды",
    ]
    labels = ["true_positive", "true_positive", "false_positive", "false_positive"]
    vectorizer = TfidfVectorizer(analyzer="char_wb", ngram_range=(1, 3))
    vectors = vectorizer.fit_transform(transcripts)
    classifier = LogisticRegression(random_state=42).fit(vectors, labels)
    model_path = tmp_path / "classifier.joblib"
    joblib.dump({"classifier": classifier, "vectorizer": vectorizer}, model_path)
    model_path.with_name("metadata.json").write_text(
        json.dumps({"modelVersion": "test-baseline", "vectorizer": "tfidf-test"}), encoding="utf-8"
    )

    result = ModelService(model_path).assess("срочно переведите деньги и назовите код")

    assert result["verdict"] in {"fraud", "safe"}
    assert 0 <= result["score"] <= 100
    assert result["model"] == "test-baseline"


def test_rejects_legacy_classifier_without_vectorizer(tmp_path: Path):
    model_path = tmp_path / "classifier.joblib"
    joblib.dump({"classifier": object()}, model_path)

    with pytest.raises(ModelUnavailable, match="legacy or incomplete"):
        ModelService(model_path)

