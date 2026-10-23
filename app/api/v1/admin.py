"""System-administration endpoints (tenant provisioning)."""
from __future__ import annotations

import logging
import re

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import ADMIN_SCOPE, TokenData, require_scopes
from app.core.tenant import tenant_schema

logger = logging.getLogger("aifabric.admin")
router = APIRouter(prefix="/admin", tags=["admin"])

_SLUG = re.compile(r"^[a-z0-9][a-z0-9_-]{2,63}$")


class TenantCreate(BaseModel):
    slug: str = Field(..., min_length=3, max_length=64)
    display_name: str = Field(..., min_length=1, max_length=200)
    plan: str = Field("starter", max_length=32)


@router.post("/tenants", status_code=status.HTTP_201_CREATED)
async def create_tenant(
    body: TenantCreate,
    current: TokenData = Depends(require_scopes(ADMIN_SCOPE)),
    db: AsyncSession = Depends(get_db),
):
    if ADMIN_SCOPE not in current.scopes:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if not _SLUG.match(body.slug):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid tenant slug")

    schema = tenant_schema(body.slug)
    try:
        await db.execute(
            text("SELECT provision_tenant(:slug, :name, :plan, :schema)"),
            {"slug": body.slug, "name": body.display_name, "plan": body.plan, "schema": schema},
        )
        await db.commit()
    except Exception as exc:
        await db.rollback()
        logger.error("Tenant provisioning failed for %s: %s", body.slug, exc)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tenant could not be provisioned") from exc

    logger.info("Tenant provisioned slug=%s schema=%s", body.slug, schema)
    return {"slug": body.slug, "schema": schema, "status": "provisioned"}


@router.get("/tenants")
async def list_tenants(
    current: TokenData = Depends(require_scopes(ADMIN_SCOPE)),
    db: AsyncSession = Depends(get_db),
):
    if ADMIN_SCOPE not in current.scopes:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    rows = (await db.execute(
        text("SELECT slug, display_name, schema_name, plan, is_active FROM public.tenants ORDER BY created_at DESC")
    )).mappings().all()
    return [dict(r) for r in rows]
