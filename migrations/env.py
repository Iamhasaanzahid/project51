"""Alembic environment.

The URL is resolved from ALEMBIC_DATABASE_URL (tests/CI) or the POSTGRES_*
variables (containers). Migrations are intentionally run with an administrative
role; the runtime API connects as the least-privilege `aifabric_app` role.
"""
from __future__ import annotations

import asyncio
import os
import ssl
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# No autogenerate: tenant tables are provisioned dynamically by
# provision_tenant(), so there is no single static metadata target.
target_metadata = None


def _database_url() -> str:
    explicit = os.getenv("ALEMBIC_DATABASE_URL")
    if explicit:
        return explicit
    user = os.getenv("POSTGRES_USER", "aifabric_app")
    password = os.getenv("POSTGRES_PASSWORD", "")
    host = os.getenv("POSTGRES_HOST", "localhost")
    port = os.getenv("POSTGRES_PORT", "5432")
    database = os.getenv("POSTGRES_DB", "aifabric_prod")
    return f"postgresql+asyncpg://{user}:{password}@{host}:{port}/{database}"


def _connect_args() -> dict:
    if os.getenv("ALEMBIC_DATABASE_URL"):
        return {}
    mode = os.getenv("POSTGRES_SSL_MODE", "verify-full")
    if mode == "disable":
        return {"ssl": None}
    ctx = ssl.create_default_context(cafile=os.getenv("POSTGRES_SSL_CA_FILE") or None)
    if mode == "require":
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    return {"ssl": ctx}


def run_migrations_offline() -> None:
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    engine = create_async_engine(
        _database_url(),
        connect_args=_connect_args(),
        pool_pre_ping=True,
    )
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
