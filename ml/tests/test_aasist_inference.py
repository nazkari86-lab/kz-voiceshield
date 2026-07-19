import unittest

import numpy as np

from ml.aasist_inference import AasistScorer, WINDOW_SAMPLES


class AasistInferenceTests(unittest.TestCase):
    def test_real_artifact_returns_bounded_evidence(self):
        result = AasistScorer().score(np.zeros(16000, dtype=np.float32))
        self.assertGreaterEqual(result.synthetic_voice_score, 0.0)
        self.assertLessEqual(result.synthetic_voice_score, 1.0)
        self.assertAlmostEqual(
            result.synthetic_voice_score + result.bona_fide_score, 1.0, places=5
        )
        self.assertEqual(result.window_samples, WINDOW_SAMPLES)
        self.assertFalse(result.calibrated)

    def test_resampling_and_stereo_input_are_supported(self):
        samples = np.zeros((8000, 2), dtype=np.float32)
        result = AasistScorer().score(samples, sample_rate=8000)
        self.assertEqual(result.sample_rate, 16000)


if __name__ == "__main__":
    unittest.main()
