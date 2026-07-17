from backend.app.privacy import detect_language, redact_text


def test_redaction_removes_kz_sensitive_identifiers() -> None:
    safe = redact_text("Код 472911, ИИН 990101123456, номер +7 777 123 45 67, IBAN KZ86125KZT5004100100")
    assert "472911" not in safe
    assert "990101123456" not in safe
    assert "+7 777" not in safe
    assert "<PHONE>" in safe
    assert "<IBAN>" in safe
    assert "<IIN>" in safe


def test_language_signal_supports_kazakh_russian_and_mixed() -> None:
    assert detect_language("Сәлеметсіз бе, бүгін") == "kk"
    assert detect_language("Здравствуйте, это банк") == "ru"
    assert detect_language("Сәлем, это банк") == "mixed"
