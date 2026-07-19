#!/usr/bin/env python3
"""Build the reproducible RU/KZ SentencePiece artifact used by the engine.

The corpus is intentionally assembled from local, attributed VoiceShield/KZ
artifacts only. It is a tokenizer model, not a fraud classifier and not a
claim that the source corpora are a production holdout set.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
DEFAULT_OUTPUT = ROOT / "artifacts" / "tokenizer" / "kzru_unigram"
CORPUS_FILES = (
    ROOT / "seeds" / "voiceshield_seed_kz.json",
    ROOT / "artifacts" / "ksc2-language-pack-v1" / "lexicon.json",
    ROOT / "artifacts" / "ksc2-language-pack-v1" / "phrases.json",
    ROOT / "artifacts" / "ksc2-language-pack-v1" / "benchmark.jsonl",
    ROOT / "artifacts" / "kazakh-linguistic-pack-v1" / "linguistic-pack.json",
    ROOT / "artifacts" / "synthetic.jsonl",
)
CYRILLIC_OR_LATIN_RU_KZ = re.compile(r"[а-яёқғүұңһәөіӘІӨҮҰҚҒҢҺЁА-Яё]", re.IGNORECASE)


def strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return [item for child in value.values() for item in strings(child)]
    if isinstance(value, list):
        return [item for child in value for item in strings(child)]
    return []


def read_file(path: Path) -> list[str]:
    if not path.exists():
        return []
    if path.suffix == ".jsonl":
        values: list[str] = []
        for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            try:
                values.extend(strings(json.loads(line)))
            except json.JSONDecodeError:
                continue
        return values
    try:
        return strings(json.loads(path.read_text(encoding="utf-8")))
    except json.JSONDecodeError:
        return []


def build_corpus(path: Path) -> int:
    seen: set[str] = set()
    lines: list[str] = []
    for source in CORPUS_FILES:
        for value in read_file(source):
            value = " ".join(value.split())
            if len(value) < 2 or not CYRILLIC_OR_LATIN_RU_KZ.search(value):
                continue
            if value not in seen:
                seen.add(value)
                lines.append(value)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return len(lines)


def train(output_prefix: Path, vocab_size: int) -> None:
    import sentencepiece as spm

    corpus_path = output_prefix.with_suffix(".corpus.txt")
    count = build_corpus(corpus_path)
    if count < 100:
        raise RuntimeError(f"Corpus is too small for tokenizer training: {count} lines")
    spm.SentencePieceTrainer.train(
        input=str(corpus_path),
        model_prefix=str(output_prefix),
        vocab_size=vocab_size,
        model_type="unigram",
        character_coverage=1.0,
        normalization_rule_name="nfkc",
        add_dummy_prefix=True,
        remove_extra_whitespaces=True,
        max_sentence_length=8192,
        shuffle_input_sentence=False,
        seed_sentencepiece_size=0,
        num_threads=1,
        hard_vocab_limit=False,
        unk_id=0,
        bos_id=1,
        eos_id=2,
        pad_id=3,
        minloglevel=2,
    )
    corpus_path.unlink()
    model_path = output_prefix.with_suffix(".model")
    metadata = {
        "schemaVersion": "voiceshield.tokenizer.v1",
        "modelType": "unigram",
        "languages": ["ru", "kk"],
        "vocabSizeTarget": vocab_size,
        "corpusLines": count,
        "sources": [str(path.relative_to(ROOT.parent)) for path in CORPUS_FILES if path.exists()],
        "sha256": hashlib.sha256(model_path.read_bytes()).hexdigest(),
        "holdoutUse": False,
    }
    output_prefix.with_suffix(".metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"SentencePiece model: {output_prefix}.model")
    print(f"Corpus lines: {count}; vocabulary target: {vocab_size}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--vocab-size", type=int, default=2048)
    args = parser.parse_args()
    train(args.output, args.vocab_size)
