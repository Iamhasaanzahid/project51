"""Celery tasks for the GPU render pipeline.

The task re-scans the quarantined object from S3 (defence in depth), promotes
it only on a clean ClamAV verdict, then performs inference and stores the
rendered PNG. Failures are recorded as opaque error codes — never raw
exceptions — so nothing internal leaks into the API response.
"""
from __future__ import annotations

import asyncio
import logging
import os
import uuid

from app.core.config import settings
from app.core.database import tenant_session
from app.models.render_job import RenderJob
from app.services.malware_scanner import MalwareDetected, MalwareScanner, MalwareScannerUnavailable
from app.services.render_pipeline import RenderPipelineUnavailable, pipeline
from app.services.storage_service import storage
from app.workers.celery_app import celery_app

logger = logging.getLogger("aifabric.tasks")


async def _update_job(job_id: str, tenant_id: str, **fields) -> None:
    async with tenant_session(tenant_id) as session:
        job = await session.get(RenderJob, uuid.UUID(job_id))
        if job is None or job.tenant_id != tenant_id:
            return
        for key, value in fields.items():
            setattr(job, key, value)
        await session.flush()


@celery_app.task(
    bind=True,
    name="render.scan_and_render",
    acks_late=True,
    max_retries=2,
    default_retry_delay=20,
)
def scan_and_render(self, job_id: str, tenant_id: str, quarantine_key: str, prompt: str) -> dict:
    scanner = MalwareScanner()
    trusted_key = storage.trusted_key(tenant_id, os.path.basename(quarantine_key))

    # 1. S3 quarantine scan + promotion (ClamAV)
    try:
        scanner.promote_if_clean(settings.AWS_S3_BUCKET_NAME, quarantine_key, trusted_key)
    except MalwareDetected:
        asyncio.run(_update_job(job_id, tenant_id, status="rejected", error_code="malware_detected"))
        storage.delete(quarantine_key)
        return {"status": "rejected", "reason": "malware"}
    except MalwareScannerUnavailable as exc:
        asyncio.run(_update_job(job_id, tenant_id, status="failed", error_code="scanner_unavailable"))
        raise self.retry(exc=exc) from exc
    except Exception as exc:
        logger.error("Quarantine promotion failed job=%s: %s", job_id, type(exc).__name__)
        asyncio.run(_update_job(job_id, tenant_id, status="failed", error_code="storage_error"))
        return {"status": "failed", "reason": "storage"}

    # 2. GPU inference
    asyncio.run(_update_job(job_id, tenant_id, status="processing"))
    try:
        source = storage.get_bytes(trusted_key)
        rendered = pipeline.render(source, prompt)
        result_key = storage.render_key(tenant_id, job_id)
        storage.put_bytes(result_key, rendered, "image/png")
    except RenderPipelineUnavailable:
        asyncio.run(_update_job(job_id, tenant_id, status="failed", error_code="gpu_unavailable"))
        return {"status": "failed", "reason": "gpu"}
    except Exception as exc:
        logger.error("Render failed job=%s: %s", job_id, type(exc).__name__)
        asyncio.run(_update_job(job_id, tenant_id, status="failed", error_code="render_error"))
        raise self.retry(exc=exc) from exc

    # 3. Commit result
    asyncio.run(_update_job(
        job_id, tenant_id, status="completed", result_s3_key=result_key, error_code=None
    ))
    logger.info("Render completed job=%s tenant=%s", job_id, tenant_id)
    return {"status": "completed", "result_key": result_key}
