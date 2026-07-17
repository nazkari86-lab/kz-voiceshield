import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from model_registry import build_model_lab_report  # noqa: E402
from quality_lab import error_rates, evaluate_asr, verify_fraud_regression  # noqa: E402
from device_benchmark import build_report  # noqa: E402


class QualityLabTest(unittest.TestCase):
    def test_asr_reports_weighted_language_metrics(self):
        report = evaluate_asr([
            {"id": "kk", "language": "kk", "reference": "Қауіпсіздік коды", "hypothesis": "Қауіпсіздік коды"},
            {"id": "ru", "language": "ru", "reference": "назовите код", "hypothesis": "назовите слово"},
        ], "test-model")
        self.assertEqual(report["sampleCount"], 2)
        self.assertEqual(report["byLanguage"]["kk"]["wer"], 0.0)
        self.assertGreater(report["byLanguage"]["ru"]["wer"], 0.0)
        self.assertGreater(error_rates("a b", "a c")["wer"], 0.0)

    def test_fraud_regression_never_claims_production_evidence(self):
        report = verify_fraud_regression([
            {"id": "x", "text": "bank", "expectedRisk": "high", "expectedMinimumScore": 50},
        ], lambda _: 70)
        self.assertTrue(report["passed"])
        self.assertIn("not production evidence", report["caveat"])

    def test_model_candidates_cannot_enter_live_path(self):
        with tempfile.TemporaryDirectory() as directory:
            report = build_model_lab_report(Path(directory))
        self.assertFalse(report["policy"]["autoDownload"])
        self.assertFalse(report["policy"]["liveShieldMutation"])
        self.assertTrue(all(not candidate["liveDecisionUse"] for candidate in report["candidates"]))

    def test_device_benchmark_reports_real_time_factor_without_audio(self):
        report = build_report([
            {"device": "Xiaomi", "modelId": "fast", "audioMs": 10_000, "wallMs": 4_000, "peakRssMb": 420},
            {"device": "Xiaomi", "modelId": "fast", "audioMs": 10_000, "wallMs": 8_000, "peakRssMb": 450},
        ])
        model = report["models"][0]
        self.assertEqual(model["runs"], 2)
        self.assertTrue(model["liveCandidate"])
        self.assertIn("Live Shield remains unchanged", report["caveat"])


if __name__ == "__main__":
    unittest.main()
