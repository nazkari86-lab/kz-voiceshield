import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dataset_registry import build_report  # noqa: E402


class DatasetRegistryTest(unittest.TestCase):
    def test_external_entries_are_never_trusted_or_live(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "fraud").mkdir()
            (root / "fraud/difraud_sms_train.jsonl").write_text("{}\n", encoding="utf-8")
            report = build_report(root)
        self.assertFalse(report["policy"]["externalTrusted"])
        self.assertFalse(report["policy"]["liveDecisionUse"])
        entry = next(item for item in report["entries"] if item["id"] == "difraud_sms")
        self.assertTrue(entry["exists"])
        self.assertFalse(entry["trusted"])
        self.assertEqual(len(entry["sha256"]), 64)


if __name__ == "__main__":
    unittest.main()
