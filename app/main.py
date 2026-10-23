"""
Application entrypoint.

Middleware order (outermost first):
    CORS -> RateLimiter -> SecurityHeaders -> RequestContext -> ErrorMasking
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from redis.asyncio import Redis
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.responses import Response

from app.api.v1 import admin, ai_render, auth, payments
from app.core.config import settings
from app.core.database import engine, healthcheck
from app.core.logging_config import setup_logging
from app.middleware.error_handler import ProductionErrorMaskingMiddleware
from app.middleware.rate_limiter import LeakyBucketRateLimiter
from app.middleware.request_context import RequestContextMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.services.idempotency import IdempotencyStore

setup_logging(settings.ENVIRONMENT)
logger = logging.getLogger("aifabric.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    app.state.redis = redis
    app.state.idempotency = IdempotencyStore(redis, ttl_seconds=settings.IDEMPOTENCY_TTL_SECONDS)
    logger.info("Startup complete environment=%s", settings.ENVIRONMENT)
    try:
        yield
    finally:
        await redis.aclose()
        await engine.dispose()
        logger.info("Shutdown complete")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
    openapi_url="/openapi.json" if settings.ENVIRONMENT != "production" else None,
)

# --- middleware (added in inner->outer order) -------------------------------
app.add_middleware(ProductionErrorMaskingMiddleware)
app.add_middleware(RequestContextMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    LeakyBucketRateLimiter,
    redis_client=Redis.from_url(settings.redis_url, decode_responses=True),
    capacity=settings.RENDER_BUCKET_CAPACITY,
    leak_rate_per_sec=settings.RENDER_LEAK_RATE_PER_SEC,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Request-ID"],
    max_age=600,
)
_allowed_hosts = settings.allowed_hosts_list if settings.ENVIRONMENT == "production" else ["*"]
app.add_middleware(TrustedHostMiddleware, allowed_hosts=_allowed_hosts)


# --- validation errors must not echo secrets --------------------------------
@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    safe_errors = [
        {"loc": err.get("loc", []), "msg": err.get("msg", "invalid"), "type": err.get("type", "value_error")}
        for err in exc.errors()
    ]
    return JSONResponse(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, content={"error": "validation_error", "details": safe_errors})


# --- routers ----------------------------------------------------------------
app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(ai_render.router, prefix=settings.API_V1_PREFIX)
app.include_router(payments.router, prefix=settings.API_V1_PREFIX)
app.include_router(admin.router, prefix=settings.API_V1_PREFIX)


# --- operational endpoints --------------------------------------------------
@app.get("/healthz", include_in_schema=False)
async def healthz():
    return {"status": "ok"}


@app.get("/readyz", include_in_schema=False)
async def readyz():
    db_ok = await healthcheck()
    try:
        redis_ok = bool(await app.state.redis.ping())
    except Exception:
        redis_ok = False
    ok = db_ok and redis_ok
    return JSONResponse(
        status_code=status.HTTP_200_OK if ok else status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"status": "ready" if ok else "degraded", "database": db_ok, "redis": redis_ok},
    )


@app.get("/metrics", include_in_schema=False)
async def metrics():
    if not settings.METRICS_ENABLED:
        return Response(status_code=404)
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
