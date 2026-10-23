"""Authentication endpoints: login, refresh, identity."""
from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import metrics
from app.core.config import settings
from app.core.database import get_db, tenant_session
from app.core.security import (
    TokenData,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    verify_password,
)
from app.models.tenant import Tenant
from app.models.user import User
from app.services.audit_service import audit

logger = logging.getLogger("aifabric.auth")
router = APIRouter(prefix="/auth", tags=["auth"])

MAX_FAILED_LOGINS = 5
LOCKOUT_MINUTES = 15


class LoginRequest(BaseModel):
    tenant_slug: str = Field(..., min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=256)


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    ip = _client_ip(request)
    tenant = (await db.execute(select(Tenant).where(Tenant.slug == body.tenant_slug))).scalar_one_or_none()
    if tenant is None or not tenant.is_active or tenant.deleted_at is not None:
        # Constant-ish response; do not disclose tenant existence.
        audit.auth_failure("unknown_tenant", body.tenant_slug, ip, body.email)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    async with tenant_session(tenant.slug) as session:
        user = (await session.execute(select(User).where(User.email == body.email))).scalar_one_or_none()

        now = datetime.now(UTC)
        if user and user.locked_until and user.locked_until > now:
            audit.auth_failure("locked", tenant.slug, ip, body.email)
            raise HTTPException(status_code=status.HTTP_423_LOCKED, detail="Account temporarily locked")

        if user is None or not user.is_active or not verify_password(body.password, user.password_hash):
            if user is not None:
                user.failed_login_count += 1
                if user.failed_login_count >= MAX_FAILED_LOGINS:
                    user.locked_until = now + timedelta(minutes=LOCKOUT_MINUTES)
                    user.failed_login_count = 0
                await session.flush()
            audit.auth_failure("bad_credentials", tenant.slug, ip, body.email)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

        user.failed_login_count = 0
        user.locked_until = None
        user.last_login_at = now
        await session.flush()

        roles = list(user.roles or [])
        scopes = ["admin:all"] if user.is_system_admin else list(user.scopes or [])

    audit.auth_success(tenant.slug, str(user.id), ip)
    metrics.AUTH_ATTEMPTS.labels(result="success", tenant=tenant.slug).inc()

    access = create_access_token(tenant.slug, str(user.id), roles, scopes)
    refresh = create_refresh_token(tenant.slug, str(user.id), roles, scopes)
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, request: Request):
    payload = decode_token(body.refresh_token, expected_type="refresh")
    tenant_id = payload["tenant_id"]
    user_id = payload["sub"]
    roles = list(payload.get("roles", []))
    scopes = list(payload.get("scopes", []))

    access = create_access_token(tenant_id, user_id, roles, scopes)
    new_refresh = create_refresh_token(tenant_id, user_id, roles, scopes)
    return TokenResponse(access_token=access, refresh_token=new_refresh, expires_in=15 * 60)


@router.get("/me")
async def me(current: TokenData = Depends(get_current_user)):
    return {
        "user_id": current.user_id,
        "tenant_id": current.tenant_id,
        "roles": current.roles,
        "scopes": current.scopes,
    }
