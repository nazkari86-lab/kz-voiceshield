from __future__ import annotations

import re

_CARD = re.compile(r"(?<!\d)(?:\d[ -]?){13,19}(?!\d)")
_LONG_NUMBER = re.compile(r"(?<!\d)\d{7,}(?!\d)")
_OTP = re.compile(r"(?i)(?:код|code|otp|смс|sms|растау|verification)\s*[:#№-]?\s*\d{4,8}")
_EMAIL = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
_PHONE = re.compile(r"(?<!\d)(?:\+?7|8)[\s()-]?\d{3}[\s()-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}(?!\d)")
_IIN = re.compile(r"(?<!\d)\d{12}(?!\d)")
_IBAN = re.compile(r"\bKZ\d{2}[A-Z0-9]{10,30}\b", re.I)


def redact_text(text: str) -> str:
    """Remove high-risk identifiers before persistence, audit, or model export."""
    value = _IBAN.sub("<IBAN>", text)
    value = _EMAIL.sub("<EMAIL>", value)
    value = _OTP.sub(lambda match: re.sub(r"\d", "*", match.group(0)), value)
    value = _PHONE.sub("<PHONE>", value)
    value = _CARD.sub("<CARD_NUMBER>", value)
    value = _IIN.sub("<IIN>", value)
    return _LONG_NUMBER.sub("<NUMBER>", value)


def detect_language(text: str) -> str:
    """Conservative script signal; this is not a trained language model."""
    lowered = text.lower()
    kk_markers = sum(lowered.count(char) for char in "әғқңөұүһі")
    ru_markers = sum(lowered.count(char) for char in "ыэёъ")
    if kk_markers and ru_markers:
        return "mixed"
    if kk_markers:
        return "kk"
    if ru_markers:
        return "ru"
    return "unknown"
