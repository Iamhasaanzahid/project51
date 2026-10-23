"""
Authentication & authorisation primitives.

* OAuth2 password flow backed by short-lived JWT access tokens (15 min).
* Refresh tokens carry a distinct `typ` claim and are never accepted as access.
* Scope-based RBAC distinguishes retailers from system administrators.
* `require_scopes` is the only sanctioned way to protect a route.
"""
from __future__ import annotations

import base64
import hashlib
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.core.config import settings

bearer_scheme = HTTPBearer(
    auto_error=False,
    description="JWT access token issued by POST /api/v1/auth/login",
)

ADMIN_SCOPE = "admin:all"


class TokenData(BaseModel):
    user_id: str
    tenant_id: str
    roles: list[str] = []
    scopes: list[str] = []
    token_id: str = ""


# --------------------------------------------------------------------- passwords
def _prehash(password: str) -> bytes:
    """SHA-256 + base64 before bcrypt.

    bcrypt only consumes 72 bytes; pre-hashing removes the truncation cliff and
    supports arbitrary-length passphrases without silent collisions.
    """
    return base64.b64encode(hashlib.sha256(password.encode("utf-8")).digest())


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_prehash(password), bcrypt.gensalt(rounds=12)).decode("ascii")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(_prehash(plain_password), hashed_password.encode("ascii"))
    except (ValueError, TypeError, UnicodeError):
        return False


# ------------------------------------------------------------------------- JWT
def _base_claims(subject: str, tenant_id: str, roles: list[str], scopes: list[str], typ: str) -> dict[str, Any]:
    now = datetime.now(UTC)
    return {
        "sub": subject,
        "tenant_id": tenant_id,
        "roles": roles,
        "scopes": scopes,
        "typ": typ,
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE,
        "iat": now,
        "nbf": now,
        "jti": str(uuid.uuid4()),
    }


def create_access_token(
    tenant_id: str,
    user_id: str,
    roles: list[str] | None = None,
    scopes: list[str] | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    expire = datetime.now(UTC) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    claims = _base_claims(user_id, tenant_id, roles or [], scopes or [], "access")
    claims["exp"] = expire
    return jwt.encode(claims, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(tenant_id: str, user_id: str, roles: list[str] | None = None, scopes: list[str] | None = None) -> str:
    expire = datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    claims = _base_claims(user_id, tenant_id, roles or [], scopes or [], "refresh")
    claims["exp"] = expire
    return jwt.encode(claims, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str, expected_type: str = "access") -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            audience=settings.JWT_AUDIENCE,
            issuer=settings.JWT_ISSUER,
            options={"require": ["exp", "iat", "nbf", "sub", "jti", "typ"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    if payload.get("typ") != expected_type:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> TokenData:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(credentials.credentials, expected_type="access")
    user_id = payload.get("sub")
    tenant_id = payload.get("tenant_id")
    if not user_id or not tenant_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token claims")
    return TokenData(
        user_id=str(user_id),
        tenant_id=str(tenant_id),
        roles=list(payload.get("roles", [])),
        scopes=list(payload.get("scopes", [])),
        token_id=str(payload.get("jti", "")),
    )


# ----------------------------------------------------------------------- RBAC
class SecurityScopeChecker:
    """Dependency enforcing a set of OAuth2 scopes (admin:all bypasses all)."""

    def __init__(self, required_scopes: list[str]):
        self.required_scopes = required_scopes

    def __call__(self, current_user: TokenData = Depends(get_current_user)) -> TokenData:
        if ADMIN_SCOPE in current_user.scopes:
            return current_user
        missing = [s for s in self.required_scopes if s not in current_user.scopes]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient privileges",
            )
        return current_user


def require_scopes(*scopes: str) -> Callable[..., TokenData]:
    return SecurityScopeChecker(list(scopes))


# --------------------------------------------------------------- tenant guard
def enforce_tenant_ownership(resource_tenant_id: str, current_user: TokenData) -> None:
    """IDOR guard: the caller may only touch resources of its own tenant."""
    if current_user.tenant_id != resource_tenant_id and ADMIN_SCOPE not in current_user.scopes:
        # Deliberately do not reveal whether the resource exists.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")
