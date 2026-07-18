import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from voice_auth_lab import evaluate_scores, validate_manifest  # noqa: E402


def row(sample_id, label, split, speaker, generator="human", score=0.1):
    return {
        "id": sample_id, "schemaVersion": "voiceshield.voice-auth.v1", "label": label,
        "split": split, "speakerId": speaker, "generatorId": generator,
        "language": "ru", "consent": True, "syntheticProbability": score,
    }


class VoiceAuthLabTest(unittest.TestCase):
    def test_manifest_rejects_speaker_leakage(self):
        errors = validate_manifest([row("a", "human", "train", "speaker-1"), row("b", "human", "test", "speaker-1")])
        self.assertTrue(any("multiple splits" in error for error in errors))

    def test_scores_report_false_positive_rate_and_shadow_policy(self):
        report = evaluate_scores([
            row("a", "synthetic", "test", "s-1", "tts-a", 0.9),
            row("b", "human", "test", "s-2", "human", 0.8),
            row("c", "human", "test", "s-3", "human", 0.1),
            row("d", "synthetic", "test", "s-4", "tts-b", 0.2),
        ])
        self.assertEqual(report["confusionMatrix"], {"tp": 1, "fp": 1, "tn": 1, "fn": 1})
        self.assertEqual(report["falsePositiveRate"], 0.5)
        self.assertFalse(report["liveDecisionUse"])


if __name__ == "__main__":
    unittest.main()
