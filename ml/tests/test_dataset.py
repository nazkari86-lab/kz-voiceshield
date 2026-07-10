import json
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dataset import load_trusted_cases  # noqa: E402


class DatasetTest(unittest.TestCase):
    def test_accepts_only_unique_trusted_v2_cases(self):
        trusted = {
            "schemaVersion": "voiceshield.dataset.v2",
            "id": "one",
            "label": "true_positive",
            "score": 90,
            "transcript": "служба безопасности просит назвать код",
            "provenance": {"origin": "manual", "trusted": True},
        }
        untrusted = {**trusted, "id": "two", "transcript": "другой импортированный текст", "provenance": {"origin": "import", "trusted": False}}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "cases.jsonl"
            path.write_text("\n".join([json.dumps(trusted), json.dumps(trusted), json.dumps(untrusted)]), encoding="utf-8")
            cases, rejected = load_trusted_cases(path)
        self.assertEqual(len(cases), 1)
        self.assertEqual(len(rejected), 2)
        self.assertTrue(any("duplicate" in reason for reason in rejected))
        self.assertTrue(any("untrusted" in reason for reason in rejected))


if __name__ == "__main__":
    unittest.main()
