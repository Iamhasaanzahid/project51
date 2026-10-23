#!/usr/bin/env python3
"""
Bootstrap a tenant and its first system administrator.

Usage:
    ADMIN_PASSWORD='...' python scripts/bootstrap_admin.py \
        --slug acme --name "Acme Retail" --email admin@acme.example

The password is read from ADMIN_PASSWORD or prompted (never echoed). The script
validates identifiers before interpolating them into SQL.
"""
from __future__ import annotations

import argparse
import asyncio
import getpass
import os
import re
import ssl
import sys

import asyncpg
import bcrypt

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{2,63}$")


def _hash_password(password: str) -> str:
    import base64
    import hashlib

    digest = base64.b64encode(hashlib.sha256(password.encode("utf-8")).digest())
    return bcrypt.hashpw(digest, bcrypt.gensalt(rounds=12)).decode("ascii")


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
    }


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--slug", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--plan", default="starter")
    args = parser.parse_args()

    if not SLUG_RE.match(args.slug):
        print("error: slug must match ^[a-z0-9][a-z0-9_-]{2,63}$", file=sys.stderr)
        return 2

    schema = f"tenant_{args.slug.replace('-', '_')}"
    password = os.environ.get("ADMIN_PASSWORD") or getpass.getpass("Admin password: ")
    if len(password) < 12:
        print("error: password must be at least 12 characters", file=sys.stderr)
        return 2

    conn = await asyncpg.connect(**_connect_kwargs())
    try:
        try:
            await conn.execute("SELECT provision_tenant($1, $2, $3, $4)", args.slug, args.name, args.plan, schema)
            print(f"tenant provisioned: {args.slug} -> {schema}")
        except asyncpg.UniqueViolationError:
            print(f"tenant already exists: {args.slug} (continuing)")

        # FORCE ROW LEVEL SECURITY also applies to the table owner.
        await conn.execute("SELECT set_config('app.current_tenant', $1, false)", args.slug)
        await conn.execute("SELECT set_config('search_path', $1, false)", f'"{schema}", public')
        await conn.execute(
            """
            INSERT INTO users
                (tenant_id, email, full_name, password_hash, roles, scopes, is_active, is_system_admin)
            VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, true, true)
            ON CONFLICT (email) DO NOTHING
            """,
            args.slug,
            args.email.lower(),
            args.name,
            _hash_password(password),
            '["SystemAdmin"]',
            '["admin:all"]',
        )
        print(f"admin ready: {args.email}")
    finally:
        await conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
