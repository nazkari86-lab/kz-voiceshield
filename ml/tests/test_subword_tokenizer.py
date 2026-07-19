import unittest

from ml.subword_tokenizer import KzRuSubwordTokenizer


class SubwordTokenizerTest(unittest.TestCase):
    def test_fallback_is_explicit_and_handles_ru_kz(self):
        tokenizer = KzRuSubwordTokenizer()
        self.assertFalse(tokenizer.is_model_backed)
        pieces = tokenizer.encode("қауіпсізный перевод")
        self.assertIn("▁қауіпсізный", pieces)
        self.assertTrue(any(piece == "қау" for piece in pieces))


if __name__ == "__main__":
    unittest.main()
