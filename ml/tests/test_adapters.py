import csv
import json
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from adapters import adapt  # noqa: E402


class AdapterTest(unittest.TestCase):
    def test_fraudlens_preserves_fraud_metadata_and_untrusted_gate(self):
        row = {
            "text_clean": "Банк просит срочно назвать код из SMS",
            "fraud_type": "bank_scam",
            "target": "money",
            "method": "urgency",
            "platform": "phone",
            "severity": "high",
        }
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "fraudlens.jsonl"
            source.write_text(json.dumps(row, ensure_ascii=False) + "\n", encoding="utf-8")
            rows = adapt("fraudlens_ru", source, None, None)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["label"], "true_positive")
        self.assertEqual(rows[0]["scheme"], "bank_scam")
        self.assertEqual(rows[0]["externalMetadata"]["method"], "urgency")
        self.assertFalse(rows[0]["provenance"]["trusted"])

    def test_csv_field_limit_and_numeric_spam_labels(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "spam.csv"
            with source.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=["text", "is_spam"])
                writer.writeheader()
                writer.writerow({"text": "Обычное короткое сообщение", "is_spam": "0"})
                writer.writerow({"text": "Срочно назовите код из SMS", "is_spam": "1"})
            rows = adapt("anti_spam_ru", source, None, None)
        self.assertEqual([row["label"] for row in rows], ["false_positive", "true_positive"])


if __name__ == "__main__":
    unittest.main()
