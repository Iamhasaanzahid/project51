#!/usr/bin/env python3
"""Apply versioned SQL migrations to every active tenant schema.

The public schema is managed by Alembic. Tenant schemas are provisioned
dynamically (provision_tenant) and evolved by the SQL files in
`migrations/tenant/`. Applied versions are tracked per schema in
`<schema>.schema_migrations`.

Run with the administrative role:
    POSTGRES_ADMIN_USER=... POSTGRES_ADMIN_PASSWORD=... python scripts/migrate_tenants.py
"""
from __future__ import annotations

import asyncio
import os
import pathlib
import re
import ssl
import sys

import asyncpg

ROOT = pathlib.Path(__file__).resolve().parent.parent
MIGRATIONS_DIR = ROOT / "migrations" / "tenant"
SCHEMA_RE = re.compile(r"^tenant_[a-z0-9_]{1,48}$")


def _ssl_context() -> ssl.SSLContext | None:
    mode = os.getenv("POSTGRES_SSL_MODE", "require")
    if mode == "disable":
        return None
    ctx = ssl.create_default_context(cafile=os.getenv("POSTGRES_SSL_CA_FILE") or None)
    if mode == "require":
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    return ctx


def _connect_kwargs() -> dict:
    return {
        "host": os.getenv("POSTGRES_HOST", "localhost"),
        "port": int(os.getenv("POSTGRES_PORT", "5432")),
        "user": os.getenv("POSTGRES_ADMIN_USER") or os.getenv("POSTGRES_USER", "aifabric_admin"),
        "password": os.getenv("POSTGRES_ADMIN_PASSWORD") or os.getenv("POSTGRES_PASSWORD", ""),
        "database": os.getenv("POSTGRES_DB", "aifabric_prod"),
        "ssl": _ssl_context(),
        "timeout": 30,
    }


async def main() -> int:
    files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not files:
        print("No tenant migrations found.")
        return 0

    conn = await asyncpg.connect(**_connect_kwargs())
    try:
        tenants = await conn.fetch(
            "SELECT slug, schema_name FROM public.tenants "
            "WHERE deleted_at IS NULL ORDER BY slug"
        )
        if not tenants:
            print("No active tenants; nothing to migrate.")
            return 0

        for tenant in tenants:
            schema = tenant["schema_name"]
            if not SCHEMA_RE.match(schema):
                print(f"SKIP invalid schema name: {schema!r}", file=sys.stderr)
                continue

            async with conn.transaction():
                # Scope unqualified DDL/DML to the tenant schema for this
                # transaction. set_config() takes the path as a bound parameter,
                # so no SQL identifier interpolation is needed.
                await conn.execute(
                    "SELECT set_config('search_path', $1, true)",
                    f'"{schema}", public',
                )
                await conn.execute(
                    "CREATE TABLE IF NOT EXISTS schema_migrations ("
                    "version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
                )
                applied = {
                    row["version"]
                    for row in await conn.fetch("SELECT version FROM schema_migrations")
                }
                for path in files:
                    if path.name in applied:
                        continue
                    sql = path.read_text(encoding="utf-8")
                    await conn.execute(sql)
                    await conn.execute(
                        "INSERT INTO schema_migrations(version) VALUES($1)",
                        path.name,
                    )
                    print(f"applied {path.name} -> {schema}")
    finally:
        await conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
