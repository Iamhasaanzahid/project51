"""AI Fabric Studio — Streamlit console.

Runs in two modes:
  * REAL   : talks to the hardened FastAPI backend (API_BASE_URL).
  * DEMO   : fully standalone; validates/sanitises images locally and runs a
             deterministic preview transform. Used for Streamlit Community
             Cloud demos when no backend is deployed.

The UI never accepts card data and never trusts client-side prices; in REAL
mode both are enforced by the API.
"""
from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime

import httpx

import streamlit as st
from ui.image_ops import (
    ImageValidationError,
    demo_render,
    image_to_png,
    sha256_hex,
    strip_metadata,
    validate_image_bytes,
)

st.set_page_config(
    page_title="AI Fabric Studio",
    page_icon="🧵",
    layout="wide",
    initial_sidebar_state="expanded",
)

# --------------------------------------------------------------------------- config
def _cfg(key: str, default: str | None = None) -> str | None:
    """Read from Streamlit secrets first, then environment."""
    try:
        if key in st.secrets:
            return str(st.secrets[key])
    except Exception:  # noqa: S110 - Streamlit secrets are optional in local/demo runs
        pass
    return os.environ.get(key, default)


API_BASE = (_cfg("API_BASE_URL", "") or "").rstrip("/")
APP_SUCCESS_URL = _cfg("APP_SUCCESS_URL", "https://example.com/success")
APP_CANCEL_URL = _cfg("APP_CANCEL_URL", "https://example.com/cancel")
DEMO_CONFIGURED = str(_cfg("DEMO_MODE", "false")).lower() in {"1", "true", "yes", "on"}

CATALOG = [
    ("render_pack_10", "10 render pack", "PKR 500.00"),
    ("render_pack_100", "100 render pack", "PKR 4,000.00"),
    ("saas_monthly", "SaaS — monthly", "PKR 15,000.00"),
    ("saas_annual", "SaaS — annual", "PKR 150,000.00"),
]

SECURITY_CHECKS = [
    ("Magic-byte validation", "Rejects polyglots and extension spoofing before decode."),
    ("EXIF / GPS scrubbing", "Pixels are re-encoded; device metadata never reaches the GPU."),
    ("ClamAV malware scan", "Stream + S3 quarantine scan with fail-closed behaviour."),
    ("Non-root GPU workers", "Read-only rootfs, dropped capabilities, seccomp profile."),
    ("Leaky-bucket GPU shield", "Atomic Redis Lua limiter keyed by token hash."),
    ("Server-side pricing", "No request schema accepts an amount."),
    ("HMAC webhook integrity", "JazzCash/PayFast signatures + processor CIDR allow-lists."),
    ("Stripe 3DS2 + idempotency", "Hosted Checkout, zero raw card data, replay-safe retries."),
    ("Tenant isolation", "Schema-per-tenant + PostgreSQL RLS + uniform 404 IDOR guard."),
    ("TLS 1.3 / AES-256", "TLS-only transport, KMS/TDE at rest, 15-min presigned URLs."),
    ("PII-redacting logs", "Passwords, tokens, PANs and CNICs are scrubbed before emit."),
    ("DevSecOps", "Bandit, Semgrep, Gitleaks, Trivy, pip-audit, SBOM, Dependabot."),
]


def _auth_headers() -> dict:
    return {"Authorization": f"Bearer {st.session_state.token}"}


def _is_authenticated() -> bool:
    return bool(st.session_state.get("token") or st.session_state.get("demo_user"))


def _demo_enabled() -> bool:
    if DEMO_CONFIGURED or not API_BASE:
        return True
    return bool(st.session_state.get("demo_toggle", False))


def _sign_out() -> None:
    for key in ("token", "refresh_token", "demo_user", "job_id", "result_url", "render_png"):
        st.session_state.pop(key, None)


