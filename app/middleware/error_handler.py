import logging
import traceback
from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from app.core.config import settings

logger = logging.getLogger("aifabric.errors")

class ProductionErrorMaskingMiddleware(BaseHTTPMiddleware):
    """
    Error Masking Middleware: Suppresses internal exceptions, stack traces,
    database schemas, and file paths in production responses to mitigate information disclosure vulnerabilities.
    """
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint):
        try:
            return await call_next(request)
        except Exception as exc:
            # Log full stack trace internally for DevSecOps triage
            logger.error(
                f"Unhandled Exception on {request.method} {request.url.path}: {str(exc)}",
                exc_info=True,
                extra={"tenant_id": request.headers.get("X-Tenant-ID", "unknown")}
            )

            if settings.ENVIRONMENT == "production" and not settings.DEBUG:
                return JSONResponse(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    content={
                        "error": "Internal Server Error",
                        "message": "An unexpected error occurred while processing your request. Ref: SEC-ERR-500",
                        "status": status.HTTP_500_INTERNAL_SERVER_ERROR,
                    },
                )
            else:
                # Include sanitized details in non-production environments
                return JSONResponse(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    content={
                        "error": type(exc).__name__,
                        "message": str(exc),
                        "traceback": traceback.format_exc().splitlines()[-5:],
                    },
                )
