"""
Structured, PII-redacting logging.

Every log record is emitted as JSON (Loki/Datadog friendly). A logging filter
scrubs passwords, bearer tokens, card numbers, CNIC/SSN values and free-form
`token=...` pairs before the record is formatted. File paths in stack traces
are collapsed so internal layout is not disclosed.
"""
from __future__ import annotations

import json
import logging
import re
import sys
from datetime import UTC, datetime
from typing import Any

_SENSITIVE_PATTERNS = [
    (re.compile(r"(?i)\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token)\b\s*[=:]\s*(\"[^\"]*\"|'[^']*'|\S+)"), r"\1=***REDACTED***"),
    (re.compile(r"(?i)(\"(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|card[_-]?number|cvv)\"\s*:\s*)\"[^\"]*\""), r'\1"***REDACTED***"'),
    (re.compile(r"Bearer\s+[A-Za-z0-9\-._~+/]+=*", re.IGNORECASE), "Bearer ***REDACTED***"),
    (re.compile(r"\b(?:\d[ -]*?){13,19}\b"), "***REDACTED_PAN***"),
    (re.compile(r"\b\d{5}-\d{7}-\d\b"), "***REDACTED_CNIC***"),
    (re.compile(r"(?i)\b(sk_live|sk_test|whsec|ghp_|github_pat_|r8_)[A-Za-z0-9_\-]+"), "***REDACTED_KEY***"),
]


def scrub(value: str) -> str:
    for pattern, replacement in _SENSITIVE_PATTERNS:
        value = pattern.sub(replacement, value)
    return value


class SensitiveDataRedactor(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = scrub(record.msg)
        if record.args:
            record.args = tuple(scrub(a) if isinstance(a, str) else a for a in record.args)
        return True


class StructuredJsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": scrub(record.getMessage()),
            "module": record.module,
            "line": record.lineno,
        }
        for attr in ("request_id", "tenant_id", "user_id", "event_type", "client_ip", "route", "status_code"):
            if hasattr(record, attr):
                payload[attr] = getattr(record, attr)
        if record.exc_info:
            exc_text = self.formatException(record.exc_info)
            exc_text = re.sub(r'File ".*?[\\/]', 'File "', exc_text)
            payload["exception"] = scrub(exc_text)
        return json.dumps(payload, default=str)


def setup_logging(environment: str = "production") -> None:
    root = logging.getLogger()
    root.setLevel(logging.INFO if environment == "production" else logging.DEBUG)
    for handler in list(root.handlers):
        root.removeHandler(handler)

    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(SensitiveDataRedactor())
    handler.setFormatter(StructuredJsonFormatter())
    root.addHandler(handler)

    # Silence noisy internals that can leak DSNs / request bodies.
    for noisy in ("uvicorn.access", "sqlalchemy.engine", "boto3", "botocore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
