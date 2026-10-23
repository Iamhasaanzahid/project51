# AI Fabric & Retail SaaS — Hardened Platform

Enterprise-grade security hardening for a multi-tenant AI fabric/retail platform:
FastAPI + Celery/Redis, multi-tenant PostgreSQL, a ControlNet SDXL render
pipeline, and JazzCash / PayFast / Stripe payments.

The repository implements all six hardening vectors from the platform blueprint
with production code and infrastructure — no placeholders.

---

## 1. Architecture

```
                     ┌──────────────────────────┐
   TLS 1.3 only      │  Nginx / Ingress (WAF)    │
   HSTS, CSP  ──────▶│  rate-limit, 16 MiB cap   │
                     └────────────┬─────────────┘
                                  │
                     ┌────────────▼─────────────┐
                     │  FastAPI (non-root)       │
                     │  JWT RBAC · tenant guard  │
                     │  leaky-bucket limiter     │
                     └───┬───────────┬───────────┘
                         │           │
          ┌──────────────▼──┐   ┌────▼────────────────┐
          │ PostgreSQL 16   │   │ Redis (TLS)         │
          │ schema-per-     │   │ idempotency + NX    │
          │ tenant + RLS    │   └─────────────────────┘
          └──────────────┬──┘
                         │
          ┌──────────────▼───────────┐      ┌──────────────────┐
          │ Celery GPU worker        │─────▶│ S3 (SSE-KMS)     │
          │ quarantine → ClamAV      │      │ 15-min presigned │
          │ → ControlNet SDXL        │      └──────────────────┘
          └──────────────────────────┘
```

## 2. Security controls → code map

| Vector | Control | Location |
|---|---|---|
| 1. Media | Magic-byte validation | `app/services/media_sanitizer.py` |
| 1. Media | EXIF/GPS scrub (Pillow) | `app/services/media_sanitizer.py` |
| 1. Media | ClamAV stream + S3 quarantine scan | `app/services/malware_scanner.py` |
| 1. Media | Non-root/seccomp containers | `docker/`, `deploy/k8s/` |
| 1. Media | Leaky-bucket GPU DoS shield | `app/middleware/rate_limiter.py` |
| 2. Payments | Server-side pricing only | `app/services/payment_service.py` |
| 2. Payments | HMAC-SHA256 + CIDR allow-list | `payment_service.py`, `middleware/ip_whitelist.py` |
| 2. Payments | Stripe hosted Checkout (PCI SAQ A, 3DS2) | `app/api/v1/payments.py` |
| 2. Payments | Idempotency keys | `app/services/idempotency.py` |
| 3. Secrets | Env + AWS Secrets Manager | `app/core/config.py`, `.env.example` |
| 3. Secrets | Leak prevention | `.gitignore`, `security/.gitleaks.toml` |
| 4. Tenancy | Schema-per-tenant + RLS | `deploy/postgres/init.sql`, `app/core/tenant.py` |
| 4. Tenancy | IDOR guards, scope RBAC, JWT | `app/core/security.py` |
| 5. Data | AES-256 at rest (KMS/TDE) + pgcrypto | `deploy/postgres/init.sql` |
| 5. Data | TLS 1.3 in transit | `docker/nginx.conf`, compose, K8s |
| 5. Data | 15-min presigned URLs | `app/services/storage_service.py` |
| 5. Data | PII-redacting logs + error masking | `app/core/logging_config.py`, `middleware/error_handler.py` |
| 6. DevSecOps | Bandit/Semgrep/Gitleaks/Trivy/Scout/SBOM/Dependabot | `.github/workflows/devsecops.yml` |
| 6. Observability | Prometheus + Loki + Grafana alerts | `observability/` |

## 3. Quick start

```bash
cp .env.example .env
./scripts/gen-dev-certs.sh

# Generate a strong secret
python -c "import secrets; print(secrets.token_hex(32))"   # paste into SECRET_KEY

docker compose -f deploy/docker-compose.yml up -d --build

# Provision a tenant + admin (after postgres is healthy)
ADMIN_PASSWORD='ChangeMe-With-A-Long-Password' \
python scripts/bootstrap_admin.py --slug acme --name "Acme Retail" --email admin@acme.example

curl -k https://localhost:8443/healthz
```

## 4. API surface

| Method | Path | Scope | Notes |
|---|---|---|---|
| POST | `/api/v1/auth/login` | — | tenant-scoped; lockout after 5 failures |
| POST | `/api/v1/auth/refresh` | — | refresh token only |
| GET | `/api/v1/auth/me` | bearer | identity |
| POST | `/api/v1/ai/render` | `ai:render` | magic-byte + EXIF + ClamAV + rate limit |
| GET | `/api/v1/ai/render/{id}` | `ai:render` | tenant-scoped, uniform 404 |
| POST | `/api/v1/payments/checkout` | `payments:write` | requires `Idempotency-Key` |
| POST | `/api/v1/payments/jazzcash/initiate` | `payments:write` | HMAC-signed request |
| POST | `/api/v1/payments/{stripe,jazzcash,payfast}/webhook` | CIDR allow-list | signature verified |
| GET | `/api/v1/payments/transactions` | `payments:read` | tenant ledger |
| POST | `/api/v1/admin/tenants` | `admin:all` | provisions schema + RLS |

## 5. Testing

```bash
pip install -r requirements-dev.txt
pytest -q
bandit -r app -c pyproject.toml -ll -ii
semgrep --config security/semgrep.yml app
pip-audit -r requirements.txt
```

## 6. Deployment

- **Compose** (`deploy/docker-compose.yml`): full local stack with hard caps,
  read-only root filesystems, seccomp, TLS for Postgres/Redis/Nginx.
- **Kubernetes** (`deploy/k8s/`): restricted Pod Security, non-root, read-only
  rootfs, dropped capabilities, default-deny NetworkPolicies, PDB, External
  Secrets for AWS Secrets Manager.

See [`SECURITY.md`](SECURITY.md) and [`docs/threat-model.md`](docs/threat-model.md).
