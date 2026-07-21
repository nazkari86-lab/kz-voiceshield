from app.transcript_quality import assess_transcript_quality, detect_transcript_language


def test_quality_detects_kazakh_and_preserves_safe_text():
    level, flags = assess_transcript_quality("Сіздің шотыңыз бұғатталды, кодты айтыңыз.")
    assert level == "good"
    assert flags == []
    assert detect_transcript_language("Сіздің шотыңыз бұғатталды") == "kk"


def test_quality_rejects_media_hallucination():
    level, flags = assess_transcript_quality("Спасибо за просмотр")
    assert level == "unusable"
    assert "non_speech_hallucination" in flags


def test_quality_marks_low_confidence_as_degraded():
    level, flags = assess_transcript_quality("Назовите код из SMS", 42)
    assert level == "degraded"
    assert "low_confidence" in flags
