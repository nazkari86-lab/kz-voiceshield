"""Build a compact, model-agnostic language pack from KSC2 split archives.

The source archive is streamed once. Audio is never extracted; only transcript
members are decoded and aggregated into bounded vocabulary, phrase, and
benchmark artifacts suitable for an on-device post-ASR language layer.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import random
import re
import tarfile
import unicodedata
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import BinaryIO, Iterable


TOKEN_RE = re.compile(r"[а-яёәғқңөұүһі]+(?:-[а-яёәғқңөұүһі]+)?", re.IGNORECASE)
PART_RE = re.compile(r"\.part([a-z]{2})$")
KAZAKH_CHARS = frozenset("әғқңөұүһі")
PACK_SCHEMA = "voiceshield.ksc2-language-pack.v1"
ATTRIBUTION = (
    "Our product uses ISSAI Kazakh Speech Corpus 2 "
    "(https://doi.org/10.48342/m90y-aj02), which is available under a "
    "Creative Commons Attribution 4.0 International License."
)


class MultipartReader(io.RawIOBase):
    """Expose ordered files as one non-seekable binary stream."""

    def __init__(self, parts: Iterable[Path]):
        self._index = -1
        self._current: BinaryIO | None = None
        self.bytes_read = 0
        self.parts = list(parts)
        if not self.parts:
            raise ValueError("At least one archive part is required")
        self._open_next()

    def readable(self) -> bool:
        return True

    def _open_next(self) -> bool:
        if self._current is not None:
            self._current.close()
        self._index += 1
        if self._index >= len(self.parts):
            self._current = None
            return False
        self._current = self.parts[self._index].open("rb")
        return True

    def readinto(self, buffer: bytearray | memoryview) -> int:
        view = memoryview(buffer)
        written = 0
        while written < len(view) and self._current is not None:
            count = self._current.readinto(view[written:])
            if count:
                written += count
                self.bytes_read += count
            elif not self._open_next():
                break
        return written

    def close(self) -> None:
        if self._current is not None:
            self._current.close()
            self._current = None
        super().close()


def normalize_text(text: str) -> str:
    value = unicodedata.normalize("NFC", text).replace("\ufeff", " ")
    return re.sub(r"\s+", " ", value).strip()


def language_label(tokens: list[str]) -> str:
    if not tokens:
        return "unknown"
    kazakh = sum(any(char in KAZAKH_CHARS for char in token) for token in tokens)
    if kazakh == 0:
        return "ru_or_shared"
    ratio = kazakh / len(tokens)
    return "kk" if ratio >= 0.3 else "mixed"


def path_metadata(name: str) -> tuple[str, str]:
    parts = Path(name).parts
    split = next((part.lower() for part in parts if part.lower() in {"train", "dev", "test"}), "unknown")
    source_index = next((index for index, part in enumerate(parts) if part.lower() in {"train", "dev", "test"}), -1)
    source = parts[source_index + 1] if source_index >= 0 and source_index + 1 < len(parts) else "unknown"
    return split, source


def bounded_counter(counter: Counter[str], limit: int) -> None:
    if len(counter) <= limit * 2:
        return
    keep = counter.most_common(limit)
    counter.clear()
    counter.update(dict(keep))


def validate_parts(parts: list[Path]) -> None:
    suffixes: list[str] = []
    for part in parts:
        match = PART_RE.search(part.name)
        if match is None:
            raise ValueError(f"Unexpected archive part name: {part.name}")
        if part.stat().st_size <= 0:
            raise ValueError(f"Archive part is empty: {part}")
        suffixes.append(match.group(1))
    numeric = [((ord(value[0]) - 97) * 26) + ord(value[1]) - 97 for value in suffixes]
    if len(set(numeric)) != len(numeric) or numeric != list(range(numeric[0], numeric[0] + len(numeric))):
        raise ValueError(f"Archive parts are not a contiguous ordered sequence: {suffixes}")


@dataclass
class PackStats:
    utterances: int = 0
    decoded_bytes: int = 0
    token_count: int = 0
    skipped: int = 0


def build_pack(
    parts: list[Path],
    output: Path,
    vocabulary_limit: int,
    phrase_limit: int,
    benchmark_limit: int,
    seed: int,
    mobile_output: Path | None = None,
) -> dict[str, object]:
    validate_parts(parts)
    words: Counter[str] = Counter()
    phrases: Counter[str] = Counter()
    languages: Counter[str] = Counter()
    splits: Counter[str] = Counter()
    sources: Counter[str] = Counter()
    benchmark: list[dict[str, object]] = []
    stats = PackStats()
    rng = random.Random(seed)
    digest = hashlib.sha256()

    raw = MultipartReader(parts)
    buffered = io.BufferedReader(raw, buffer_size=1024 * 1024)
    try:
        with tarfile.open(fileobj=buffered, mode="r|gz") as archive:
            for member in archive:
                if not member.isfile() or not member.name.lower().endswith(".txt"):
                    continue
                if member.size < 0 or member.size > 1024 * 1024:
                    stats.skipped += 1
                    continue
                extracted = archive.extractfile(member)
                if extracted is None:
                    stats.skipped += 1
                    continue
                payload = extracted.read()
                try:
                    text = normalize_text(payload.decode("utf-8"))
                except UnicodeDecodeError:
                    stats.skipped += 1
                    continue
                tokens = [token.lower() for token in TOKEN_RE.findall(text)]
                if not text or not tokens:
                    stats.skipped += 1
                    continue

                stats.utterances += 1
                stats.decoded_bytes += len(payload)
                stats.token_count += len(tokens)
                digest.update(text.encode("utf-8"))
                digest.update(b"\n")
                words.update(tokens)
                phrases.update(f"{left} {right}" for left, right in zip(tokens, tokens[1:]))
                bounded_counter(phrases, max(phrase_limit * 12, 50_000))

                language = language_label(tokens)
                split, source = path_metadata(member.name)
                languages[language] += 1
                splits[split] += 1
                sources[source] += 1

                row = {
                    "id": Path(member.name).stem,
                    "language": language,
                    "source": source,
                    "split": split,
                    "text": text,
                    "tokenCount": len(tokens),
                }
                if len(benchmark) < benchmark_limit:
                    benchmark.append(row)
                else:
                    index = rng.randrange(stats.utterances)
                    if index < benchmark_limit:
                        benchmark[index] = row
    finally:
        buffered.close()

    output.mkdir(parents=True, exist_ok=True)
    generated_at = datetime.now(timezone.utc).isoformat()
    metadata: dict[str, object] = {
        "schemaVersion": PACK_SCHEMA,
        "packVersion": "1.0.0",
        "generatedAt": generated_at,
        "source": {
            "name": "ISSAI Kazakh Speech Corpus 2",
            "doi": "10.48342/m90y-aj02",
            "license": "CC BY 4.0",
            "attribution": ATTRIBUTION,
            "archiveParts": [part.name for part in parts],
            "archiveBytesRead": raw.bytes_read,
            "transcriptDigestSha256": digest.hexdigest(),
        },
        "statistics": {
            "utterances": stats.utterances,
            "decodedTranscriptBytes": stats.decoded_bytes,
            "tokens": stats.token_count,
            "uniqueTokens": len(words),
            "skippedTranscripts": stats.skipped,
            "languages": dict(languages),
            "splits": dict(splits),
            "sources": dict(sources.most_common()),
        },
        "limits": {
            "vocabulary": vocabulary_limit,
            "phrases": phrase_limit,
            "benchmark": benchmark_limit,
        },
    }
    vocabulary = [{"token": token, "count": count} for token, count in words.most_common(vocabulary_limit)]
    common_phrases = [{"phrase": phrase, "count": count} for phrase, count in phrases.most_common(phrase_limit)]

    (output / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output / "lexicon.json").write_text(json.dumps(vocabulary, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    (output / "phrases.json").write_text(json.dumps(common_phrases, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    with (output / "benchmark.jsonl").open("w", encoding="utf-8") as handle:
        for row in sorted(benchmark, key=lambda item: (str(item["split"]), str(item["id"]))):
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    (output / "LICENSE-ATTRIBUTION.txt").write_text(ATTRIBUTION + "\n", encoding="utf-8")
    if mobile_output is not None:
        mobile_output.parent.mkdir(parents=True, exist_ok=True)
        mobile_pack = {
            "schemaVersion": PACK_SCHEMA,
            "packVersion": metadata["packVersion"],
            "generatedAt": generated_at,
            "source": metadata["source"],
            "statistics": metadata["statistics"],
            "vocabulary": [row["token"] for row in vocabulary],
            "phrases": [row["phrase"] for row in common_phrases],
        }
        temporary = mobile_output.with_suffix(mobile_output.suffix + ".tmp")
        temporary.write_text(json.dumps(mobile_pack, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        temporary.replace(mobile_output)
    return metadata


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("parts", nargs="+", type=Path, help="Ordered KSC2 .part* files or one glob expanded by the shell")
    parser.add_argument("--output", type=Path, default=Path("ml/artifacts/ksc2-language-pack-v1"))
    parser.add_argument("--vocabulary-limit", type=int, default=20_000)
    parser.add_argument("--phrase-limit", type=int, default=10_000)
    parser.add_argument("--benchmark-limit", type=int, default=300)
    parser.add_argument("--mobile-output", type=Path, help="Optional compact JSON artifact bundled by the mobile app")
    parser.add_argument("--seed", type=int, default=20260715)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    parts = sorted(args.parts)
    missing = [str(part) for part in parts if not part.is_file()]
    if missing:
        raise SystemExit(f"Missing archive parts: {', '.join(missing)}")
    metadata = build_pack(
        parts=parts,
        output=args.output,
        vocabulary_limit=max(100, args.vocabulary_limit),
        phrase_limit=max(100, args.phrase_limit),
        benchmark_limit=max(10, args.benchmark_limit),
        seed=args.seed,
        mobile_output=args.mobile_output,
    )
    print(json.dumps(metadata, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
