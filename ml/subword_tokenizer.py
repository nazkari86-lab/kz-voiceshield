"""RU/KZ subword tokenizer adapter.

Uses a real SentencePiece model when one is supplied and an explicit
dependency-free fallback otherwise. The fallback is useful for tests only; it
must not be presented as a trained tokenizer.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any


class KzRuSubwordTokenizer:
    def __init__(self, model_path: Path | str | None = None) -> None:
        self.model_path = Path(model_path) if model_path else None
        self._processor: Any | None = None
        if self.model_path and self.model_path.exists():
            try:
                import sentencepiece as spm  # type: ignore[import-not-found]
                self._processor = spm.SentencePieceProcessor(model_file=str(self.model_path))
            except (ImportError, RuntimeError, OSError) as error:
                raise RuntimeError("SentencePiece model was supplied but could not be loaded") from error

    @property
    def is_model_backed(self) -> bool:
        return self._processor is not None

    def encode(self, text: str) -> list[str]:
        if self._processor is not None:
            return list(self._processor.encode(text, out_type=str))
        words = re.findall(r"[a-zа-яёқғүұңһәөі0-9]+", text.lower().replace("ё", "е"))
        pieces: list[str] = []
        for word in words:
            pieces.append(f"▁{word}")
            if len(word) >= 4:
                pieces.extend(word[index:index + 3] for index in range(0, len(word) - 2, 3))
        return pieces


def load_tokenizer(model_path: Path | str | None = None) -> KzRuSubwordTokenizer:
    return KzRuSubwordTokenizer(model_path)
