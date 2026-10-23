"""Prometheus metrics for security-relevant events (scraped by the observability stack)."""
from prometheus_client import Counter, Histogram

AUTH_ATTEMPTS = Counter(
    "aifabric_auth_attempts_total", "Authentication attempts", ["result", "tenant"]
)
AUTH_FAILURES = Counter(
    "aifabric_auth_failures_total", "Failed authentication attempts", ["reason", "tenant"]
)
SECURITY_VIOLATIONS = Counter(
    "aifabric_security_violations_total", "Blocked security violations", ["kind", "route"]
)
PAYMENT_EVENTS = Counter(
    "aifabric_payment_events_total", "Payment lifecycle events", ["provider", "event", "status"]
)
PAYMENT_AMOUNT = Counter(
    "aifabric_payment_amount_minor_total", "Settled payment volume (minor units)", ["provider", "currency"]
)
RENDER_REQUESTS = Counter(
    "aifabric_render_requests_total", "AI render requests", ["status"]
)
RENDER_DURATION = Histogram(
    "aifabric_render_duration_seconds", "GPU render duration", buckets=(5, 15, 30, 60, 120, 300)
)
UPLOAD_REJECTIONS = Counter(
    "aifabric_upload_rejections_total", "Rejected media uploads", ["reason"]
)
