import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from synthesize import generate  # noqa: E402
from model_card import build_card  # noqa: E402
from schemes import LABEL_FRAUD, LABEL_SAFE, SCHEMES  # noqa: E402
from adapters import adapt  # noqa: E402


class SynthesizeTest(unittest.TestCase):
    def test_generates_labelled_untrusted_rows_for_every_scheme(self):
        rows = generate(per_scheme=6, safe_count=20, seed=1)
        self.assertGreater(len(rows), 20)
        # every row is synthetic + untrusted (must never enter trusted eval)
        self.assertTrue(all(r["provenance"] == {"origin": "synthetic", "trusted": False} for r in rows))
        self.assertTrue(all(r["schemaVersion"] == "voiceshield.dataset.v2" for r in rows))
        fraud_schemes = {r["scheme"] for r in rows if r["label"] == LABEL_FRAUD}
        self.assertEqual(fraud_schemes, set(SCHEMES))
        self.assertTrue(any(r["label"] == LABEL_SAFE for r in rows))
        self.assertEqual({r["lang"] for r in rows}, {"ru", "kz"})

    def test_is_deterministic(self):
        self.assertEqual(generate(4, 10, seed=7), generate(4, 10, seed=7))

    def test_transcripts_are_unique(self):
        rows = generate(per_scheme=8, safe_count=30, seed=3)
        texts = [r["transcript"] for r in rows]
        self.assertEqual(len(texts), len(set(texts)))


class ModelCardTest(unittest.TestCase):
    def test_card_reports_composition_and_zero_trusted_for_synthetic(self):
        rows = generate(per_scheme=5, safe_count=15, seed=2)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "syn.jsonl"
            path.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows), encoding="utf-8")
            card = build_card([path], "test-1")
        self.assertEqual(card["composition"]["total"], len(rows))
        self.assertEqual(card["composition"]["trustedReal"], 0)
        self.assertIn("synthetic", card["composition"]["byOrigin"])
        self.assertEqual(card["status"], "experimental")


class AdapterTest(unittest.TestCase):
    def test_maps_external_rows_as_untrusted(self):
        with tempfile.TemporaryDirectory() as directory:
            raw = Path(directory) / "raw.jsonl"
            raw.write_text("\n".join([
                json.dumps({"text": "служба безопасности банка просит код", "label": "fraud"}),
                json.dumps({"text": "напоминание о встрече завтра утром пожалуйста", "label": "ham"}),
                json.dumps({"text": "too short", "label": "fraud"}),
            ]), encoding="utf-8")
            rows = adapt("korccvi", raw, None, None)
        self.assertEqual(len(rows), 2)  # short one dropped
        self.assertTrue(all(r["provenance"]["trusted"] is False for r in rows))
        self.assertEqual(rows[0]["label"], "true_positive")
        self.assertEqual(rows[1]["label"], "false_positive")


if __name__ == "__main__":
    unittest.main()