# --------------------------------------------------------------------------- login
def _render_login(demo_mode: bool) -> None:
    left, right = st.columns([1.1, 1], gap="large")

    with left:
        st.title("🧵 AI Fabric Studio")
        st.caption("Hyper-secure fabric rendering & retail console")
        st.markdown(
            """
            **Security-first by design**

            - Tenant-scoped JWT access (15 minutes)
            - Magic-byte + EXIF + ClamAV media pipeline
            - Server-authoritative pricing and idempotent payments
            - PII-redacted structured logs
            """
        )
        if demo_mode:
            st.info(
                "**Demo mode** — no backend required. Any tenant/email works; "
                "use a password of at least 8 characters. Uploads are validated and "
                "metadata-scrubbed locally, then rendered with a deterministic preview."
            )
        else:
            st.success("Connected to the hardened API. Sign in with your tenant credentials.")

    with right:
        st.subheader("Sign in")
        with st.form("login_form"):
            tenant = st.text_input("Tenant", value="acme", max_chars=64)
            email = st.text_input("Email", value="demo@aifabric.retail", max_chars=320)
            password = st.text_input("Password", type="password", max_chars=256)
            submitted = st.form_submit_button("Sign in", use_container_width=True)

        if API_BASE:
            st.checkbox("Run in demo mode (no backend)", key="demo_toggle")

        if submitted:
            if not tenant.strip() or not email.strip():
                st.error("Tenant and email are required.")
                return
            if len(password) < 8:
                st.error("Password must be at least 8 characters.")
                return

            if demo_mode:
                st.session_state.demo_user = {
                    "tenant_id": tenant.strip(),
                    "email": email.strip(),
                    "user_id": f"demo-{uuid.uuid4().hex[:10]}",
                }
                st.rerun()

            try:
                resp = httpx.post(
                    f"{API_BASE}/api/v1/auth/login",
                    json={"tenant_slug": tenant.strip(), "email": email.strip(), "password": password},
                    timeout=20,
                )
            except httpx.HTTPError:
                st.error("Authentication service is unreachable. Try demo mode.")
                return

            if resp.status_code == 200:
                body = resp.json()
                st.session_state.token = body["access_token"]
                st.session_state.refresh_token = body.get("refresh_token")
                st.session_state.demo_user = None
                st.rerun()
            elif resp.status_code == 423:
                st.error("Account temporarily locked after repeated failures.")
            elif resp.status_code == 429:
                st.warning("Too many attempts. Please wait and retry.")
            else:
                st.error("Invalid credentials.")


# --------------------------------------------------------------------------- sidebar
def _render_sidebar(demo_mode: bool) -> None:
    with st.sidebar:
        st.markdown("## 🧵 AI Fabric Studio")
        if demo_mode:
            st.warning("DEMO MODE\n\nNo backend connected.")
            identity = st.session_state.get("demo_user", {})
            st.write(f"**Tenant:** `{identity.get('tenant_id', '-')}`")
            st.write(f"**User:** `{identity.get('user_id', '-')}`")
        else:
            st.success("REAL MODE\n\nHardened API connected.")
            st.write(f"**API:** `{API_BASE}`")
            try:
                me = httpx.get(f"{API_BASE}/api/v1/auth/me", headers=_auth_headers(), timeout=10)
                if me.status_code == 200:
                    body = me.json()
                    st.write(f"**Tenant:** `{body.get('tenant_id')}`")
                    st.write(f"**User:** `{body.get('user_id')}`")
                    st.caption("Scopes: " + ", ".join(body.get("scopes", [])))
                else:
                    st.warning("Session is no longer valid.")
            except httpx.HTTPError:
                st.warning("API unreachable.")

        st.divider()
        st.caption(f"Session started {datetime.now(UTC).strftime('%Y-%m-%d %H:%M UTC')}")
        if st.button("Sign out", use_container_width=True):
            _sign_out()
            st.rerun()


