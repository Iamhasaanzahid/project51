import ipaddress
import logging
from typing import List
from fastapi import Request, HTTPException, status
from app.core.config import settings

logger = logging.getLogger("aifabric.ip_whitelist")

def parse_cidrs(cidr_str: str) -> List[ipaddress.IPv4Network | ipaddress.IPv6Network]:
    networks = []
    if not cidr_str:
        return networks
    for cidr in cidr_str.split(","):
        cidr = cidr.strip()
        if cidr:
            try:
                networks.append(ipaddress.ip_network(cidr, strict=False))
            except ValueError as e:
                logger.error(f"Invalid CIDR subnet configuration '{cidr}': {e}")
    return networks

JAZZCASH_NETWORKS = parse_cidrs(settings.JAZZCASH_ALLOWED_IPS)
PAYFAST_NETWORKS = parse_cidrs(settings.PAYFAST_ALLOWED_IPS)
STRIPE_NETWORKS = parse_cidrs(settings.STRIPE_ALLOWED_IPS)

def verify_ip_in_subnets(client_ip_str: str, allowed_networks: List) -> bool:
    if not allowed_networks:
        # If no networks defined, allow local development/testing
        if settings.ENVIRONMENT != "production":
            return True
        return False

    try:
        client_ip = ipaddress.ip_address(client_ip_str)
        return any(client_ip in net for net in allowed_networks)
    except ValueError:
        return False

async def enforce_payment_webhook_ip_whitelist(request: Request):
    """
    Dependency / Middleware helper enforcing IP Subnet Whitelisting on webhook ingestion endpoints.
    """
    client_ip = request.client.host if request.client else "0.0.0.0"
    
    # Respect X-Forwarded-For if behind trusted WAF/Cloudflare
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        client_ip = forwarded_for.split(",")[0].strip()

    path = request.url.path

    if "/api/v1/payments/jazzcash/webhook" in path:
        if not verify_ip_in_subnets(client_ip, JAZZCASH_NETWORKS):
            logger.warning(f"Unauthorized JazzCash Webhook IP blocked: {client_ip}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Security Violation: Webhook IP address not in authorized JazzCash gateway subnets.",
            )
    elif "/api/v1/payments/payfast/webhook" in path:
        if not verify_ip_in_subnets(client_ip, PAYFAST_NETWORKS):
            logger.warning(f"Unauthorized PayFast Webhook IP blocked: {client_ip}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Security Violation: Webhook IP address not in authorized PayFast gateway subnets.",
            )
    elif "/api/v1/payments/stripe/webhook" in path:
        if not verify_ip_in_subnets(client_ip, STRIPE_NETWORKS):
            logger.warning(f"Unauthorized Stripe Webhook IP blocked: {client_ip}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Security Violation: Webhook IP address not in authorized Stripe subnets.",
            )
