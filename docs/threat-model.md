# Threat Model — AI Fabric & Retail SaaS

Scope: public API, media ingestion, GPU render workers, payment gateways,
multi-tenant data stores, and the delivery pipeline.

Method: STRIDE per trust boundary, plus abuse cases for the AI pipeline.

## Trust boundaries

1. Internet → edge (Nginx/Ingress)
2. Edge → API
3. API → PostgreSQL / Redis / ClamAV
4. API → Celery → GPU worker
5. Platform → S3
6. Platform → payment processors (inbound webhooks, outbound API)
7. CI/CD → registry / cluster

## STRIDE analysis

| # | Threat | STRIDE | Attack | Mitigation |
|---|---|---|---|---|
| T1 | Malicious upload disguised as image | Tampering | Polyglot PHP/JS renamed `.jpg` | libmagic + magic-byte prefix + Pillow `verify()` |
| T2 | Metadata/GPS exfiltration | Info disclosure | EXIF/GPS preserved into renders | Pixel-only re-encode via Pillow |
| T3 | Malware distribution via fabric assets | Tampering | Encrypted payload in image | ClamAV stream scan + S3 quarantine promotion |
| T4 | GPU Denial of Service | DoS | Burst render requests | Atomic leaky bucket keyed by token hash |
| T5 | Decompression bomb | DoS | Huge dimensions | `MAX_IMAGE_PIXELS` + dimension limits |
| T6 | Price tampering | Tampering | Client sends `amount` | API has no amount field; server catalogue |
| T7 | Fake payment webhook | Spoofing | Forged success callback | HMAC-SHA256 + CIDR allow-list + ledger reconciliation |
| T8 | Replay webhook | Replay | Re-send valid callback | Idempotency keys + provider event ids |
| T9 | Double charge on retry | Tampering | Network drop, client retry | `Idempotency-Key` with payload fingerprint |
| T10 | Card data exposure | Info disclosure | Raw PAN on servers | Stripe hosted Checkout (SAQ A), no PAN handling |
| T11 | Cross-tenant IDOR | Elevation | Guess object id | Schema isolation + RLS + ownership check → 404 |
| T12 | Tenant schema injection | Tampering | `tenant_id` containing SQL | Regex validation + `%I` identifier quoting |
| T13 | Privilege escalation | Elevation | Retailer calls admin API | Scope-based RBAC, `admin:all` only |
| T14 | Token theft/replay | Spoofing | Long-lived JWT | 15-min access tokens, issuer/audience/type checks |
| T15 | Credential stuffing | Spoofing | Password spraying | Lockout + per-IP auth rate limit + metrics alerts |
| T16 | Secret leakage | Info disclosure | Hardcoded keys in repo | Env/Secrets Manager, Gitleaks, `.gitignore` |
| T17 | SQL injection | Tampering | Dynamic SQL | Bound params; validated identifiers only |
| T18 | Log injection / PII leakage | Info disclosure | Secrets in logs | JSON logs + redaction filter + path collapsing |
| T19 | Error-based recon | Info disclosure | Stack traces/schema names | Generic 500 + request id |
| T20 | Container escape | Elevation | Root container | Non-root, read-only rootfs, cap drop, seccomp, no privilege escalation |
| T21 | Lateral movement | Lateral | Compromised API pod | Default-deny NetworkPolicy, egress allow-list |
| T22 | Supply-chain compromise | Tampering | Malicious dependency | Pinned versions, pip-audit, Trivy, Dependabot, SBOM |
| T23 | S3 object enumeration | Info disclosure | Public bucket/URL guessing | Private bucket, 15-min presigned URLs, KMS |
| T24 | Prompt abuse / resource abuse | DoS | Huge prompts | Length cap, control-char strip, step cap |

## AI-specific abuse cases

- **Adversarial images** targeting OpenCV/PyTorch parsers: mitigated by strict
  format allow-list, Pillow decode, and running inference in an isolated
  container with no inbound network.
- **Model cache poisoning**: model artefacts are pulled from pinned repos into a
  dedicated PVC; workers have no write access outside `/cache` and `/tmp`.
- **Prompt injection into generation**: prompts are treated as untrusted data;
  they never influence authorisation or pricing. Output is stored as an image
  and served via short-lived URLs.

## Residual risks

| Risk | Notes | Owner action |
|---|---|---|
| Self-signed dev certificates | `scripts/gen-dev-certs.sh` is for local only | Use ACM/Let's Encrypt in prod |
| In-process rate-limit fail-open | Redis outage allows traffic | Alert on Redis; WAF is the outer guard |
| ClamAV signature lag | Zero-day malware may pass | Keep freshclam updated; quarantine prefix limits blast radius |
| GPU driver attack surface | NVIDIA runtime is privileged by nature | Dedicated node pool, no co-tenancy |
| Model licence/compliance | SDXL/IDM-VTON licences | Legal review before commercial launch |

## Verification

- Unit tests cover auth, tenancy, media validation, pricing, HMAC and
  idempotency (`tests/`).
- CI enforces Bandit, Semgrep, Gitleaks, Trivy (fs + image), pip-audit,
  kube-score and produces an SBOM.
- CIS benchmarking guidance: `security/benchmark/README.md`.
