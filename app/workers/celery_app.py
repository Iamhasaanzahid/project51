"""Celery application.

* GPU inference and CPU media work are split onto separate queues so a render
  flood cannot starve uploads/webhooks.
* acks_late + prefetch=1 + reject_on_worker_lost give at-least-once semantics
  without double-running a GPU job on the same worker.
* Hard time limits bound the blast radius of a pathological inference.
"""
from __future__ import annotations

from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "aifabric",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    task_default_queue=settings.CPU_QUEUE_NAME,
    task_queues={
        settings.CPU_QUEUE_NAME: {"exchange": settings.CPU_QUEUE_NAME, "routing_key": settings.CPU_QUEUE_NAME},
        settings.GPU_QUEUE_NAME: {"exchange": settings.GPU_QUEUE_NAME, "routing_key": settings.GPU_QUEUE_NAME},
    },
    task_routes={
        "render.scan_and_render": {"queue": settings.GPU_QUEUE_NAME},
    },
    task_time_limit=15 * 60,
    task_soft_time_limit=14 * 60,
    result_expires=3600,
    broker_connection_retry_on_startup=True,
    broker_transport_options={"visibility_timeout": 1800},
    worker_max_tasks_per_child=50,
    worker_max_memory_per_child=8_000_000,  # KiB
)
