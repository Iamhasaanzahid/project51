"""Security audit trail: structured events + Prometheus counters.

All events are low-cardinality and free of raw credentials/PII. They feed the
Grafana/Loki alert rules for payment anomalies and auth abuse.
"""
from __future__ import annotations

import logging
from typing import Any

from app.core import metrics

logger = logging.getLogger("aifabric.audit")


class AuditService:
    @staticmethod
    def auth_failure(reason: str, tenant: str, client_ip: str, email: str | None = None) -> None:
        metrics.AUTH_FAILURES.labels(reason=reason, tenant=tenant or "unknown").inc()
        logger.warning(
            "auth_failure reason=%s tenant=%s ip=%s email=%s",
            reason, tenant, client_ip, email or "-",
            extra={"event_type": "auth_failure", "tenant_id": tenant, "client_ip": client_ip},
        )

    @staticmethod
    def auth_success(tenant: str, user_id: str, client_ip: str) -> None:
        metrics.AUTH_ATTEMPTS.labels(result="success", tenant=tenant).inc()
        logger.info(
            "auth_success tenant=%s user=%s ip=%s",
            tenant, user_id, client_ip,
            extra={"event_type": "auth_success", "tenant_id": tenant, "user_id": user_id, "client_ip": client_ip},
        )

    @staticmethod
    def security_violation(kind: str, route: str, tenant: str, client_ip: str, detail: str = "") -> None:
        metrics.SECURITY_VIOLATIONS.labels(kind=kind, route=route).inc()
        logger.warning(
            "security_violation kind=%s route=%s tenant=%s ip=%s detail=%s",
            kind, route, tenant, client_ip, detail,
            extra={"event_type": "security_violation", "tenant_id": tenant, "client_ip": client_ip, "route": route},
        )

    @staticmethod
    def payment_event(provider: str, event: str, status: str, amount_minor: int = 0, currency: str = "", **extra: Any) -> None:
        metrics.PAYMENT_EVENTS.labels(provider=provider, event=event, status=status).inc()
        if status == "succeeded" and amount_minor > 0:
            metrics.PAYMENT_AMOUNT.labels(provider=provider, currency=currency).inc(amount_minor)
        logger.info(
            "payment_event provider=%s event=%s status=%s amount=%s currency=%s extra=%s",
            provider, event, status, amount_minor, currency, extra,
            extra={"event_type": "payment_event"},
        )

    @staticmethod
    def upload_rejected(reason: str) -> None:
        metrics.UPLOAD_REJECTIONS.labels(reason=reason).inc()
        logger.warning("upload_rejected reason=%s", reason, extra={"event_type": "upload_rejected"})


audit = AuditService()
