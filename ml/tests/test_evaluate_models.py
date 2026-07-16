import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from evaluate_models import _load_llm_predictions, _metrics  # noqa: E402


class EvaluationTest(unittest.TestCase):
    def test_metrics_report_all_contract_labels_without_fake_accuracy(self):
        result = _metrics(
            ["true_positive", "false_positive", "needs_review"],
            ["true_positive", "false_positive", "false_positive"],
        )
        self.assertIn("needs_review", result["byLabel"])
        self.assertEqual(result["byLabel"]["needs_review"]["support"], 1)
        self.assertLess(result["macroF1"], 1.0)

    def test_llm_predictions_reject_duplicate_or_unknown_labels(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "predictions.jsonl"
            path.write_text(json.dumps({"id": "a", "label": "fraud"}) + "\n", encoding="utf-8")
            with self.assertRaises(ValueError):
                _load_llm_predictions(path)


if __name__ == "__main__":
    unittest.main()
