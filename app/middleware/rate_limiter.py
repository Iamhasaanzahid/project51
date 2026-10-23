import time
import logging
from redis.asyncio import Redis
from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse, Response

logger = logging.getLogger("aifabric.ratelimiter")

class LeakyBucketRateLimiter(BaseHTTPMiddleware):
    """
    Leaky bucket rate limiter backed by Redis. Neutralizes GPU Denial of Service (DoS)
    attacks on compute-heavy PyTorch / SDXL endpoints by dripping requests at a controlled rate
    and throttling burst traffic exceeding capacity.
    """
    def __init__(
        self,
        app,
        redis_client: Redis,
        capacity: int = 10,
        leak_rate_per_sec: float = 0.5,
    ):
        super().__init__(app)
        self.redis = redis_client
        self.capacity = capacity
        self.leak_rate = leak_rate_per_sec

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Apply strict leaky bucket throttling only on GPU render endpoints
        if request.url.path.startswith("/api/v1/ai/render"):
            client_ip = request.client.host if request.client else "unknown"
            tenant_id = request.headers.get("X-Tenant-ID", client_ip)
            bucket_key = f"leaky_bucket:{tenant_id}"

            now = time.time()

            try:
                # Use Redis pipeline for atomic transaction
                async with self.redis.pipeline(transaction=True) as pipe:
                    await pipe.hget(bucket_key, "water_level")
                    await pipe.hget(bucket_key, "last_leak")
                    results = await pipe.execute()

                raw_water, raw_last_leak = results[0], results[1]

                water_level = float(raw_water) if raw_water is not None else 0.0
                last_leak = float(raw_last_leak) if raw_last_leak is not None else now

                # Leak water based on elapsed time
                elapsed = now - last_leak
                leaked = elapsed * self.leak_rate
                water_level = max(0.0, water_level - leaked)
                last_leak = now

                # Check capacity
                if water_level + 1.0 > self.capacity:
                    logger.warning(
                        f"GPU DoS protection triggered for tenant/IP {tenant_id}. Bucket overflow level: {water_level:.2f}"
                    )
                    return JSONResponse(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        content={
                            "error": "GPU Compute Throttled",
                            "detail": "High GPU render volume detected. Request queued/rejected by DoS shield.",
                            "retry_after_seconds": int((water_level + 1.0 - self.capacity) / self.leak_rate) + 1,
                        },
                        headers={"Retry-After": "5"},
                    )

                # Add current request to bucket
                water_level += 1.0

                async with self.redis.pipeline(transaction=True) as pipe:
                    await pipe.hset(bucket_key, "water_level", str(water_level))
                    await pipe.hset(bucket_key, "last_leak", str(last_leak))
                    await pipe.expire(bucket_key, 3600)  # TTL 1 hour
                    await pipe.execute()

            except Exception as e:
                logger.error(f"Redis rate limiter exception: {e}. Defaulting to fail-open for service resilience.")

        return await call_next(request)
