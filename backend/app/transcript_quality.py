from __future__ import annotations

import re
from typing import Literal


QualityLevel = Literal["good", "degraded", "unusable"]
_TOKEN = re.compile(r"[а-яёәғқңөұүһі]+(?:-[а-яёәғқңөұүһі]+)?", re.I)
_HALLUCINATIONS = (
    "субтитры", "подписывайтесь", "спасибо за просмотр",
    "thanks for watching", "字幕", "ご視聴ありがとうございました",
)


def normalize_transcript(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\u00a0", " ")).strip()


def detect_transcript_language(text: str) -> str:
    tokens = _TOKEN.findall(text.lower())
    if not tokens:
        return "unknown"
    kazakh = sum(any(char in token for char in "әғқңөұүһі") for token in tokens)
    if kazakh == 0:
        return "ru"
    return "kk" if kazakh / len(tokens) >= 0.3 else "mixed"


def assess_transcript_quality(text: str, confidence: int | None = None) -> tuple[QualityLevel, list[str]]:
    normalized = normalize_transcript(text)
    folded = normalized.lower()
    flags: list[str] = []
    if not normalized:
        flags.append("empty")
    words = normalized.lower().split()
    if len(words) >= 8 and len(set(words)) / len(words) < 0.3:
        flags.append("repetition")
    if any(phrase in folded for phrase in _HALLUCINATIONS):
        flags.append("non_speech_hallucination")
    if len(normalized) < 12 and len(words) < 3:
        flags.append("too_short")
    if confidence is not None and confidence < 55:
        flags.append("low_confidence")
    if "empty" in flags or "non_speech_hallucination" in flags:
        return "unusable", flags
    return ("degraded" if flags else "good"), flags
