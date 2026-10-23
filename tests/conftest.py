import os

# Must be set before any `app.*` import triggers Settings().
os.environ.setdefault("SECRET_KEY", "test-secret-key-0123456789abcdef0123456789abcdef")
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("POSTGRES_HOST", "localhost")
os.environ.setdefault("REDIS_HOST", "localhost")
os.environ.setdefault("CLAMAV_FAIL_CLOSED", "false")
os.environ.setdefault("STRIPE_SECRET_KEY", "")
os.environ.setdefault("JAZZCASH_INTEGER_KEY", "test-jc-key")
os.environ.setdefault("JAZZCASH_WEBHOOK_SECRET", "test-jc-webhook")
os.environ.setdefault("PAYFAST_SECURED_KEY", "test-pf-passphrase")

import pytest  # noqa: E402
from httpx import AsyncClient  # noqa: E402


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    from httpx import ASGITransport

    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac
