"""
Tenant context helpers.

Isolation model (defence in depth):
  1. schema-per-tenant  -> physical separation of tables
  2. PostgreSQL RLS     -> row policy keyed on app.current_tenant
  3. application checks -> enforce_tenant_ownership() before any query

The tenant id never reaches SQL as string interpolation; schema names are
strictly validated against a whitelist regex before use.
"""
from __future__ import annotations

import re
from contextvars import ContextVar

_tenant_ctx: ContextVar[str | None] = ContextVar("aifabric_tenant", default=None)

# Only lowercase alphanumeric + underscore, must start with tenant_
_SCHEMA_RE = re.compile(r"^tenant_[a-z0-9_]{1,48}$")
_TENANT_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def set_tenant_context(tenant_id: str | None) -> None:
    _tenant_ctx.set(tenant_id)


def get_tenant_context() -> str | None:
    return _tenant_ctx.get()


def validate_tenant_id(tenant_id: str) -> str:
    if not _TENANT_ID_RE.match(tenant_id):
        raise ValueError("Invalid tenant identifier")
    return tenant_id


def tenant_schema(tenant_id: str) -> str:
    """Map a tenant id to a validated PostgreSQL schema name."""
    validate_tenant_id(tenant_id)
    slug = re.sub(r"[^a-z0-9_]", "_", tenant_id.lower())
    schema = f"tenant_{slug}"
    if not _SCHEMA_RE.match(schema):
        raise ValueError("Invalid tenant schema")
    return schema
