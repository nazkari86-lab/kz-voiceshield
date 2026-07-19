from __future__ import annotations

import hmac
import json
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import Principal


class PayloadCipher:
    def __init__(self, key: str) -> None:
        try:
            self._fernet = Fernet(key.encode("ascii"))
        except (ValueError, TypeError) as error:
            raise RuntimeError("VOICESHIELD_ENCRYPTION_KEY must be a Fernet key") from error

    @staticmethod
    def generate_key() -> str:
        return Fernet.generate_key().decode("ascii")

    def encrypt_json(self, value: Any) -> bytes:
        return self._fernet.encrypt(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))

    def decrypt_json(self, value: bytes) -> Any:
        try:
            return json.loads(self._fernet.decrypt(value).decode("utf-8"))
        except (InvalidToken, UnicodeDecodeError, json.JSONDecodeError) as error:
            raise RuntimeError("Encrypted payload could not be decrypted") from error

    def encrypt_bytes(self, value: bytes) -> bytes:
        return self._fernet.encrypt(value)


bearer = HTTPBearer(auto_error=False)


def authenticate(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> Principal:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token required")
    for token, principal in request.app.state.settings.api_tokens.items():
        if hmac.compare_digest(credentials.credentials, token):
            return principal
    session = request.app.state.repository.get_session_principal(credentials.credentials)
    if session:
        return Principal(user_id=session["userId"], role="member")
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid bearer token")


def require_roles(*roles: str):
    def dependency(principal: Principal = Depends(authenticate)) -> Principal:
        if principal.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return principal

    return dependency