# --------------------------------------------------------------------------- render
def _render_render_tab(demo_mode: bool) -> None:
    st.subheader("Fabric render")
    st.caption(
        "Uploads are validated in-memory. In real mode the API re-runs magic-byte, "
        "ClamAV, EXIF and quarantine checks before any GPU work is queued."
    )

    left, right = st.columns([1, 1], gap="large")

    with left:
        upload = st.file_uploader("Fabric image", type=["jpg", "jpeg", "png", "webp"])
        prompt = st.text_area(
            "Prompt",
            value="premium cotton weave, studio lighting, seamless texture",
            max_chars=2000,
            height=120,
        )
        run = st.button(
            "Validate & queue render",
            type="primary",
            use_container_width=True,
            disabled=upload is None,
        )

    if not run or upload is None:
        with right:
            st.info("Upload a JPEG, PNG or WEBP (max 15 MiB) to begin.")
        return

    raw = upload.getvalue()
    checks: list[tuple[str, str, str]] = []

    try:
        image, mime = validate_image_bytes(raw)
        checks.append(("Magic bytes", "PASS", f"{mime} · {len(raw) / 1024:.1f} KiB"))
        sanitized = strip_metadata(image)
        checks.append(("EXIF / GPS scrub", "PASS", "Metadata removed by pixel re-encode"))
        sanitized_png = image_to_png(sanitized)
        checks.append(("Preview", "PASS", f"SHA-256 {sha256_hex(sanitized_png)[:16]}…"))
    except ImageValidationError as exc:
        checks.append(("Validation", "FAIL", str(exc)))
        with right:
            st.error(f"Upload rejected: {exc}")
            st.table([{"Check": c[0], "Result": c[1], "Detail": c[2]} for c in checks])
        return

    with right:
        st.image(sanitized_png, caption="Sanitised preview (metadata stripped)", use_container_width=True)

    st.divider()
    st.markdown("#### Pipeline checks")
    st.table([{"Check": c[0], "Result": c[1], "Detail": c[2]} for c in checks])

    st.divider()
    st.markdown("#### Render")

    if demo_mode:
        if st.button("Run demo render", type="primary", use_container_width=True):
            with st.spinner("Running deterministic preview transform…"):
                rendered = demo_render(sanitized, prompt)
                st.session_state.render_png = rendered
                st.session_state.job_id = f"demo-{uuid.uuid4().hex[:12]}"
        if st.session_state.get("render_png"):
            st.success(f"Demo job `{st.session_state.job_id}` complete.")
            st.image(st.session_state.render_png, caption="Demo render (local preview, not diffusion)", use_container_width=True)
            st.download_button(
                "Download PNG",
                data=st.session_state.render_png,
                file_name=f"{st.session_state.job_id}.png",
                mime="image/png",
            )
        return

    # --- real mode ---------------------------------------------------------
    if st.button("Queue GPU render", type="primary", use_container_width=True):
        try:
            resp = httpx.post(
                f"{API_BASE}/api/v1/ai/render",
                headers=_auth_headers(),
                files={"fabric_image": (upload.name, sanitized_png, "image/png")},
                data={"prompt": prompt},
                timeout=60,
            )
        except httpx.HTTPError:
            st.error("Render service unavailable.")
            return

        if resp.status_code == 202:
            body = resp.json()
            st.session_state.job_id = body["job_id"]
            st.session_state.result_url = None
            st.success(f"Queued job `{body['job_id']}`.")
        elif resp.status_code == 401:
            st.error("Session expired. Please sign in again.")
            _sign_out()
        elif resp.status_code == 429:
            retry = resp.headers.get("Retry-After", "a few")
            st.warning(f"GPU rate limit reached. Retry in {retry} seconds.")
        elif resp.status_code in (413, 415, 422):
            st.error(f"Upload rejected: {resp.json().get('detail', 'invalid upload')}")
        else:
            st.error("Render request failed.")

    if st.session_state.get("job_id"):
        st.info(f"Job: `{st.session_state.job_id}`")
        if st.button("Refresh status"):
            try:
                resp = httpx.get(
                    f"{API_BASE}/api/v1/ai/render/{st.session_state.job_id}",
                    headers=_auth_headers(),
                    timeout=20,
                )
            except httpx.HTTPError:
                st.error("Status check failed.")
                return
            if resp.status_code == 200:
                body = resp.json()
                st.write(f"**Status:** `{body['status']}`")
                if body.get("error_code"):
                    st.error(f"Error code: `{body['error_code']}`")
                if body.get("result_url"):
                    st.image(body["result_url"], caption="Rendered result", use_container_width=True)
            elif resp.status_code == 404:
                st.error("Job not found in this tenant.")
            else:
                st.error("Status check failed.")


