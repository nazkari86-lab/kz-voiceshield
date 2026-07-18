import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from asr_benchmark import cer, evaluate, wer  # noqa: E402


class AsrBenchmarkTest(unittest.TestCase):
    def test_perfect_and_nonperfect_scores(self):
        self.assertEqual(wer("Сәлем әлем", "Сәлем әлем"), 0)
        self.assertGreater(wer("Сәлем әлем", "Сәлем"), 0)
        self.assertEqual(cer("тест", "тест"), 0)

    def test_reports_language_breakdown(self):
        report = evaluate([
            {"id": "ru-1", "language": "ru", "reference": "банк звонит", "hypothesis": "банк звонит", "split": "test"},
            {"id": "kz-1", "language": "kz", "reference": "ақша аудармаңыз", "hypothesis": "ақша аудармаңыз", "split": "test"},
        ])
        self.assertEqual(report["overall"]["wer"], 0)
        self.assertEqual(set(report["byLanguage"]), {"ru", "kz"})


if __name__ == "__main__":
    unittest.main()
