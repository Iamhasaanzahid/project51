"""
Redis-backed idempotency keys for financial endpoints.

A client retrying after a network drop with the same Idempotency-Key receives
the original response instead of a second charge. Reusing a key with a
different payload is rejected (conflict) to prevent amount/tenant swapping.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any

from redis.asyncio import Redis


class IdempotencyConflict(Exception):
    pass


class IdempotencyStore:
    def __init__(self, redis: Redis, ttl_seconds: int = 86_400):
        self.redis = redis
        self.ttl = ttl_seconds

    @staticmethod
    def _key(tenant_id: str, key: str) -> str:
        return f"idem:{tenant_id}:{key}"

    @staticmethod
    def fingerprint(payload: Any) -> str:
        return hashlib.sha256(
            json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()

    async def acquire(self, tenant_id: str, key: str, fingerprint: str) -> tuple[str, dict | None]:
        """
        Returns ("new", None) | ("in_progress", None) | ("completed", response).
        Raises IdempotencyConflict when the key is reused with a different body.
        """
        full = self._key(tenant_id, key)
        record = json.dumps({"state": "processing", "fingerprint": fingerprint})
        created = await self.redis.set(full, record, nx=True, ex=self.ttl)
        if created:
            return "new", None

        raw = await self.redis.get(full)
        if raw is None:  # expired between SET NX and GET
            await self.redis.set(full, record, ex=self.ttl)
            return "new", None

        data = json.loads(raw)
        if data.get("fingerprint") != fingerprint:
            raise IdempotencyConflict("Idempotency key reused with a different payload")
        if data.get("state") == "processing":
            return "in_progress", None
        return "completed", data.get("response")

    async def complete(self, tenant_id: str, key: str, fingerprint: str, response: dict) -> None:
        await self.redis.set(
            self._key(tenant_id, key),
            json.dumps({"state": "completed", "fingerprint": fingerprint, "response": response}),
            ex=self.ttl,
        )

    async def release(self, tenant_id: str, key: str) -> None:
        """Remove a failed key so the client can safely retry."""
        await self.redis.delete(self._key(tenant_id, key))
