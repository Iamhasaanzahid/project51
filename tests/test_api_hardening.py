import pytest


@pytest.mark.asyncio
async def test_health_is_public(client):
    resp = await client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_security_headers(client):
    resp = await client.get("/healthz")
    assert resp.headers["X-Content-Type-Options"] == "nosniff"
    assert resp.headers["X-Frame-Options"] == "DENY"
    assert "Strict-Transport-Security" in resp.headers
    assert "Content-Security-Policy" in resp.headers
    assert resp.headers.get("X-Request-ID")


@pytest.mark.asyncio
async def test_validation_errors_do_not_echo_password(client):
    secret = "SuperSecretValue123"
    resp = await client.post(
        "/api/v1/auth/login",
        json={"tenant_slug": "acme", "email": "not-an-email", "password": secret * 50},
    )
    assert resp.status_code == 422
    body = resp.text
    assert secret not in body
    assert '"input"' not in body


@pytest.mark.asyncio
async def test_untrusted_cors_origin_not_allowed(client):
    resp = await client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert resp.headers.get("access-control-allow-origin") != "https://evil.example"


@pytest.mark.asyncio
async def test_protected_route_requires_token(client):
    resp = await client.get("/api/v1/ai/render/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 401
