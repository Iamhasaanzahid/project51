import logging
import re
import sys
import json
from datetime import datetime

# Regex patterns to catch PII, passwords, authorization tokens, credit cards, and payment hashes
SENSITIVE_PATTERNS = [
    (re.compile(r'(?i)(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?token)\s*=\s*[\'"]?([^\s\'"]+)[\'"]?'), r'\1=***REDACTED***'),
    (re.compile(r'(?i)"(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?token)"\s*:\s*"[^"]+"'), r'"\1":"***REDACTED***"'),
    (re.compile(r'Bearer\s+[A-Za-z0-9\-\._~\+\/]+=*', re.IGNORECASE), 'Bearer ***REDACTED_JWT***'),
    (re.compile(r'\b(?:\d[ -]*?){13,16}\b'), '***REDACTED_CARD_NUMBER***'),  # Basic PCI card masking
    (re.compile(r'(?i)(cnic|ssn)\s*[:=]\s*\d{5}-\d{7}-\d{1}'), r'\1=***REDACTED_ID***'),
]

class SensitiveDataRedactor(logging.Filter):
    """Filter that strips passwords, JWTs, card numbers, and PII from all log messages before emission."""
    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            for pattern, replacement in SENSITIVE_PATTERNS:
                record.msg = pattern.sub(replacement, record.msg)
        if record.args:
            cleaned_args = []
            for arg in record.args:
                if isinstance(arg, str):
                    for pattern, replacement in SENSITIVE_PATTERNS:
                        arg = pattern.sub(replacement, arg)
                cleaned_args.append(arg)
            record.args = tuple(cleaned_args)
        return True

class StructuredJsonFormatter(logging.Formatter):
    """Formats log records as structured JSON for Loki / Datadog ingest."""
    def format(self, record: logging.LogRecord) -> str:
        log_obj = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "filename": record.filename,
            "line": record.lineno,
        }
        if hasattr(record, "tenant_id"):
            log_obj["tenant_id"] = getattr(record, "tenant_id")
        if hasattr(record, "event_type"):
            log_obj["event_type"] = getattr(record, "event_type")
        if hasattr(record, "client_ip"):
            log_obj["client_ip"] = getattr(record, "client_ip")
        if record.exc_info:
            # Mask internal file system paths in stack traces
            exc_text = self.formatException(record.exc_info)
            exc_text = re.sub(r'File ".*?[\\/]', 'File "', exc_text)
            log_obj["exception"] = exc_text

        return json.dumps(log_obj)

def setup_logging(environment: str = "production"):
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO if environment == "production" else logging.DEBUG)
    
    # Remove existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(SensitiveDataRedactor())
    handler.setFormatter(StructuredJsonFormatter())
    
    root_logger.addHandler(handler)
