"""AI fabric render endpoints (GPU-bound, rate limited, tenant isolated)."""
from __future__ import annotations

import logging
import re
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, ConfigDict

from app.core.database import tenant_session
from app.core.security import TokenData, enforce_tenant_ownership, require_scopes
from app.middleware.rate_limiter import LeakyBucketRateLimiter  # noqa: F401 (documentation)
from app.models.render_job import RenderJob
from app.services.audit_service import audit
from app.services.media_sanitizer import FabricMediaSanitizer
from app.services.storage_service import storage

logger = logging.getLogger("aifabric.render")
router = APIRouter(prefix="/ai", tags=["ai-render"])

_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def _clean_prompt(prompt: str) -> str:
    return _CONTROL.sub("", prompt).strip()[:2000]


class RenderSubmitted(BaseModel):
    job_id: str
    status: str
    source_preview_url: str
    message: str


class RenderStatus(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "job_id": "3f0c2f9e-6f7a-4f4e-9a5b-1f9d2f6c8b11",
                    "status": "queued",
                    "result_url": None,
                    "error_code": None,
                }
            ]
        }
    )

    job_id: str
    status: str
    result_url: str | None = None
    error_code: str | None = None


@router.post("/render", response_model=RenderSubmitted, status_code=status.HTTP_202_ACCEPTED)
async def submit_render(
    request: Request,
    fabric_image: UploadFile = File(..., description="Fabric image (JPEG/PNG/WEBP)"),
    prompt: str = Form(
        "",
        max_length=2000,
        description="Text prompt. Control characters are stripped; max 2000 chars.",
    ),
    current: TokenData = Depends(require_scopes("ai:render")),
):
    enforce_tenant_ownership(current.tenant_id, current)

    try:
        clean, mime, width, height = await FabricMediaSanitizer.sanitize_upload(fabric_image)
    except HTTPException as exc:
        audit.upload_rejected(str(exc.detail))
        from app.core import metrics
        metrics.RENDER_REQUESTS.labels(status="rejected").inc()
        raise

    quarantine_key = storage.quarantine_key(current.tenant_id, fabric_image.filename or "fabric.png")
    storage.put_bytes(quarantine_key, clean, mime)

    job = RenderJob(
        tenant_id=current.tenant_id,
        user_id=current.user_id,
        status="queued",
        source_s3_key=quarantine_key,
        prompt=_clean_prompt(prompt),
        metadata_json={"width": width, "height": height, "mime": mime},
    )
    async with tenant_session(current.tenant_id) as session:
        session.add(job)
        await session.flush()
        job_id = str(job.id)

    # Enqueue only after the transaction commits (Celery call is fire-and-forget).
    from app.workers.tasks import scan_and_render

    scan_and_render.apply_async(
        args=[job_id, current.tenant_id, quarantine_key, _clean_prompt(prompt)],
        queue="gpu_render",
        retry=False,
    )

    from app.core import metrics
    metrics.RENDER_REQUESTS.labels(status="queued").inc()

    return RenderSubmitted(
        job_id=job_id,
        status="queued",
        source_preview_url=storage.presigned_preview_url(quarantine_key, 900),
        message="Queued for malware re-scan and GPU rendering.",
    )

@router.get("/render/{job_id}", response_model=RenderStatus)
async def render_status(
    job_id: str,
    current: TokenData = Depends(require_scopes("ai:render")),
):
    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found") from None

    async with tenant_session(current.tenant_id) as session:
        job = await session.get(RenderJob, job_uuid)
        if job is None or job.tenant_id != current.tenant_id:
            # Uniform 404 prevents cross-tenant enumeration (IDOR).
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")
        status_val = job.status
        result_key = job.result_s3_key
        error_code = job.error_code

    return RenderStatus(
        job_id=job_id,
        status=status_val,
        result_url=storage.presigned_preview_url(result_key, 900) if result_key else None,
        error_code=error_code,
    )
