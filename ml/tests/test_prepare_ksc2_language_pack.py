import io
import json
import tarfile
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from prepare_ksc2_language_pack import ATTRIBUTION, MultipartReader, build_pack, validate_parts  # noqa: E402


class Ksc2LanguagePackTest(unittest.TestCase):
    def test_reads_split_archive_and_builds_bounded_pack(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = io.BytesIO()
            with tarfile.open(fileobj=archive, mode="w:gz") as handle:
                for name, text in [
                    ("ISSAI_KSC2/Train/read/one.txt", "Сәлем, банк қызметкері хабарласты"),
                    ("ISSAI_KSC2/Test/crowdsourced/two.txt", "Назовите код из сообщения"),
                    ("ISSAI_KSC2/Test/crowdsourced/empty.txt", "  "),
                ]:
                    payload = text.encode("utf-8")
                    info = tarfile.TarInfo(name)
                    info.size = len(payload)
                    handle.addfile(info, io.BytesIO(payload))

            payload = archive.getvalue()
            cut = len(payload) // 2
            parts = [root / "archive.partaa", root / "archive.partab"]
            parts[0].write_bytes(payload[:cut])
            parts[1].write_bytes(payload[cut:])

            output = root / "pack"
            mobile_output = root / "mobile" / "ksc2.json"
            metadata = build_pack(parts, output, 100, 100, 10, 7, mobile_output)

            self.assertEqual(metadata["statistics"]["utterances"], 2)
            self.assertEqual(metadata["statistics"]["languages"]["kk"], 1)
            self.assertEqual(metadata["statistics"]["languages"]["ru_or_shared"], 1)
            self.assertEqual(json.loads((output / "metadata.json").read_text())["schemaVersion"], "voiceshield.ksc2-language-pack.v1")
            self.assertIn("банк", {row["token"] for row in json.loads((output / "lexicon.json").read_text())})
            self.assertEqual((output / "LICENSE-ATTRIBUTION.txt").read_text().strip(), ATTRIBUTION)
            mobile = json.loads(mobile_output.read_text())
            self.assertEqual(mobile["source"]["license"], "CC BY 4.0")
            self.assertIn("банк", mobile["vocabulary"])

    def test_multipart_reader_requires_parts(self):
        with self.assertRaises(ValueError):
            MultipartReader([])

    def test_rejects_non_contiguous_parts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            parts = [root / "archive.partaa", root / "archive.partac"]
            for part in parts:
                part.write_bytes(b"x")
            with self.assertRaisesRegex(ValueError, "contiguous"):
                validate_parts(parts)


if __name__ == "__main__":
    unittest.main()
