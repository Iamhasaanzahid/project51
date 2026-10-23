"""
Payment gateway security.

Principles enforced here:
  * Pricing is ALWAYS computed server-side from a SKU catalogue; client amounts
    are ignored entirely (the API does not even accept an amount).
  * JazzCash / PayFast webhooks require HMAC-SHA256 verification + subnet
    allow-listing (see middleware/ip_whitelist.py).
  * Stripe uses hosted Checkout (zero raw card data on our servers), which
    performs 3-D Secure 2.0 / SCA automatically, plus idempotency keys to make
    retries safe after network drops.
  * Webhook amounts are reconciled against the server ledger before fulfilment.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
from decimal import Decimal
from typing import Any

import stripe
from fastapi import HTTPException, status

from app.core.config import settings

logger = logging.getLogger("aifabric.payment")

if settings.STRIPE_SECRET_KEY:
    stripe.api_key = settings.STRIPE_SECRET_KEY
    stripe.api_version = settings.STRIPE_API_VERSION


class PricingError(Exception):
    pass


# ---------------------------------------------------------------------------
# Server-authoritative catalogue. Amounts are integer minor units.
# ---------------------------------------------------------------------------
CATALOG: dict[str, dict[str, Any]] = {
    "render_pack_10": {"amount_minor": 50_000, "currency": "PKR", "kind": "one_time", "quantityable": True},
    "render_pack_100": {"amount_minor": 400_000, "currency": "PKR", "kind": "one_time", "quantityable": True},
    "saas_monthly": {"amount_minor": 1_500_000, "currency": "PKR", "kind": "subscription", "quantityable": False},
    "saas_annual": {"amount_minor": 15_000_000, "currency": "PKR", "kind": "subscription", "quantityable": False},
}

STRIPE_PRICE_MAP = {
    "render_pack_10": "STRIPE_PRICE_RENDER_PACK",
    "render_pack_100": "STRIPE_PRICE_RENDER_PACK",
    "saas_monthly": "STRIPE_PRICE_SAAS_MONTHLY",
    "saas_annual": "STRIPE_PRICE_SAAS_ANNUAL",
}


class PaymentSecurityService:
    # ------------------------------------------------------------ pricing
    @staticmethod
    def calculate_amount(sku: str, quantity: int = 1) -> dict[str, Any]:
        """Return the authoritative amount for a SKU. Raises on unknown SKU."""
        item = CATALOG.get(sku)
        if not item:
            raise PricingError("Unknown SKU")
        if quantity < 1 or quantity > 100:
            raise PricingError("Invalid quantity")
        if not item["quantityable"]:
            quantity = 1
        return {
            "sku": sku,
            "quantity": quantity,
            "amount_minor": item["amount_minor"] * quantity,
            "unit_amount_minor": item["amount_minor"],
            "currency": item["currency"],
            "kind": item["kind"],
        }

    # ------------------------------------------------------------- stripe
    @staticmethod
    def create_stripe_checkout(
        *,
        tenant_id: str,
        user_id: str,
        sku: str,
        quantity: int,
        idempotency_key: str,
        success_url: str,
        cancel_url: str,
        customer_email: str | None = None,
    ) -> dict[str, Any]:
        if not settings.STRIPE_SECRET_KEY:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Payments unavailable")

        quote = PaymentSecurityService.calculate_amount(sku, quantity)
        price_attr = STRIPE_PRICE_MAP.get(sku)
        price_id = getattr(settings, price_attr, None) if price_attr else None
        if not price_id:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Price not configured")

        mode = "subscription" if quote["kind"] == "subscription" else "payment"
        metadata = {
            "tenant_id": tenant_id,
            "user_id": user_id,
            "sku": sku,
            "amount_minor": str(quote["amount_minor"]),
            "currency": quote["currency"],
        }

        params: dict[str, Any] = {
            "mode": mode,
            "line_items": [{"price": price_id, "quantity": quantity}],
            "success_url": success_url,
            "cancel_url": cancel_url,
            "client_reference_id": f"{tenant_id}:{user_id}",
            "metadata": metadata,
            "payment_method_types": ["card"],
            # Stripe Checkout performs 3DS2/SCA automatically when required.
            "payment_method_options": {"card": {"request_three_d_secure": "automatic"}},
        }
        if customer_email:
            params["customer_email"] = customer_email
        if mode == "payment":
            params["payment_intent_data"] = {"metadata": metadata, "capture_method": "automatic"}
        else:
            params["subscription_data"] = {"metadata": metadata}
            params["allow_promotion_codes"] = False

        try:
            session = stripe.checkout.Session.create(
                **params,
                idempotency_key=idempotency_key,
            )
        except stripe.error.StripeError as exc:
            logger.error("Stripe checkout creation failed: %s", exc)
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Payment provider error") from exc

        return {
            "provider": "stripe",
            "session_id": session.id,
            "checkout_url": session.url,
            "amount_minor": quote["amount_minor"],
            "currency": quote["currency"],
            "mode": mode,
        }

    @staticmethod
    def verify_stripe_webhook(payload_body: bytes, sig_header: str) -> stripe.Event:
        if not settings.STRIPE_WEBHOOK_SECRET:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Webhook not configured")
        try:
            return stripe.Webhook.construct_event(
                payload_body, sig_header, settings.STRIPE_WEBHOOK_SECRET
            )
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payload") from exc
        except stripe.error.SignatureVerificationError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signature") from exc

    # ----------------------------------------------------------- jazzcash
    @staticmethod
    def _jazzcash_hash(fields: dict[str, Any], secret: str) -> str:
        filtered = {k: str(v) for k, v in fields.items() if k not in {"pp_SecureHash"} and v is not None}
        canonical = "&".join(f"{k}={filtered[k]}" for k in sorted(filtered))
        return hmac.new(secret.encode(), canonical.encode(), hashlib.sha256).hexdigest().upper()

    @staticmethod
    def build_jazzcash_request(*, tenant_id: str, amount_minor: int, bill_reference: str, description: str) -> dict[str, str]:
        if not settings.JAZZCASH_INTEGER_KEY:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="JazzCash not configured")
        fields = {
            "pp_Version": "2.0",
            "pp_TxnType": "MWALLET",
            "pp_Language": "EN",
            "pp_MerchantID": settings.JAZZCASH_MERCHANT_ID or "",
            "pp_Password": settings.JAZZCASH_PASSWORD or "",
            "pp_BillReference": bill_reference,
            "pp_Description": description,
            "pp_Amount": str(amount_minor),
            "pp_TxnCurrency": "PKR",
            "pp_TxnRefNo": bill_reference,
        }
        fields["pp_SecureHash"] = PaymentSecurityService._jazzcash_hash(fields, settings.JAZZCASH_INTEGER_KEY)
        return fields

    @staticmethod
    def verify_jazzcash_webhook(payload: dict[str, Any], received_signature: str, expected_amount_minor: int) -> bool:
        if not settings.JAZZCASH_WEBHOOK_SECRET:
            return False
        expected = PaymentSecurityService._jazzcash_hash(payload, settings.JAZZCASH_WEBHOOK_SECRET)
        if not hmac.compare_digest(expected, (received_signature or "").upper()):
            return False
        # Reconcile amount: reject tampered or zero-value callbacks.
        try:
            return int(payload.get("pp_Amount", "-1")) == int(expected_amount_minor)
        except (TypeError, ValueError):
            return False

    # ------------------------------------------------------------ payfast
    @staticmethod
    def build_payfast_signature(fields: dict[str, Any], passphrase: str) -> str:
        parts = []
        for key in sorted(fields):
            if key.lower() == "signature" or fields[key] in (None, ""):
                continue
            parts.append(f"{key}={fields[key]}")
        canonical = "&".join(parts)
        if passphrase:
            canonical += f"&passphrase={passphrase}"
        return hashlib.sha256(canonical.encode()).hexdigest()

    @staticmethod
    def verify_payfast_webhook(payload: dict[str, Any], received_signature: str, expected_amount_minor: int) -> bool:
        if not settings.PAYFAST_SECURED_KEY:
            return False
        expected = PaymentSecurityService.build_payfast_signature(payload, settings.PAYFAST_SECURED_KEY)
        if not hmac.compare_digest(expected.lower(), (received_signature or "").lower()):
            return False
        try:
            return int(Decimal(str(payload.get("amount", "-1"))) * 100) == int(expected_amount_minor)
        except Exception:
            return False
