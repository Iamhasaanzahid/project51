import pytest

from app.core.config import settings
from app.services.payment_service import PaymentSecurityService, PricingError


def test_server_side_pricing_is_authoritative():
    q = PaymentSecurityService.calculate_amount("render_pack_10", 3)
    assert q["amount_minor"] == 150_000
    assert q["unit_amount_minor"] == 50_000
    assert q["currency"] == "PKR"
    assert q["kind"] == "one_time"


def test_subscription_quantity_is_forced_to_one():
    q = PaymentSecurityService.calculate_amount("saas_monthly", 99)
    assert q["quantity"] == 1
    assert q["amount_minor"] == 1_500_000


@pytest.mark.parametrize("sku,quantity", [("does-not-exist", 1), ("render_pack_10", 0), ("render_pack_10", 101)])
def test_invalid_pricing_input_rejected(sku, quantity):
    with pytest.raises(PricingError):
        PaymentSecurityService.calculate_amount(sku, quantity)


def test_jazzcash_request_is_signed_and_verifiable(monkeypatch):
    monkeypatch.setattr(settings, "JAZZCASH_INTEGER_KEY", "integrity-key")
    monkeypatch.setattr(settings, "JAZZCASH_MERCHANT_ID", "MC-1")
    monkeypatch.setattr(settings, "JAZZCASH_PASSWORD", "pw")
    monkeypatch.setattr(settings, "JAZZCASH_WEBHOOK_SECRET", "webhook-secret")

    fields = PaymentSecurityService.build_jazzcash_request(
        tenant_id="tenant_a", amount_minor=125_000, bill_reference="tenant_a:ref1", description="pack"
    )
    assert fields["pp_SecureHash"] == PaymentSecurityService._jazzcash_hash(fields, "integrity-key")

    payload = dict(fields)
    payload["pp_ResponseCode"] = "000"
    signature = PaymentSecurityService._jazzcash_hash(payload, "webhook-secret")

    assert PaymentSecurityService.verify_jazzcash_webhook(payload, signature, 125_000) is True
    assert PaymentSecurityService.verify_jazzcash_webhook(payload, signature, 1) is False

    tampered = dict(payload, pp_Amount="1")
    assert PaymentSecurityService.verify_jazzcash_webhook(tampered, signature, 125_000) is False


def test_jazzcash_rejects_missing_secret(monkeypatch):
    monkeypatch.setattr(settings, "JAZZCASH_WEBHOOK_SECRET", None)
    assert PaymentSecurityService.verify_jazzcash_webhook({}, "sig", 100) is False


def test_payfast_signature_detects_tampering(monkeypatch):
    monkeypatch.setattr(settings, "PAYFAST_SECURED_KEY", "pf-passphrase")

    payload = {"basket_id": "tenant_a:ref1", "amount": "500.00", "status": "success", "item": "pack"}
    signature = PaymentSecurityService.build_payfast_signature(payload, "pf-passphrase")

    assert PaymentSecurityService.verify_payfast_webhook(payload, signature, 50_000) is True
    assert PaymentSecurityService.verify_payfast_webhook(dict(payload, amount="1.00"), signature, 50_000) is False
    assert PaymentSecurityService.verify_payfast_webhook(payload, "deadbeef", 50_000) is False
