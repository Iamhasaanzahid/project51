"""
Payment-gateway IP allow-listing.

Webhooks are only accepted from the official processor subnets. The client IP
is taken from the transport peer; X-Forwarded-For is honoured only for the
left-most address when the app runs behind the managed load balancer (which
overwrites the header). Configuring empty lists in production denies all.
"""
from __future__ import annotations

import ipaddress
import logging

from fastapi import HTTPException, Request, status

from app.core.config import settings

logger = logging.getLogger("aifabric.ip_whitelist")

Network = ipaddress.IPv4Network | ipaddress.IPv6Network


def parse_cidrs(value: str) -> list[Network]:
    networks: list[Network] = []
    for raw in value.split(","):
        raw = raw.strip()
        if not raw:
            continue
        try:
            networks.append(ipaddress.ip_network(raw, strict=False))
        except ValueError:
            logger.error("Invalid CIDR in allow-list: %s", raw)
    return networks


JAZZCASH_NETWORKS = parse_cidrs(settings.JAZZCASH_ALLOWED_IPS)
PAYFAST_NETWORKS = parse_cidrs(settings.PAYFAST_ALLOWED_IPS)
STRIPE_NETWORKS = parse_cidrs(settings.STRIPE_ALLOWED_IPS)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _allowed(ip: str, networks: list[Network]) -> bool:
    if not networks:
        return settings.ENVIRONMENT != "production"
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(addr in net for net in networks)


def _enforce(request: Request, networks: list[Network], provider: str) -> None:
    ip = _client_ip(request)
    if not _allowed(ip, networks):
        logger.warning("Blocked %s webhook from unauthorized IP %s", provider, ip)
        from app.core import metrics
        metrics.SECURITY_VIOLATIONS.labels(kind="webhook_ip_blocked", route=provider.lower()).inc()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Webhook source not authorized",
        )


async def enforce_payment_webhook_ip_whitelist(request: Request) -> None:
    path = request.url.path
    if "/payments/jazzcash/webhook" in path:
        _enforce(request, JAZZCASH_NETWORKS, "JazzCash")
    elif "/payments/payfast/webhook" in path:
        _enforce(request, PAYFAST_NETWORKS, "PayFast")
    elif "/payments/stripe/webhook" in path:
        _enforce(request, STRIPE_NETWORKS, "Stripe")
