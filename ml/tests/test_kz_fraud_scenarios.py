import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kz_fraud_scenarios import OFFICIAL_SCENARIOS, generate_bootstrap, validate_rows  # noqa: E402


class KazakhstanScenarioTest(unittest.TestCase):
    def test_catalog_has_traceable_sources_and_bilingual_templates(self):
        self.assertGreaterEqual(len(OFFICIAL_SCENARIOS), 5)
        for item in OFFICIAL_SCENARIOS:
            self.assertTrue(item.source_url.startswith("https://www.gov.kz/"))
            self.assertTrue(item.ru_templates)
            self.assertTrue(item.kz_templates)

    def test_generated_rows_are_untrusted_and_valid(self):
        rows = generate_bootstrap(per_scenario=2, safe_count=8, seed=7)
        self.assertEqual(validate_rows(rows), [])
        self.assertTrue(all(row["provenance"]["trusted"] is False for row in rows))
        self.assertEqual({row["lang"] for row in rows}, {"ru", "kz"})
        self.assertTrue(any(row["label"] == "false_positive" for row in rows))

    def test_generated_rows_are_deterministic(self):
        self.assertEqual(generate_bootstrap(2, 8, 5), generate_bootstrap(2, 8, 5))


if __name__ == "__main__":
    unittest.main()
