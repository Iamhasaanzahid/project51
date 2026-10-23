# Deploying the Streamlit UI

## The short answer

**Streamlit Community Cloud can host the UI, but it cannot host this platform.**
Community Cloud runs a single Streamlit Python process. It cannot run FastAPI,
PostgreSQL, Redis, Celery, ClamAV, or an NVIDIA GPU worker.

There are two workable deployments:

| Mode | What is deployed | Backend required | Use case |
|---|---|---|---|
| **Demo** | Streamlit UI only | No | Public showcase, investor demo, UI review |
| **Real** | Streamlit UI + API + Postgres + Redis + GPU worker | Yes | Actual rendering and payments |

The UI detects the mode automatically:

- `API_BASE_URL` **unset** → demo mode.
- `DEMO_MODE = "true"` → demo mode even if an API URL is present.
- `API_BASE_URL` set and `DEMO_MODE` false → real mode.

---

## Option A — deploy the demo to Streamlit Community Cloud

The repository is already prepared:

- `streamlit_app.py` is the Cloud entrypoint.
- `requirements.txt` contains **only** UI dependencies (`streamlit`, `httpx`,
  `Pillow`). API dependencies live in `requirements-api.txt` so Cloud does not
  install FastAPI, Torch, etc.
- `.streamlit/config.toml` enables XSRF protection and disables usage stats.
- Demo mode validates uploads (magic bytes, size, decode), strips EXIF/GPS, and
  applies a deterministic local preview transform. It is clearly labelled and
  performs **no** GPU work and **no** payments.

### Steps

1. Go to <https://share.streamlit.io> and sign in with GitHub.
2. **Create app** → **Deploy a public app from GitHub**.
3. Repository: `Iamhasaanzahid/project51`
4. Branch: `main`
5. Main file path: `streamlit_app.py`
6. Advanced settings → Python version: **3.11**.
7. (Optional) Secrets — either omit secrets or use:

   ```toml
   DEMO_MODE = "true"
   ```

8. Click **Deploy**. The first build installs only the three UI packages.

The app URL will be `https://<app-name>.streamlit.app`.

> Community Cloud apps are public by default. Use the app's sharing settings to
> restrict viewers if the demo must be private.

---

## Option B — connect the UI to a real backend

### 1. Deploy the API and data services

Follow [`deployment-runbook.md`](deployment-runbook.md). At minimum you need:

- FastAPI reachable over **HTTPS** at a public hostname.
- PostgreSQL with TLS (managed or in-cluster).
- Redis with TLS/AUTH.
- ClamAV.
- S3 + KMS for quarantine/result objects.
- A GPU worker pool (Celery queue `gpu_render`).

Streamlit Cloud cannot provide any of these.

### 2. Configure Streamlit secrets

In the Cloud app: **Settings → Secrets**:

```toml
API_BASE_URL = "https://api.your-domain.example"
DEMO_MODE = "false"

# Must be HTTPS and must be listed in the API's ALLOWED_ORIGINS.
APP_SUCCESS_URL = "https://<app-name>.streamlit.app/?checkout=success"
APP_CANCEL_URL = "https://<app-name>.streamlit.app/?checkout=cancel"
```

Secrets are available as `st.secrets` and are never written to disk by this app.

### 3. Allow the Streamlit origin in the API

CORS uses an explicit allow-list. Add the exact app origin (scheme + host, no
path) to `.env` / Secrets Manager:

```dotenv
ALLOWED_ORIGINS="https://api.your-domain.example,https://<app-name>.streamlit.app"
```

Restart the API after changing it. Wildcards for subdomains are **not**
supported by the CORS middleware.

### 4. Payment redirects

`POST /api/v1/payments/checkout` rejects any redirect URL whose origin is not in
`ALLOWED_ORIGINS`. The success/cancel URLs above therefore must match one of the
configured origins and use HTTPS.

### 5. Verify

- Sign in with a tenant user created by `make seed` / `bootstrap_admin.py`.
- Render tab → upload a JPEG/PNG/WEBP (≤15 MiB).
- The API re-runs magic-byte, ClamAV, EXIF and quarantine checks; the UI never
  bypasses them.
- Payments tab → the API derives the price from its SKU catalogue; the UI never
  sends an amount.

---

## Self-hosted UI (same network as the API)

Use `docker/Dockerfile.streamlit` (non-root, read-only rootfs, XSRF enabled):

```bash
docker build -f docker/Dockerfile.streamlit -t aifabric-ui .
docker run --rm -p 8501:8501 \
  -e API_BASE_URL=https://api.your-domain.example \
  -e DEMO_MODE=false \
  aifabric-ui
```

Put it behind the same TLS-terminating ingress as the API and add its origin to
`ALLOWED_ORIGINS`.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| “Authentication service is unreachable” | Backend not deployed / wrong URL | Set `API_BASE_URL` or enable demo mode |
| Login returns 401 | Wrong tenant/email/password, or account locked | Check tenant slug and lockout state |
| Checkout returns 400 `Invalid redirect URL` | Redirect origin not in `ALLOWED_ORIGINS` or not HTTPS | Add the exact HTTPS origin |
| CORS error in browser | App origin missing from `ALLOWED_ORIGINS` | Add `https://<app>.streamlit.app` |
| Cloud build fails installing Torch | Root `requirements.txt` was replaced with API deps | Keep `requirements.txt` UI-only |
| Images render in demo but not real mode | No GPU worker consuming `gpu_render` | Start the worker pool |

## Security notes

- Never put `STRIPE_SECRET_KEY`, database passwords, or AWS keys in Streamlit
  secrets for a public demo. The UI does not need them.
- Demo mode accepts any credentials by design; it is not an authentication
  boundary. Do not present it as production.
- The UI stores the access token in Streamlit session state only; it is not
  persisted or logged.
