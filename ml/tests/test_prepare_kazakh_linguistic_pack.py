import json
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from prepare_kazakh_linguistic_pack import SCHEMA, build_pack  # noqa: E402


class KazakhLinguisticPackTest(unittest.TestCase):
    def test_builds_attributed_aggregate_without_sentence_text(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            ud = root / "kk.conllu"
            ud.write_text(
                "# text = Кітаптарымыздан оқыңыз.\n"
                "1\tКітаптарымыздан\tкітап\tNOUN\tNOUN\tCase=Abl|Number=Plur|Poss=1\t2\tobl\t_\t_\n"
                "2\tоқыңыз\tоқы\tVERB\tVERB\tMood=Imp|Person=2\t0\troot\t_\tSpaceAfter=No\n\n",
                encoding="utf-8",
            )
            lexc = root / "kaz.lexc"
            lexc.write_text("%<n%> noun\nLEXICON CASES\n%<abl%> ablative\n", encoding="utf-8")
            output = root / "output"
            pack = build_pack(output, [ud], None, lexc, 20)
            persisted = json.loads((output / "linguistic-pack.json").read_text(encoding="utf-8"))
            self.assertEqual(pack["schemaVersion"], SCHEMA)
            self.assertEqual(persisted["statistics"]["tokens"], 2)
            self.assertEqual(persisted["commonLemmas"][0]["value"], "кітап")
            self.assertIn("CC BY-SA 4.0", (output / "LICENSE-ATTRIBUTION.txt").read_text(encoding="utf-8"))
            self.assertNotIn("Кітаптарымыздан", json.dumps(persisted, ensure_ascii=False))

    def test_requires_a_source(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                build_pack(Path(directory) / "output", [], None, None, 10)


if __name__ == "__main__":
    unittest.main()
