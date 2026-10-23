from datetime import timedelta

import jwt
import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.core.security import (
    TokenData,
    create_access_token,
    create_refresh_token,
    decode_token,
    enforce_tenant_ownership,
    hash_password,
    require_scopes,
    verify_password,
)


def test_password_hash_roundtrip():
    digest = hash_password("correct horse battery staple")
    assert digest != "correct horse battery staple"
    assert verify_password("correct horse battery staple", digest)
    assert not verify_password("wrong", digest)


def test_access_token_claims():
    token = create_access_token("tenant_acme", "user-1", ["Retailer"], ["ai:render", "payments:write"])
    payload = decode_token(token)
    assert payload["sub"] == "user-1"
    assert payload["tenant_id"] == "tenant_acme"
    assert payload["typ"] == "access"
    assert payload["iss"] == settings.JWT_ISSUER
    assert payload["aud"] == settings.JWT_AUDIENCE


def test_refresh_token_rejected_as_access():
    token = create_refresh_token("tenant_acme", "user-1", [], [])
    with pytest.raises(HTTPException) as exc:
        decode_token(token, expected_type="access")
    assert exc.value.status_code == 401


def test_expired_token_rejected():
    token = create_access_token("t", "u", [], [], expires_delta=timedelta(seconds=-5))
    with pytest.raises(HTTPException) as exc:
        decode_token(token)
    assert exc.value.status_code == 401


def test_tampered_token_rejected():
    token = create_access_token("t", "u", [], [])
    tampered = token[:-3] + ("abc" if not token.endswith("abc") else "xyz")
    with pytest.raises(HTTPException):
        decode_token(tampered)


def test_token_without_audience_rejected():
    payload = jwt.encode({"sub": "u", "tenant_id": "t", "typ": "access"}, settings.SECRET_KEY, algorithm="HS256")
    with pytest.raises(HTTPException):
        decode_token(payload)


def test_scope_checker_allows_and_denies():
    checker = require_scopes("payments:write")
    allowed = TokenData(user_id="u", tenant_id="t", scopes=["payments:write"])
    assert checker(allowed) is allowed

    admin = TokenData(user_id="a", tenant_id="t", scopes=["admin:all"])
    assert checker(admin) is admin

    denied = TokenData(user_id="u", tenant_id="t", scopes=["payments:read"])
    with pytest.raises(HTTPException) as exc:
        checker(denied)
    assert exc.value.status_code == 403


def test_cross_tenant_access_is_hidden_as_404():
    user = TokenData(user_id="u", tenant_id="tenant_a", scopes=["retailer:read"])
    with pytest.raises(HTTPException) as exc:
        enforce_tenant_ownership("tenant_b", user)
    assert exc.value.status_code == 404


def test_admin_can_cross_tenant():
    admin = TokenData(user_id="a", tenant_id="tenant_a", scopes=["admin:all"])
    enforce_tenant_ownership("tenant_b", admin)  # no raise
