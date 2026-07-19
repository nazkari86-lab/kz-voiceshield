from backend.app.external_intel import ExternalIntelService, ExternalIntelSettings


def test_number_lookup_provider_is_disabled_without_secrets():
    service = ExternalIntelService(ExternalIntelSettings())
    assert service.number_available is False


def test_phishtank_can_run_on_public_low_rate_limit_without_key():
    service = ExternalIntelService(ExternalIntelSettings())
    assert service.phishing_available is True


def test_number_normalization_is_strict():
    service = ExternalIntelService(ExternalIntelSettings())
    try:
        service.lookup_number("abc")
    except ValueError as error:
        assert "7-15 digits" in str(error)
    else:
        raise AssertionError("invalid phone was accepted")
