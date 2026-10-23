"""Integration-test fixtures: real PostgreSQL (testcontainers) + fakeredis.

These tests are skipped automatically when Docker is unavailable, so the unit
suite still runs on developer laptops and restricted CI runners.
"""
from __future__ import annotations

import asyncio
import os
import pathlib
import shutil
import urllib.parse

import asyncpg
import pytest

try:
    from testcontainers.postgres import PostgresContainer
except ImportError:  # pragma: no cover - dependency is optional for unit runs
    PostgresContainer = None

APP_ROLE = "aifabric_app"
APP_PASSWORD = "integration-app-password"


def _docker_available() -> bool:
    return PostgresContainer is not None and shutil.which("docker") is not None


@pytest.fixture(scope="session")
def postgres_container():
    if not _docker_available():
        pytest.skip("Docker/testcontainers unavailable")

    container = PostgresContainer("postgres:16-alpine")
    try:
        container.start()
    except Exception as exc:  # pragma: no cover - environment dependent
        pytest.skip(f"Could not start PostgreSQL container: {exc}")
    try:
        yield container
    finally:
        container.stop()


@pytest.fixture(scope="session")
def db_config(postgres_container):
    host = postgres_container.get_container_host_ip()
    port = int(postgres_container.get_exposed_port(5432))
    user = getattr(postgres_container, "username", "test")
    password = getattr(postgres_container, "password", "test")
    database = getattr(postgres_container, "dbname", "test")

    url = (
        f"postgresql+asyncpg://{urllib.parse.quote(user)}:{urllib.parse.quote(password)}"
        f"@{host}:{port}/{database}"
    )
    os.environ["ALEMBIC_DATABASE_URL"] = url

    async def _bootstrap() -> None:
        conn = await asyncpg.connect(
            host=host, port=port, user=user, password=password, database=database
        )
        try:
            try:
                await conn.execute(
                    f"CREATE ROLE {APP_ROLE} LOGIN PASSWORD '{APP_PASSWORD}' NOINHERIT"
                )
            except asyncpg.DuplicateObjectError:
                pass
            bootstrap_sql = pathlib.Path("deploy/postgres/10-init.sql").read_text(encoding="utf-8")
            await conn.execute(bootstrap_sql)
        finally:
            await conn.close()

    asyncio.run(_bootstrap())
    return {
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "database": database,
        "url": url,
    }


@pytest.fixture(scope="session")
def migrated_database(db_config):
    from alembic import command
    from alembic.config import Config

    command.upgrade(Config("alembic.ini"), "head")
    return db_config


@pytest.fixture(scope="session")
def seeded_tenants(migrated_database):
    async def _seed() -> None:
        conn = await asyncpg.connect(
            host=migrated_database["host"],
            port=migrated_database["port"],
            user=APP_ROLE,
            password=APP_PASSWORD,
            database=migrated_database["database"],
        )
        try:
            for slug, schema, name in (
                ("acme", "tenant_acme", "Acme Retail"),
                ("beta", "tenant_beta", "Beta Textiles"),
            ):
                await conn.execute(
                    "SELECT public.provision_tenant($1, $2, 'starter', $3)",
                    slug,
                    name,
                    schema,
                )
            await conn.execute(
                "INSERT INTO tenant_acme.users (tenant_id, email, full_name, password_hash) "
                "VALUES ('acme', 'owner@acme.test', 'Acme Owner', 'x')"
            )
            await conn.execute(
                "INSERT INTO tenant_beta.users (tenant_id, email, full_name, password_hash) "
                "VALUES ('beta', 'owner@beta.test', 'Beta Owner', 'x')"
            )
        finally:
            await conn.close()

    asyncio.run(_seed())
    return migrated_database


@pytest.fixture
async def app_connection(seeded_tenants):
    conn = await asyncpg.connect(
        host=seeded_tenants["host"],
        port=seeded_tenants["port"],
        user=APP_ROLE,
        password=APP_PASSWORD,
        database=seeded_tenants["database"],
    )
    try:
        yield conn
    finally:
        await conn.close()
