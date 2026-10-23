# Production deployment runbook

This runbook deploys the hardened API, GPU worker, and Streamlit UI. It assumes
Kubernetes for compute and managed PostgreSQL/Redis/S3 for data, but the same
steps apply to ECS or a VM-based Compose deployment.

> **Streamlit Community Cloud is not a backend host.** It can run the UI only.
> See [`streamlit-deploy.md`](streamlit-deploy.md).

---

## 0. Prerequisites

| Dependency | Requirement |
|---|---|
| Kubernetes | 1.28+, restricted Pod Security, ingress-nginx, cert-manager (or managed certs) |
| PostgreSQL | 16, TLS 1.3, automated backups, PITR, `pgcrypto` |
| Redis | 7.x, TLS, `requirepass`, no persistence for idempotency keys |
| S3 | SSE-KMS, versioning, block public access, lifecycle for quarantine |
| KMS | Customer-managed key for S3 + field encryption |
| AWS Secrets Manager | Secrets `aifabric/prod/secrets`, `aifabric/prod/migrate` |
| GPU | NVIDIA node pool with device plugin; ≥16 GB VRAM per worker |
| Payments | Stripe live keys + webhook secret; JazzCash/PayFast merchant credentials |
| DNS/TLS | `api.<domain>`, `app.<domain>`; TLS certificate covering both |
| Container registry | GHCR packages produced by `.github/workflows/publish.yml` |

The platform does not create Postgres/Redis/ClamAV StatefulSets in
`deploy/k8s/`. Either:

- point the ConfigMap at managed endpoints (`POSTGRES_HOST`, `REDIS_HOST`,
  `CLAMAV_HOST`), or
- deploy in-cluster services with pod labels `app: postgres`, `app: redis`,
  `app: clamav`, `tier: data` so the NetworkPolicies match.

---

## 1. Roles and secrets

Two database roles are mandatory:

| Role | Used by | Privileges |
|---|---|---|
| `aifabric_app` | API, worker | LOGIN, NOINHERIT, USAGE on schemas, SELECT/INSERT/UPDATE on tenant tables, EXECUTE on `provision_tenant`; **no** DDL, no RLS bypass |
| `aifabric_admin` | migration Job only | schema owner; creates public/tenant objects and policies |

Never mount `aifabric-admin` credentials into the API or worker.

### `aifabric/prod/secrets` (API/worker)

```json
{
  "SECRET_KEY": "<openssl rand -hex 32>",
  "JWT_ALGORITHM": "HS256",
  "POSTGRES_USER": "aifabric_app",
  "POSTGRES_PASSWORD": "<app-role password>",
  "REDIS_PASSWORD": "<redis password>",
  "AWS_ACCESS_KEY_ID": "<optional; prefer IRSA>",
  "AWS_SECRET_ACCESS_KEY": "<optional; prefer IRSA>",
  "AWS_S3_BUCKET_NAME": "ai-fabric-secure-storage-prod",
  "AWS_S3_KMS_KEY_ID": "<kms key id>",
  "FIELD_ENCRYPTION_KEY": "<base64 32 bytes>",
  "STRIPE_SECRET_KEY": "sk_live_...",
  "STRIPE_WEBHOOK_SECRET": "whsec_...",
  "STRIPE_PRICE_RENDER_PACK": "price_...",
  "STRIPE_PRICE_SAAS_MONTHLY": "price_...",
  "STRIPE_PRICE_SAAS_ANNUAL": "price_...",
  "JAZZCASH_MERCHANT_ID": "...",
  "JAZZCASH_PASSWORD": "...",
  "JAZZCASH_INTEGER_KEY": "...",
  "JAZZCASH_WEBHOOK_SECRET": "...",
  "PAYFAST_MERCHANT_ID": "...",
  "PAYFAST_SECURED_KEY": "...",
  "PAYFAST_WEBHOOK_SECRET": "..."
}
```

### `aifabric/prod/migrate` (migration Job only)

```json
{
  "POSTGRES_USER": "aifabric_admin",
  "POSTGRES_PASSWORD": "<admin-role password>"
}
```

`ExternalSecret/aifabric-migrate-secrets` projects this into the namespace.
The Job uses `envFrom` with the ConfigMap first and the admin Secret second, so
the admin user/password override the app-role values.

---

## 2. Provision the database

1. Create the database and the two roles. Example (managed PostgreSQL):

   ```sql
   CREATE ROLE aifabric_app LOGIN PASSWORD '<app-password>' NOINHERIT;
   CREATE ROLE aifabric_admin LOGIN PASSWORD '<admin-password>' NOINHERIT;
   GRANT aifabric_admin TO <db-owner>;
   ALTER DATABASE aifabric_prod OWNER TO aifabric_admin;
   ```

