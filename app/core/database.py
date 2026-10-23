"""
Async database layer with strict TLS and tenant-scoped sessions.

Every request that touches tenant data MUST obtain a session via
`tenant_session()`; the helper:
  * validates the tenant id / schema name,
  * sets the PostgreSQL `search_path` to the tenant schema,
  * sets `app.current_tenant` for row-level security,
  * commits on success and rolls back on failure.
"""
from __future__ import annotations

import logging
import ssl
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.tenant import tenant_schema

logger = logging.getLogger("aifabric.db")


def _build_ssl() -> ssl.SSLContext | None:
    if settings.POSTGRES_SSL_MODE == "disable":
        return None
    ctx = ssl.create_default_context(cafile=settings.POSTGRES_SSL_CA_FILE)
    ctx.check_hostname = settings.POSTGRES_SSL_MODE in {"verify-full", "verify-ca"}
    if settings.POSTGRES_SSL_MODE == "require":
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    return ctx


engine = create_async_engine(
    settings.async_database_url,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_pre_ping=True,
    pool_recycle=1800,
    connect_args={"ssl": _build_ssl(), "server_settings": {"application_name": "aifabric-api"}},
    echo=False,
)

SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    """Plain session for public-schema operations (auth lookup, tenant registry)."""
    async with SessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


@asynccontextmanager
async def tenant_session(tenant_id: str) -> AsyncIterator[AsyncSession]:
    """Isolated session bound to a single tenant schema + RLS variable."""
    schema = tenant_schema(tenant_id)  # raises on malformed input
    async with SessionLocal() as session:
        try:
            await session.execute(
                text("SELECT set_config('app.current_tenant', :tenant_id, true)"),
                {"tenant_id": tenant_id},
            )
            # schema was validated by tenant_schema(); passed as a bound value.
            await session.execute(
                text("SELECT set_config('search_path', :search_path, true)"),
                {"search_path": f'"{schema}", public'},
            )
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def healthcheck() -> bool:
    try:
        async with SessionLocal() as session:
            await session.execute(text("SELECT 1"))
        return True
    except Exception as exc:  # pragma: no cover
        logger.error("Database healthcheck failed: %s", exc)
        return False
