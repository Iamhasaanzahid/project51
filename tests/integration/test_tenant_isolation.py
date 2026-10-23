"""End-to-end isolation and idempotency tests against real infrastructure."""
from __future__ import annotations

import asyncpg
import pytest

pytestmark = pytest.mark.integration


async def test_public_schema_is_migrated(app_connection):
    row = await app_connection.fetchrow("SELECT version_num FROM public.alembic_version")
    assert row is not None
    assert row["version_num"] == "0001_public_schema"


async def test_rls_returns_only_current_tenant_rows(app_connection):
    await app_connection.execute("SELECT set_config('app.current_tenant', 'acme', false)")
    acme_rows = await app_connection.fetch("SELECT email FROM tenant_acme.users")
    assert [r["email"] for r in acme_rows] == ["owner@acme.test"]

    # Reading the other tenant's table as 'acme' must return zero rows.
    beta_rows = await app_connection.fetch("SELECT email FROM tenant_beta.users")
    assert beta_rows == []

    await app_connection.execute("SELECT set_config('app.current_tenant', 'beta', false)")
    beta_rows = await app_connection.fetch("SELECT email FROM tenant_beta.users")
    assert [r["email"] for r in beta_rows] == ["owner@beta.test"]
    assert await app_connection.fetch("SELECT email FROM tenant_acme.users") == []


async def test_rls_blocks_cross_tenant_writes(app_connection):
    await app_connection.execute("SELECT set_config('app.current_tenant', 'acme', false)")
    with pytest.raises(asyncpg.PostgresError):
        await app_connection.execute(
            "INSERT INTO tenant_acme.users (tenant_id, email, full_name, password_hash) "
            "VALUES ('beta', 'smuggled@beta.test', 'Smuggled', 'x')"
        )


async def test_audit_log_is_append_only(app_connection):
    await app_connection.execute(
        "INSERT INTO public.security_audit (event_type, tenant_id, detail) "
        "VALUES ('integration.test', 'acme', '{}'::jsonb)"
    )
    with pytest.raises(asyncpg.InsufficientPrivilegeError):
        await app_connection.execute("UPDATE public.security_audit SET event_type = 'tampered'")
    with pytest.raises(asyncpg.InsufficientPrivilegeError):
        await app_connection.execute("DELETE FROM public.security_audit")


async def test_tenant_registry_cannot_be_deleted(app_connection):
    with pytest.raises(asyncpg.InsufficientPrivilegeError):
        await app_connection.execute("DELETE FROM public.tenants")


async def test_provisioning_rejects_bad_schema_names(app_connection):
    with pytest.raises(asyncpg.PostgresError):
        await app_connection.execute(
            "SELECT public.provision_tenant('evil', 'Evil', 'starter', 'public')"
        )


async def test_idempotency_store_against_fakeredis():
    fakeredis = pytest.importorskip("fakeredis")
    from app.services.idempotency import IdempotencyConflict, IdempotencyStore

    redis = fakeredis.aioredis.FakeRedis(decode_responses=True)
    try:
        store = IdempotencyStore(redis, ttl_seconds=60)
        fingerprint = store.fingerprint({"sku": "render_pack_10", "quantity": 1})

        assert await store.acquire("acme", "key-1", fingerprint) == ("new", None)
        assert await store.acquire("acme", "key-1", fingerprint) == ("in_progress", None)

        await store.complete("acme", "key-1", fingerprint, {"ok": True})
        assert await store.acquire("acme", "key-1", fingerprint) == ("completed", {"ok": True})

        with pytest.raises(IdempotencyConflict):
            await store.acquire("acme", "key-1", store.fingerprint({"sku": "other"}))
    finally:
        await redis.aclose()