2. Run the bootstrap file as the owner/admin:

   ```bash
   psql "host=<host> dbname=aifabric_prod user=aifabric_admin sslmode=verify-full" \
     -v ON_ERROR_STOP=1 -f deploy/postgres/10-init.sql
   ```

   This enables `pgcrypto` (and `pg_stat_statements` when preloaded) and sets
   default privileges. It creates **no** application tables.

3. The migration Job applies the public schema (`alembic upgrade head`) and the
   tenant migration runner. Do not create tables manually.

### Local Docker

`deploy/postgres/00-app-role.sh` creates `aifabric_app` from
`POSTGRES_APP_PASSWORD`; `10-init.sql` runs next. The `migrate` service then
applies Alembic and tenant SQL before the API starts.

---

## 3. Build and publish images

Push to `main` (or run the workflow manually) to trigger
`.github/workflows/publish.yml`. It:

1. builds each image,
2. scans it with Trivy (fails on HIGH/CRITICAL),
3. pushes the scanned image to GHCR.

Images:

```
ghcr.io/iamhasaanzahid/project51-api:<sha|tag|latest>
ghcr.io/iamhasaanzahid/project51-ui:<sha|tag|latest>
ghcr.io/iamhasaanzahid/project51-worker:<sha|tag|latest>   # tags/manual only
```

Pin Deployments to an immutable `sha-*` or release tag, not `latest`.

If GHCR packages are private, create an image pull secret and reference it in
the ServiceAccounts. To make them public: package settings → visibility.

---

## 4. Apply Kubernetes resources

```bash
export KUBE_CONTEXT=prod-cluster
kubectl config use-context "$KUBE_CONTEXT"

kubectl apply -f deploy/k8s/00-namespace.yaml
kubectl apply -f deploy/k8s/40-config.yaml      # ConfigMap + ExternalSecrets
kubectl -n aifabric get externalsecret           # wait for SecretSynced=True

# TLS CA bundle used for Postgres/Redis verification
kubectl -n aifabric create secret generic aifabric-tls-ca \
  --from-file=ca.crt=./certs/ca.crt --dry-run=client -o yaml | kubectl apply -f -

# Migrations FIRST (delete the previous completed Job so it re-runs)
kubectl -n aifabric delete job aifabric-migrate --ignore-not-found
kubectl apply -f deploy/k8s/15-migrate-job.yaml
kubectl -n aifabric wait --for=condition=complete job/aifabric-migrate --timeout=10m

# Workloads
kubectl apply -f deploy/k8s/10-api.yaml
kubectl apply -f deploy/k8s/20-worker.yaml
kubectl apply -f deploy/k8s/25-ui.yaml
kubectl apply -f deploy/k8s/30-networkpolicy.yaml
kubectl apply -f deploy/k8s/50-ingress.yaml
kubectl apply -f deploy/k8s/51-ingress-ui.yaml
```

Verify:

```bash
kubectl -n aifabric rollout status deploy/api
kubectl -n aifabric rollout status deploy/gpu-worker
kubectl -n aifabric rollout status deploy/ui
kubectl -n aifabric get pods -o wide
```

### Bootstrap the first tenant/admin

Run a one-off pod with the admin secret (never in the long-running API):

```bash
kubectl -n aifabric run aifabric-seed --rm -it --restart=Never \
  --image=ghcr.io/iamhasaanzahid/project51-api:2.0.0 \
  --overrides='
  {
    "spec": {
      "containers": [{
        "name": "seed",
        "image": "ghcr.io/iamhasaanzahid/project51-api:2.0.0",
        "command": ["python","scripts/bootstrap_admin.py"],
        "args": ["--slug","acme","--name","Acme Retail","--email","admin@acme.example"],
        "envFrom": [
          {"configMapRef":{"name":"aifabric-config"}},
          {"secretRef":{"name":"aifabric-migrate-secrets"}},
          {"secretRef":{"name":"aifabric-api-secrets"}}
        ],
        "env": [{"name":"ADMIN_PASSWORD","value":"<strong-password>"}],
        "securityContext": {"runAsNonRoot":true,"runAsUser":10001,"readOnlyRootFilesystem":true},
        "volumeMounts": [{"name":"tls","mountPath":"/etc/aifabric/tls","readOnly":true}]
      }],
      "volumes": [{"name":"tls","secret":{"secretName":"aifabric-tls-ca"}}]
    }
  }'
```

> Passing the password on the command line exposes it in shell history and
> process listings. Prefer a short-lived Secret + `valueFrom`.

---

## 5. Payment webhooks

| Provider | Webhook URL |
|---|---|
| Stripe | `https://api.<domain>/api/v1/payments/stripe/webhook` |
| JazzCash | `https://api.<domain>/api/v1/payments/jazzcash/webhook` |
| PayFast | `https://api.<domain>/api/v1/payments/payfast/webhook` |

