"""
Atomic leaky-bucket rate limiter for GPU render endpoints.

Implemented as a single Lua script so the read-decay-write cycle is atomic
across all API replicas. Authentication tokens are hashed for the bucket key,
so rotating source IPs cannot bypass the limit. Returns 429 + Retry-After.
"""
from __future__ import annotations

import hashlib
import logging

from fastapi import status
from redis.asyncio import Redis
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import settings

logger = logging.getLogger("aifabric.ratelimit")

_LUA = """
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local leak = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])
local ttl = tonumber(ARGV[5])

local data = redis.call('HMGET', key, 'water', 'ts')
local water = tonumber(data[1]) or 0
local ts = tonumber(data[2]) or now
local elapsed = now - ts
if elapsed < 0 then elapsed = 0 end
water = water - (elapsed * leak)
if water < 0 then water = 0 end

if water + cost > capacity then
  redis.call('HMSET', key, 'water', water, 'ts', now)
  redis.call('EXPIRE', key, ttl)
  local wait = 0
  if leak > 0 then wait = math.ceil((water + cost - capacity) / leak) end
  return {0, math.floor(water), wait}
end

water = water + cost
redis.call('HMSET', key, 'water', water, 'ts', now)
redis.call('EXPIRE', key, ttl)
return {1, math.floor(water), 0}
"""


class LeakyBucketRateLimiter(BaseHTTPMiddleware):
    def __init__(
        self,
        app,
        redis_client: Redis,
        capacity: int = 10,
        leak_rate_per_sec: float = 0.5,
        protected_prefixes: tuple[str, ...] = ("/api/v1/ai/render", "/api/v1/payments/checkout"),
    ):
        super().__init__(app)
        self.redis = redis_client
        self.capacity = capacity
        self.leak_rate = leak_rate_per_sec
        self.protected_prefixes = protected_prefixes
        self._script = redis_client.register_script(_LUA)

    @staticmethod
    def _bucket_id(request: Request) -> str:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            digest = hashlib.sha256(auth[7:].encode()).hexdigest()[:24]
            return f"token:{digest}"
        ip = request.client.host if request.client else "unknown"
        return f"ip:{ip}"

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if not any(request.url.path.startswith(p) for p in self.protected_prefixes):
            return await call_next(request)

        key = f"lb:{self._bucket_id(request)}:{request.url.path}"
        try:
            allowed, level, retry_after = await self._script(
                keys=[key],
                args=[self.capacity, self.leak_rate, __import__("time").time(), 1, 3600],
            )
        except Exception as exc:
            # Fail open only for availability; alerting fires on the metric.
            logger.error("Rate limiter backend error: %s", exc)
            return await call_next(request)

        if int(allowed) == 0:
            logger.warning("GPU/compute throttle hit key=%s level=%s", key, level)
            from app.core import metrics
            metrics.RENDER_REQUESTS.labels(status="rate_limited").inc()
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "error": "rate_limited",
                    "message": "Too many requests. Please retry later.",
                    "retry_after_seconds": max(1, int(retry_after)),
                },
                headers={"Retry-After": str(max(1, int(retry_after)))},
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(self.capacity)
        response.headers["X-RateLimit-Remaining"] = str(max(0, int(self.capacity - level)))
        return response


def build_rate_limiter(app, redis_client: Redis) -> LeakyBucketRateLimiter:
    return LeakyBucketRateLimiter(
        app,
        redis_client,
        capacity=settings.RENDER_BUCKET_CAPACITY,
        leak_rate_per_sec=settings.RENDER_LEAK_RATE_PER_SEC,
    )
