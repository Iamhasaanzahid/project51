"""Minimal Streamlit console for the hardened API.

The UI never handles card data (Stripe Checkout is hosted) and stores the JWT
only in the per-session state. All validation is enforced server-side.
"""
from __future__ import annotations

import os

import httpx
import streamlit as st

API_BASE = os.environ.get("API_BASE_URL", "http://api:8000")

st.set_page_config(page_title="AI Fabric Studio", page_icon="🧵", layout="centered")
st.title("AI Fabric Studio")
st.caption("Secure tenant console")

if "token" not in st.session_state:
    st.session_state.token = None

# ---------------------------------------------------------------- login
if not st.session_state.token:
    with st.form("login"):
        tenant_slug = st.text_input("Tenant")
        email = st.text_input("Email")
        password = st.text_input("Password", type="password")
        submitted = st.form_submit_button("Sign in")
    if submitted:
        try:
            resp = httpx.post(
                f"{API_BASE}/api/v1/auth/login",
                json={"tenant_slug": tenant_slug, "email": email, "password": password},
                timeout=15,
            )
            if resp.status_code == 200:
                st.session_state.token = resp.json()["access_token"]
                st.rerun()
            else:
                st.error("Invalid credentials")
        except httpx.HTTPError:
            st.error("Authentication service unavailable")
    st.stop()

headers = {"Authorization": f"Bearer {st.session_state.token}"}

# ---------------------------------------------------------------- identity
try:
    me = httpx.get(f"{API_BASE}/api/v1/auth/me", headers=headers, timeout=10).json()
    st.sidebar.write(f"Tenant: **{me.get('tenant_id')}**")
    st.sidebar.write(f"User: `{me.get('user_id')}`")
except httpx.HTTPError:
    st.sidebar.warning("Session validation failed")

if st.sidebar.button("Sign out"):
    st.session_state.token = None
    st.rerun()

# ---------------------------------------------------------------- render
st.subheader("Fabric render")
upload = st.file_uploader("Fabric image", type=["jpg", "jpeg", "png", "webp"])
prompt = st.text_area("Prompt", max_chars=2000, placeholder="Describe the desired fabric finish")
if st.button("Queue render", disabled=upload is None):
    files = {"fabric_image": (upload.name, upload.getvalue(), upload.type)}
    try:
        resp = httpx.post(
            f"{API_BASE}/api/v1/ai/render",
            headers=headers,
            files=files,
            data={"prompt": prompt},
            timeout=60,
        )
        if resp.status_code == 202:
            body = resp.json()
            st.success(f"Queued job {body['job_id']}")
            st.image(body["source_preview_url"], caption="Sanitised source")
        elif resp.status_code == 429:
            st.warning("Rate limited — please retry shortly.")
        else:
            st.error("Upload rejected")
    except httpx.HTTPError:
        st.error("Render service unavailable")
