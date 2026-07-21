import unittest

from ml.aasist_benchmark import binary_metrics, equal_error_rate, roc_auc, threshold_for_fpr


class AasistBenchmarkTests(unittest.TestCase):
    labels = [0, 0, 1, 1]
    scores = [0.05, 0.2, 0.8, 0.95]

    def test_auc_and_eer_are_bounded(self):
        self.assertEqual(roc_auc(self.labels, self.scores), 1.0)
        eer, threshold = equal_error_rate(self.labels, self.scores)
        self.assertGreaterEqual(eer, 0.0)
        self.assertLessEqual(eer, 1.0)
        self.assertGreaterEqual(threshold, 0.0)

    def test_low_fpr_threshold_returns_a_valid_operating_point(self):
        point = threshold_for_fpr(self.labels, self.scores, 0.01)
        self.assertLessEqual(point["fpr"], 0.01)

    def test_confusion_metrics(self):
        point = binary_metrics(self.labels, self.scores, 0.5)
        self.assertEqual((point["tp"], point["fp"], point["tn"], point["fn"]), (2, 0, 2, 0))


if __name__ == "__main__":
    unittest.main()
