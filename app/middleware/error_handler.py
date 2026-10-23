"""Production error masking: never leak schemas, stack traces or file paths."""
from __future__ import annotations

import logging
import traceback

from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.core.config import settings

logger = logging.getLogger("aifabric.errors")


class ProductionErrorMaskingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint):
        request_id = getattr(request.state, "request_id", "-")
        try:
            return await call_next(request)
        except Exception as exc:
            logger.error(
                "Unhandled exception request_id=%s method=%s path=%s type=%s",
                request_id, request.method, request.url.path, type(exc).__name__,
                exc_info=True,
                extra={"request_id": request_id, "event_type": "unhandled_exception"},
            )
            if settings.DEBUG:
                return JSONResponse(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    content={
                        "error": type(exc).__name__,
                        "message": str(exc),
                        "trace": traceback.format_exc().splitlines()[-5:],
                        "request_id": request_id,
                    },
                )
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={
                    "error": "internal_error",
                    "message": "An unexpected error occurred.",
                    "request_id": request_id,
                },
            )