- Set the Stripe webhook secret to `STRIPE_WEBHOOK_SECRET`.
- Set JazzCash/PayFast shared secrets to match the gateway configuration.
- Restrict source CIDRs in `JAZZCASH_ALLOWED_IPS`, `PAYFAST_ALLOWED_IPS`,
  `STRIPE_ALLOWED_IPS` — the middleware rejects requests outside them.
- The API reconciles the processor amount against the server-side SKU price; a
  mismatch is rejected and audited.
- Configure Stripe to send `checkout.session.completed` and
  `checkout.session.async_payment_succeeded`.

DNS/TLS:

- `api.<domain>` → ingress; TLS 1.3 only, HSTS preload.
- `app.<domain>` → Streamlit ingress.
- Add both origins to `ALLOWED_ORIGINS`, plus the Streamlit Cloud URL if used.

---

## 6. Streamlit UI

### Community Cloud (UI only)

Follow [`streamlit-deploy.md`](streamlit-deploy.md). Secrets:

```toml
API_BASE_URL = "https://api.<domain>"
DEMO_MODE = "false"
APP_SUCCESS_URL = "https://app.<domain>/?checkout=success"
APP_CANCEL_URL = "https://app.<domain>/?checkout=cancel"
```

Add `https://<app>.streamlit.app` (or `https://app.<domain>`) to
`ALLOWED_ORIGINS` and restart the API.

### In-cluster

`deploy/k8s/25-ui.yaml` runs the UI non-root with a read-only rootfs and calls
`http://api:8000` server-side. For zero-trust clusters, put both behind a
service mesh and enable mTLS for this hop.

---

## 7. Observability

```bash
kubectl -n aifabric port-forward svc/prometheus 9090:9090
kubectl -n aifabric port-forward svc/grafana 3000:3000
```

- Alerts: `observability/alert-rules.yml` (auth failures, 429 spikes, GPU
  queue depth, webhook signature failures, DB/Redis availability).
- Logs: `observability/loki-config.yml` + `promtail-config.yml`; the app
  redacts passwords, tokens, PANs, and CNICs before emit.
- Dashboards: `observability/grafana/`.
- Verify `/metrics` is scraped and `/readyz` gates traffic.

---

## 8. Smoke tests

```bash
curl -fsS https://api.<domain>/healthz
curl -fsS https://api.<domain>/readyz

TOKEN=$(curl -fsS -X POST https://api.<domain>/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"tenant_slug":"acme","email":"admin@acme.example","password":"..."}' \
  | jq -r .access_token)

# Rate limiter (expect at least one 429)
BASE_URL=https://api.<domain> TOKEN="$TOKEN" \
  python loadtest/verify_rate_limit.py

# Tenant isolation (unit + integration suites)
python -m pytest -q -m integration
```

Also verify:

- An upload with a spoofed extension is rejected with 415.
- A cross-tenant job ID returns 404.
- A checkout with a client-supplied amount is rejected (the schema has no
  amount field).
- A webhook with a bad signature is rejected.
- `/docs` and `/openapi.json` return 404 in production.

---

## 9. Rollback

1. `kubectl -n aifabric rollout undo deploy/api` (and `deploy/ui`,
   `deploy/gpu-worker`).
2. Pin the previous immutable `sha-*` image tag if the rollback must survive
   future rollouts.
3. **Do not** blindly run `alembic downgrade`. The baseline downgrade drops the
   tenant registry and audit table. Restore from PITR instead, or write a
   forward-only corrective migration.
4. Revoke any credential that may have been exposed during the incident.
5. Rotate `SECRET_KEY` only with a planned token-invalidation window: all
   access/refresh tokens become invalid immediately.

---

## 10. Security checklist

- [ ] `aifabric_app` is not a superuser and cannot create schemas/roles.
- [ ] `POSTGRES_SSL_MODE=verify-full` with the correct CA; TLS 1.3 only.
- [ ] Redis requires TLS + AUTH; no public endpoint.
- [ ] S3 Block Public Access; SSE-KMS; presigned URLs ≤15 minutes.
- [ ] `SECRET_KEY`, `FIELD_ENCRYPTION_KEY`, and gateway secrets only in Secrets
      Manager — never in git, images, or Streamlit public secrets.
- [ ] `ALLOWED_HOSTS` and `ALLOWED_ORIGINS` are explicit; no `*`.
- [ ] `/docs`, `/redoc`, `/openapi.json` disabled in production.
- [ ] Images pinned by digest/tag and scanned; no `latest` in production.
- [ ] Migration Job ran and `alembic_version = 0001_public_schema`.
- [ ] `scripts/migrate_tenants.py` applied to every active tenant schema.
- [ ] GPU worker has a read-only rootfs, dropped caps, and a model-cache PVC.
- [ ] Backups + PITR tested; audit table retention defined.
- [ ] Alerts routed to on-call; webhook failures and 401 spikes are paging.
- [ ] Exposed PATs revoked; GitHub Actions uses short-lived `GITHUB_TOKEN`.
