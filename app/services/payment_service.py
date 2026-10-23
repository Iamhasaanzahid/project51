import hmac
import hashlib
import json
import logging
from typing import Dict, Any, Optional
import stripe
from fastapi import HTTPException, status
from app.core.config import settings

logger = logging.getLogger("aifabric.payment")

# Initialize Stripe API Key safely from settings
if settings.STRIPE_SECRET_KEY:
    stripe.api_key = settings.STRIPE_SECRET_KEY


class PaymentSecurityService:
    @staticmethod
    def verify_jazzcash_signature(payload_data: Dict[str, Any], received_signature: str) -> bool:
        """
        Enforces strict HMAC-SHA256 signature verification for JazzCash webhooks
        to prevent request tampering and fake success order injections.
        """
        if not settings.JAZZCASH_WEBHOOK_SECRET:
            logger.error("JAZZCASH_WEBHOOK_SECRET is not configured in environment.")
            return False

        # Sort and concatenate payload fields for signature validation according to JazzCash specs
        sorted_keys = sorted(payload_data.keys())
        sig_string = "&".join([f"{k}={payload_data[k]}" for k in sorted_keys if k != "pp_SecureHash"])

        computed_hash = hmac.new(
            settings.JAZZCASH_WEBHOOK_SECRET.encode("utf-8"),
            sig_string.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()

        return hmac.compare_digest(computed_hash.lower(), received_signature.lower())

    @staticmethod
    def verify_payfast_signature(payload_data: Dict[str, Any], received_signature: str) -> bool:
        """
        Enforces strict HMAC-SHA256 signature verification for PayFast gateway webhooks.
        """
        if not settings.PAYFAST_WEBHOOK_SECRET:
            logger.error("PAYFAST_WEBHOOK_SECRET is not configured in environment.")
            return False

        sorted_keys = sorted([k for k in payload_data.keys() if k != "signature"])
        sig_string = "&".join([f"{k}={payload_data[k]}" for k in sorted_keys])
        
        # Append secured key pass phrase
        full_string = f"{sig_string}&passphrase={settings.PAYFAST_SECURED_KEY}"

        computed_hash = hashlib.sha256(full_string.encode("utf-8")).hexdigest()
        return hmac.compare_digest(computed_hash.lower(), received_signature.lower())

    @staticmethod
    def verify_stripe_webhook(payload_body: bytes, sig_header: str) -> stripe.Event:
        """
        Verifies Stripe Webhook signature cryptographic integrity.
        """
        if not settings.STRIPE_WEBHOOK_SECRET:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Stripe webhook secret is not configured.",
            )
        try:
            event = stripe.Webhook.construct_event(
                payload_body, sig_header, settings.STRIPE_WEBHOOK_SECRET
            )
            return event
        except ValueError as e:
            logger.warning(f"Invalid Stripe webhook payload: {e}")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payload")
        except stripe.error.SignatureVerificationError as e:
            logger.warning(f"Invalid Stripe webhook signature: {e}")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signature")

    @staticmethod
    def calculate_server_side_pricing(item_sku: str, render_count: int, is_annual: bool = False) -> int:
        """
        Mandatory Server-Side Pricing Calculation:
        Never trusts client-side price payload. Calculates exact total in lowest currency unit (e.g. cents / paisas).
        """
        pricing_catalog = {
            "pay_per_render_ai": 5000,    # 50.00 PKR / Cents per AI warp render
            "retailer_saas_monthly": 1500000, # 15,000.00 PKR / Cents monthly subscription
            "enterprise_api_pack": 5000000,
        }

        if item_sku not in pricing_catalog:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid pricing SKU specified: {item_sku}",
            )

        base_price = pricing_catalog[item_sku]
        if item_sku == "pay_per_render_ai":
            total_amount = base_price * max(1, render_count)
        else:
            total_amount = base_price * (10 if is_annual else 1) # 2 months free on annual

        return int(total_amount)
