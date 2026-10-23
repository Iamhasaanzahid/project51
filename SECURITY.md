# Security Policy

## Reporting a vulnerability

Do **not** open a public issue. Email `security@aifabric.retail` with:

- affected component and version/commit,
- reproduction steps or proof of concept,
- impact assessment,
- your preferred contact.

We acknowledge within 48 hours and provide a remediation timeline within 5
business days. Please allow 90 days before public disclosure.

## Supported versions

| Version | Supported |
|---|---|
| 2.x | ✅ |
| 1.x | ❌ |

## Security invariants (must not regress)

1. **No client-supplied amounts.** Pricing is derived solely from the SKU
   catalogue in `app/services/payment_service.py`.
2. **Every tenant query is scoped.** Use `tenant_session()` and
   `enforce_tenant_ownership()`; never query tenant tables with a raw session.
3. **Uploads are hostile.** No image reaches the pipeline without magic-byte,
   decode, ClamAV and EXIF checks.
4. **Webhooks are authenticated twice.** Signature verification *and* source
   subnet allow-listing; amounts reconciled against the ledger.
5. **Secrets never enter git.** `.env` is ignored; CI runs Gitleaks.
6. **Errors never leak internals.** Production responses are generic and carry a
   request id only.
7. **Logs never contain secrets or PII.** `SensitiveDataRedactor` is mandatory.

## Dependency & container policy

- CI fails on HIGH/CRITICAL vulnerabilities (Trivy, pip-audit).
- Dependabot opens weekly upgrade PRs.
- Images are non-root, read-only, `cap_drop: ALL`, `no-new-privileges`, with a
  restrictive seccomp profile.
- CIS benchmarks: `docker-bench-security` and `kube-score` run in CI (see
  `security/benchmark/README.md`).
