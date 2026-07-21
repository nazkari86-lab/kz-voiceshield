import unittest
from pathlib import Path

from ml.build_asvspoof_manifest import parse_key_line


class AsvspoofManifestTests(unittest.TestCase):
    def test_df_key_fields_are_mapped_to_correct_metadata(self):
        row = parse_key_line(
            "LA_0023 DF_E_2000011 nocodec asvspoof A14 spoof notrim progress traditional_vocoder - -",
            Path("/audio"),
        )
        self.assertIsNotNone(row)
        assert row is not None
        self.assertEqual(row["label"], "synthetic")
        self.assertEqual(row["generatorId"], "traditional_vocoder")
        self.assertEqual(row["codec"], "nocodec")

    def test_bonafide_is_not_attributed_to_a_generator(self):
        row = parse_key_line(
            "LA_0023 DF_E_2000012 nocodec asvspoof - bonafide notrim progress - - -",
            Path("/audio"),
        )
        self.assertIsNotNone(row)
        assert row is not None
        self.assertEqual(row["label"], "human")
        self.assertEqual(row["generatorId"], "human")


if __name__ == "__main__":
    unittest.main()
