import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from quality_gate import check_holdout  # noqa: E402


class QualityGateTest(unittest.TestCase):
    def test_synthetic_rows_cannot_pass_real_holdout_gate(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "data.jsonl"
            path.write_text(json.dumps({
                "id": "synthetic", "schemaVersion": "voiceshield.dataset.v2",
                "transcript": "это тестовый разговор мошенника", "label": "true_positive", "score": 80,
                "lang": "ru", "provenance": {"trusted": False},
            }) + "\n", encoding="utf-8")
            report = check_holdout([path], minimum_per_label=1, minimum_per_language=1)
        self.assertFalse(report["passed"])
        self.assertIn("label true_positive", " ".join(report["failures"]))


if __name__ == "__main__":
    unittest.main()
