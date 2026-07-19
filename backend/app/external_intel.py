"""Optional external reputation lookups.

Keys stay on the backend. These providers enrich evidence only; callers must
never turn a lookup result into an automatic block without local corroboration.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
import re
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


class ExternalIntelUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class ExternalIntelSettings:
    numverify_api_key: str = ""
    abstract_api_key: str = ""
    phishtank_api_key: str = ""
    timeout_seconds: float = 8.0


def _safe_error(error: Exception) -> str:
    if isinstance(error, HTTPError):
        return f"provider_http_{error.code}"
    if isinstance(error, URLError):
        return "provider_network_error"
    return "provider_error"


def _json_request(url: str, *, method: str = "GET", body: bytes | None = None, headers: dict[str, str] | None = None, timeout: float = 8.0) -> dict[str, Any]:
    request = Request(url, data=body, method=method, headers=headers or {})
    try:
        with urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (OSError, ValueError) as error:
        raise ExternalIntelUnavailable(_safe_error(error)) from error
    if not isinstance(payload, dict):
        raise ExternalIntelUnavailable("provider_invalid_response")
    return payload


def _normalize_phone(value: str) -> str:
    phone = re.sub(r"[^0-9+]", "", value.strip())
    if phone.startswith("00"):
        phone = "+" + phone[2:]
    if not re.fullmatch(r"\+?[0-9]{7,15}", phone):
        raise ValueError("phone must contain 7-15 digits")
    return phone


def _normalize_url(value: str) -> str:
    url = value.strip()
    if not re.match(r"^https?://", url, re.IGNORECASE) or len(url) > 4_096:
        raise ValueError("url must be an http(s) URL")
    return url


class ExternalIntelService:
    def __init__(self, settings: ExternalIntelSettings) -> None:
        self.settings = settings

    @property
    def number_available(self) -> bool:
        return bool(self.settings.numverify_api_key or self.settings.abstract_api_key)

    @property
    def phishing_available(self) -> bool:
        # PhishTank accepts requests without app_key at a lower rate limit.
        return True

    def lookup_number(self, value: str) -> dict[str, Any]:
        phone = _normalize_phone(value)
        providers: list[tuple[str, str]] = []
        if self.settings.numverify_api_key:
            providers.append(("numverify", self.settings.numverify_api_key))
        if self.settings.abstract_api_key:
            providers.append(("abstractapi", self.settings.abstract_api_key))
        if not providers:
            raise ExternalIntelUnavailable("number_lookup_not_configured")
        errors: list[str] = []
        for provider, key in providers:
            try:
                if provider == "numverify":
                    query = urlencode({"access_key": key, "number": phone, "format": "1"})
                    payload = _json_request(
                        f"https://apilayer.net/api/validate?{query}",
                        timeout=self.settings.timeout_seconds,
                    )
                    if payload.get("success") is False:
                        raise ExternalIntelUnavailable("provider_rejected_request")
                    return self._number_result(provider, phone, payload)
                query = urlencode({"api_key": key, "phone": phone})
                payload = _json_request(
                    f"https://phonevalidation.abstractapi.com/v1/?{query}",
                    timeout=self.settings.timeout_seconds,
                )
                return self._number_result(provider, phone, payload)
            except (ExternalIntelUnavailable, ValueError) as error:
                errors.append(str(error))
        raise ExternalIntelUnavailable(errors[-1] if errors else "provider_unavailable")

    @staticmethod
    def _number_result(provider: str, phone: str, payload: dict[str, Any]) -> dict[str, Any]:
        valid = payload.get("valid")
        country_object = payload.get("country")
        country_from_object = country_object.get("code") if isinstance(country_object, dict) else None
        country = payload.get("country_code") or country_from_object
        carrier = payload.get("carrier")
        line_type = payload.get("line_type") or payload.get("type")
        return {
            "provider": provider,
            "valid": bool(valid) if isinstance(valid, bool) else None,
            "countryCode": country if isinstance(country, str) else None,
            "carrier": carrier if isinstance(carrier, str) else None,
            "lineType": line_type if isinstance(line_type, str) else None,
            "internationalFormat": payload.get("international_format") if isinstance(payload.get("international_format"), str) else phone,
            "evidenceOnly": True,
        }

    def check_url(self, value: str) -> dict[str, Any]:
        url = _normalize_url(value)
        body = urlencode({"url": url, "format": "json", "app_key": self.settings.phishtank_api_key}).encode()
        payload = _json_request(
            "https://checkurl.phishtank.com/checkurl/",
            method="POST",
            body=body,
            headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": "KZ-VoiceShield/2.x security research"},
            timeout=self.settings.timeout_seconds,
        )
        results = payload.get("results") if isinstance(payload.get("results"), dict) else {}
        return {
            "provider": "phishtank",
            "url": url,
            "inDatabase": bool(results.get("in_database")),
            "verified": bool(results.get("verified")),
            "online": bool(results.get("online")),
            "evidenceOnly": True,
        }
