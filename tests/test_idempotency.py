import pytest

from app.services.idempotency import IdempotencyConflict, IdempotencyStore


class FakeRedis:
    def __init__(self):
        self.data = {}

    async def set(self, key, value, nx=False, ex=None):
        if nx and key in self.data:
            return None
        self.data[key] = value
        return True

    async def get(self, key):
        return self.data.get(key)

    async def delete(self, key):
        self.data.pop(key, None)
        return 1


@pytest.mark.asyncio
async def test_idempotent_replay_returns_cached_response():
    store = IdempotencyStore(FakeRedis(), ttl_seconds=60)
    fp = store.fingerprint({"sku": "render_pack_10", "qty": 1})

    state, cached = await store.acquire("tenant_a", "key-1234567890abcd", fp)
    assert (state, cached) == ("new", None)

    state, cached = await store.acquire("tenant_a", "key-1234567890abcd", fp)
    assert state == "in_progress" and cached is None

    await store.complete("tenant_a", "key-1234567890abcd", fp, {"reference": "sess_1", "amount_minor": 50000})
    state, cached = await store.acquire("tenant_a", "key-1234567890abcd", fp)
    assert state == "completed"
    assert cached["reference"] == "sess_1"


@pytest.mark.asyncio
async def test_same_key_different_payload_conflicts():
    store = IdempotencyStore(FakeRedis())
    fp1 = store.fingerprint({"amount": 50000})
    fp2 = store.fingerprint({"amount": 1})
    await store.acquire("tenant_a", "key-1234567890abcd", fp1)
    with pytest.raises(IdempotencyConflict):
        await store.acquire("tenant_a", "key-1234567890abcd", fp2)


@pytest.mark.asyncio
async def test_release_allows_retry_after_failure():
    store = IdempotencyStore(FakeRedis())
    fp = store.fingerprint({"x": 1})
    await store.acquire("tenant_a", "key-1234567890abcd", fp)
    await store.release("tenant_a", "key-1234567890abcd")
    state, _ = await store.acquire("tenant_a", "key-1234567890abcd", fp)
    assert state == "new"