# --------------------------------------------------------------------------- payments
def _render_payments_tab(demo_mode: bool) -> None:
    st.subheader("Payments")
    st.caption("Prices below are display-only. The API independently derives the charge from its SKU catalogue.")

    st.table([{"SKU": sku, "Plan": label, "Price": price} for sku, label, price in CATALOG])

    if demo_mode:
        st.info("Demo mode — checkout is disabled. Deploy the API and set `API_BASE_URL` to enable Stripe Checkout.")
        return

    with st.form("checkout_form"):
        sku = st.selectbox("SKU", [c[0] for c in CATALOG])
        quantity = st.number_input("Quantity", min_value=1, max_value=100, value=1)
        success_url = st.text_input("Success URL", value=APP_SUCCESS_URL or "")
        cancel_url = st.text_input("Cancel URL", value=APP_CANCEL_URL or "")
        submitted = st.form_submit_button("Create Stripe Checkout", type="primary", use_container_width=True)

    if not submitted:
        return

    if not (success_url.startswith("https://") and cancel_url.startswith("https://")):
        st.error("Redirect URLs must use HTTPS.")
        return

    headers = {**_auth_headers(), "Idempotency-Key": uuid.uuid4().hex}
    try:
        resp = httpx.post(
            f"{API_BASE}/api/v1/payments/checkout",
            headers=headers,
            json={"sku": sku, "quantity": int(quantity), "success_url": success_url, "cancel_url": cancel_url},
            timeout=30,
        )
    except httpx.HTTPError:
        st.error("Payment service unavailable.")
        return

    if resp.status_code == 200:
        body = resp.json()
        st.success(f"Reference `{body['reference']}` · {body['amount_minor'] / 100:.2f} {body['currency']}")
        if body.get("checkout_url"):
            st.link_button("Open hosted Stripe Checkout", body["checkout_url"], use_container_width=True)
        st.caption("Card data is entered only on Stripe's hosted page (PCI SAQ A). 3DS2 is automatic.")
    elif resp.status_code == 409:
        st.warning("Duplicate request in progress. Retry with a new idempotency key.")
    elif resp.status_code == 400:
        st.error(f"Rejected: {resp.json().get('detail', 'invalid request')}")
    else:
        st.error("Checkout creation failed.")


# --------------------------------------------------------------------------- security
def _render_security_tab(demo_mode: bool) -> None:
    st.subheader("Security posture")
    st.table([{"Control": name, "Implementation": detail} for name, detail in SECURITY_CHECKS])

    st.divider()
    st.markdown("#### Runtime")
    st.write(f"- Mode: **{'DEMO' if demo_mode else 'REAL'}**")
    st.write(f"- API base: `{API_BASE or 'not configured'}`")
    if st.session_state.get("token"):
        st.write("- Access token: stored in this session only (never persisted)")
    st.write("- Card data: never handled by this app")

    with st.expander("Safe-operations checklist"):
        st.markdown(
            """
            1. Revoke any token shared in chat immediately.
            2. Keep `.env` out of git; CI runs Gitleaks.
            3. Use HTTPS-only redirect URLs for checkout.
            4. Set `API_BASE_URL` via Streamlit secrets, not source code.
            5. If the UI is public, add its exact origin to `ALLOWED_ORIGINS`.
            """
        )


# --------------------------------------------------------------------------- main
def main() -> None:
    if "demo_user" not in st.session_state:
        st.session_state.demo_user = None

    demo_mode = _demo_enabled()

    if not _is_authenticated():
        _render_login(demo_mode)
        return

    _render_sidebar(demo_mode)

    if demo_mode:
        st.warning("Demo mode: local preview pipeline only. The hardened API is not connected.")

    render_tab, payments_tab, security_tab = st.tabs(["Render", "Payments", "Security"])
    with render_tab:
        _render_render_tab(demo_mode)
    with payments_tab:
        _render_payments_tab(demo_mode)
    with security_tab:
        _render_security_tab(demo_mode)

    st.divider()
    st.caption(
        "AI Fabric & Retail SaaS · security-hardened reference implementation · "
        "no raw card data, no client-side pricing, no unvalidated uploads."
    )


if __name__ == "__main__":
    main()
