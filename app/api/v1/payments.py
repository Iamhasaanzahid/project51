"""Payment endpoints: Stripe subscriptions/checkout + local gateways.

Security invariants:
  * No endpoint accepts an amount from the client.
  * Every financial mutation requires an Idempotency-Key header.
  * Webhooks verify HMAC/signature AND source subnet AND reconcile amount.
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.core.config import settings
from app.core.database import tenant_session
from app.core.security import TokenData, enforce_tenant_ownership, require_scopes
from app.middleware.ip_whitelist import enforce_payment_webhook_ip_whitelist
from app.models.transaction import PaymentTransaction
from app.services.audit_service import audit
from app.services.idempotency import IdempotencyConflict
from app.services.payment_service import PaymentSecurityService, PricingError

logger = logging.getLogger("aifabric.payments")
router = APIRouter(prefix="/payments", tags=["payments"])

_IDEMP_RE = re.compile(r"^[A-Za-z0-9_\-]{16,128}$")


class CheckoutRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "sku": "render_pack_100",
                    "quantity": 1,
                    "success_url": "https://app.aifabric.retail/billing/success",
                    "cancel_url": "https://app.aifabric.retail/billing/cancel",
                }
            ]
        }
    )

    sku: str = Field(..., min_length=1, max_length=64)
    quantity: int = Field(1, ge=1, le=100)
    success_url: str = Field(..., max_length=2048)
    cancel_url: str = Field(..., max_length=2048)


class PaymentInitResponse(BaseModel):
    provider: str
    reference: str
    checkout_url: str | None = None
    payload: dict[str, Any] | None = None
    amount_minor: int
    currency: str


def _validate_redirect(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or f"{parsed.scheme}://{parsed.netloc}" not in settings.allowed_origins_list:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid redirect URL")


def _require_idempotency_key(value: str | None) -> str:
    if not value or not _IDEMP_RE.match(value):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A valid Idempotency-Key header is required",
        )
    return value


# ---------------------------------------------------------------------------
# Stripe Checkout (hosted fields => PCI-DSS SAQ A; 3DS2 handled by Stripe)
# ---------------------------------------------------------------------------
@router.post("/checkout", response_model=PaymentInitResponse)
async def create_checkout(
    body: CheckoutRequest,
    request: Request,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    current: TokenData = Depends(require_scopes("payments:write")),
):
    enforce_tenant_ownership(current.tenant_id, current)
    key = _require_idempotency_key(idempotency_key)
    _validate_redirect(body.success_url)
    _validate_redirect(body.cancel_url)

    store = request.app.state.idempotency
    fingerprint = store.fingerprint({"sku": body.sku, "quantity": body.quantity, "tenant": current.tenant_id})
    try:
        state, cached = await store.acquire(current.tenant_id, key, fingerprint)
    except IdempotencyConflict:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Idempotency key conflict") from None
    if state == "in_progress":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Request already in progress")
    if state == "completed" and cached:
        return PaymentInitResponse(**cached)

    try:
        quote = PaymentSecurityService.calculate_amount(body.sku, body.quantity)
    except PricingError:
        await store.release(current.tenant_id, key)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid SKU") from None

    try:
        result = PaymentSecurityService.create_stripe_checkout(
            tenant_id=current.tenant_id,
            user_id=current.user_id,
            sku=body.sku,
            quantity=body.quantity,
            idempotency_key=f"{current.tenant_id}:{key}",
            success_url=body.success_url,
            cancel_url=body.cancel_url,
        )
    except Exception:
        await store.release(current.tenant_id, key)
        raise

    async with tenant_session(current.tenant_id) as session:
        txn = PaymentTransaction(
            tenant_id=current.tenant_id,
            user_id=current.user_id,
            provider="stripe",
            provider_reference=result["session_id"],
            idempotency_key=key,
            sku=body.sku,
            quantity=body.quantity,
            amount_minor=quote["amount_minor"],
            currency=quote["currency"],
            status="pending",
            raw_event={"session_id": result["session_id"]},
        )
        session.add(txn)

    response = {
        "provider": "stripe",
        "reference": result["session_id"],
        "checkout_url": result["checkout_url"],
        "payload": None,
        "amount_minor": quote["amount_minor"],
        "currency": quote["currency"],
    }
    await store.complete(current.tenant_id, key, fingerprint, response)
    audit.payment_event("stripe", "checkout_created", "pending", quote["amount_minor"], quote["currency"])
    return PaymentInitResponse(**response)


# ---------------------------------------------------------------------------
# JazzCash
# ---------------------------------------------------------------------------
@router.post("/jazzcash/initiate", response_model=PaymentInitResponse)
async def jazzcash_initiate(
    body: CheckoutRequest,
    request: Request,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    current: TokenData = Depends(require_scopes("payments:write")),
):
    enforce_tenant_ownership(current.tenant_id, current)
    key = _require_idempotency_key(idempotency_key)
    _validate_redirect(body.success_url)
    _validate_redirect(body.cancel_url)

    store = request.app.state.idempotency
    fingerprint = store.fingerprint({"provider": "jazzcash", "sku": body.sku, "quantity": body.quantity, "tenant": current.tenant_id})
    try:
        state, cached = await store.acquire(current.tenant_id, key, fingerprint)
    except IdempotencyConflict:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Idempotency key conflict") from None
    if state == "in_progress":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Request already in progress")
    if state == "completed" and cached:
        return PaymentInitResponse(**cached)

    try:
        quote = PaymentSecurityService.calculate_amount(body.sku, body.quantity)
    except PricingError:
        await store.release(current.tenant_id, key)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid SKU") from None

    reference = f"{current.tenant_id}:{uuid.uuid4().hex[:18]}"
    try:
        payload = PaymentSecurityService.build_jazzcash_request(
            tenant_id=current.tenant_id,
            amount_minor=quote["amount_minor"],
            bill_reference=reference,
            description=f"{body.sku} x{body.quantity}",
        )
    except Exception:
        await store.release(current.tenant_id, key)
        raise

    async with tenant_session(current.tenant_id) as session:
        session.add(PaymentTransaction(
            tenant_id=current.tenant_id,
            user_id=current.user_id,
            provider="jazzcash",
            provider_reference=reference,
            idempotency_key=key,
            sku=body.sku,
            quantity=body.quantity,
            amount_minor=quote["amount_minor"],
            currency=quote["currency"],
            status="pending",
            raw_event={"bill_reference": reference},
        ))

    response = {
        "provider": "jazzcash",
        "reference": reference,
        "checkout_url": settings.JAZZCASH_API_URL,
        "payload": payload,
        "amount_minor": quote["amount_minor"],
        "currency": quote["currency"],
    }
    await store.complete(current.tenant_id, key, fingerprint, response)
    audit.payment_event("jazzcash", "checkout_created", "pending", quote["amount_minor"], quote["currency"])
    return PaymentInitResponse(**response)


# ---------------------------------------------------------------------------
# PayFast
# ---------------------------------------------------------------------------
@router.post("/payfast/initiate", response_model=PaymentInitResponse)
async def payfast_initiate(
    body: CheckoutRequest,
    request: Request,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    current: TokenData = Depends(require_scopes("payments:write")),
):
    enforce_tenant_ownership(current.tenant_id, current)
    key = _require_idempotency_key(idempotency_key)
    _validate_redirect(body.success_url)
    _validate_redirect(body.cancel_url)

    store = request.app.state.idempotency
    fingerprint = store.fingerprint({"provider": "payfast", "sku": body.sku, "quantity": body.quantity, "tenant": current.tenant_id})
    try:
        state, cached = await store.acquire(current.tenant_id, key, fingerprint)
    except IdempotencyConflict:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Idempotency key conflict") from None
    if state == "in_progress":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Request already in progress")
    if state == "completed" and cached:
        return PaymentInitResponse(**cached)

    try:
        quote = PaymentSecurityService.calculate_amount(body.sku, body.quantity)
    except PricingError:
        await store.release(current.tenant_id, key)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid SKU") from None

    reference = f"{current.tenant_id}:{uuid.uuid4().hex[:18]}"
    fields = {
        "MERCHANT_ID": settings.PAYFAST_MERCHANT_ID or "",
        "BASKET_ID": reference,
        "TXNAMT": f"{quote['amount_minor'] / 100:.2f}",
        "CURRENCY_CODE": quote["currency"],
        "TXNDESC": f"{body.sku} x{body.quantity}",
    }
    fields["signature"] = PaymentSecurityService.build_payfast_signature(
        fields, settings.PAYFAST_SECURED_KEY or ""
    )

    async with tenant_session(current.tenant_id) as session:
        session.add(PaymentTransaction(
            tenant_id=current.tenant_id,
            user_id=current.user_id,
            provider="payfast",
            provider_reference=reference,
            idempotency_key=key,
            sku=body.sku,
            quantity=body.quantity,
            amount_minor=quote["amount_minor"],
            currency=quote["currency"],
            status="pending",
            raw_event={"basket_id": reference},
        ))

    response = {
        "provider": "payfast",
        "reference": reference,
        "checkout_url": settings.PAYFAST_API_URL,
        "payload": fields,
        "amount_minor": quote["amount_minor"],
        "currency": quote["currency"],
    }
    await store.complete(current.tenant_id, key, fingerprint, response)
    audit.payment_event("payfast", "checkout_created", "pending", quote["amount_minor"], quote["currency"])
    return PaymentInitResponse(**response)


@router.post("/jazzcash/webhook", dependencies=[Depends(enforce_payment_webhook_ip_whitelist)])
async def jazzcash_webhook(request: Request):
    form = dict(await request.form())
    tenant_id = str(form.get("pp_BillReference", "")).split(":")[0]
    if not tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Malformed callback")

    async with tenant_session(tenant_id) as session:
        txn = (await session.execute(
            select(PaymentTransaction).where(
                PaymentTransaction.provider == "jazzcash",
                PaymentTransaction.provider_reference == form.get("pp_BillReference"),
            )
        )).scalar_one_or_none()
        if txn is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown transaction")

        valid = PaymentSecurityService.verify_jazzcash_webhook(
            form, form.get("pp_SecureHash", ""), txn.amount_minor
        )
        if not valid:
            audit.payment_event("jazzcash", "signature_rejected", "failed", txn.amount_minor, txn.currency)
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signature")

        succeeded = str(form.get("pp_ResponseCode", "")) == "000"
        txn.status = "succeeded" if succeeded else "failed"
        txn.completed_at = datetime.now(UTC) if succeeded else None
        txn.raw_event = {k: v for k, v in form.items() if k.lower() not in {"pp_password", "pp_securehash"}}

    audit.payment_event("jazzcash", "webhook", "succeeded" if succeeded else "failed", txn.amount_minor, txn.currency)
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# PayFast
# ---------------------------------------------------------------------------
@router.post("/payfast/webhook", dependencies=[Depends(enforce_payment_webhook_ip_whitelist)])
async def payfast_webhook(request: Request):
    form = dict(await request.form())
    basket = str(form.get("basket_id", ""))
    tenant_id = basket.split(":")[0]
    if not tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Malformed callback")

    async with tenant_session(tenant_id) as session:
        txn = (await session.execute(
            select(PaymentTransaction).where(
                PaymentTransaction.provider == "payfast",
                PaymentTransaction.provider_reference == basket,
            )
        )).scalar_one_or_none()
        if txn is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown transaction")

        valid = PaymentSecurityService.verify_payfast_webhook(
            form, form.get("signature", ""), txn.amount_minor
        )
        if not valid:
            audit.payment_event("payfast", "signature_rejected", "failed", txn.amount_minor, txn.currency)
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signature")

        succeeded = str(form.get("status", "")).lower() in {"success", "completed", "00"}
        txn.status = "succeeded" if succeeded else "failed"
        txn.completed_at = datetime.now(UTC) if succeeded else None
        txn.raw_event = {k: v for k, v in form.items() if k.lower() not in {"signature", "secured_key"}}

    audit.payment_event("payfast", "webhook", "succeeded" if succeeded else "failed", txn.amount_minor, txn.currency)
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Stripe webhook
# ---------------------------------------------------------------------------
@router.post("/stripe/webhook", dependencies=[Depends(enforce_payment_webhook_ip_whitelist)])
async def stripe_webhook(request: Request):
    payload = await request.body()
    signature = request.headers.get("Stripe-Signature", "")
    event = PaymentSecurityService.verify_stripe_webhook(payload, signature)

    obj = event["data"]["object"]
    session_id = obj.get("id") if event["type"].startswith("checkout.session") else obj.get("payment_intent")
    metadata = obj.get("metadata", {}) or {}
    tenant_id = metadata.get("tenant_id")

    if not tenant_id or not session_id:
        logger.warning("Stripe event without tenant metadata: %s", event["id"])
        return {"status": "ignored"}

    async with tenant_session(tenant_id) as session:
        txn = (await session.execute(
            select(PaymentTransaction).where(
                PaymentTransaction.provider == "stripe",
                PaymentTransaction.provider_reference == session_id,
            )
        )).scalar_one_or_none()

        if txn is None:
            logger.warning("Stripe event for unknown session %s", session_id)
            return {"status": "ignored"}

        if event["type"] in {"checkout.session.completed", "payment_intent.succeeded"}:
            amount = int(obj.get("amount_total") or obj.get("amount_received") or 0)
            if amount and amount != txn.amount_minor:
                audit.payment_event("stripe", "amount_mismatch", "failed", amount, txn.currency)
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Amount mismatch")
            txn.status = "succeeded"
            txn.completed_at = datetime.now(UTC)
        elif event["type"] in {"payment_intent.payment_failed", "checkout.session.expired"}:
            txn.status = "failed"
        elif event["type"] in {"charge.refunded", "charge.dispute.created"}:
            txn.status = "refunded" if event["type"] == "charge.refunded" else "disputed"
        else:
            return {"status": "ignored"}

        txn.raw_event = {
            "event_id": event["id"],
            "type": event["type"],
            "payment_status": obj.get("payment_status"),
        }

    audit.payment_event("stripe", event["type"], txn.status, txn.amount_minor, txn.currency)
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Ledger (tenant-scoped)
# ---------------------------------------------------------------------------
@router.get("/transactions")
async def list_transactions(current: TokenData = Depends(require_scopes("payments:read"))):
    async with tenant_session(current.tenant_id) as session:
        rows = (await session.execute(
            select(PaymentTransaction).order_by(PaymentTransaction.created_at.desc()).limit(100)
        )).scalars().all()
    return [
        {
            "id": str(t.id),
            "provider": t.provider,
            "sku": t.sku,
            "amount_minor": t.amount_minor,
            "currency": t.currency,
            "status": t.status,
            "created_at": t.created_at.isoformat(),
        }
        for t in rows
    ]
