# GPU rate-limit load test

The API puts a Redis-backed leaky bucket in front of `POST /api/v1/ai/render`
(default capacity 10, leak 0.5/s). These tools prove the limiter returns `429`
instead of queueing unbounded GPU work.

**Run against staging only.** The test intentionally floods the render endpoint.

## Prerequisites

- A tenant user with the `ai:render` scope.
- A bearer token:

  ```bash
  export TOKEN=$(curl -fsS -X POST "$BASE_URL/api/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"tenant_slug":"acme","email":"admin@acme.example","password":"..."}' \
    | jq -r .access_token)
  ```

- `BASE_URL` must be reachable from the load generator.

## k6

```bash
BASE_URL=https://staging.example.com TOKEN="$TOKEN" \
  RATE=25 DURATION=30s \
  k6 run loadtest/k6_render.js
```

Thresholds:

- `http_req_duration p95 < 2000 ms`
- `rate_limited count > 0` (the test fails if the limiter never engages)

The script prints queued / 429 / rejected counts.

## Python (no k6 install)

```bash
BASE_URL=https://staging.example.com TOKEN="$TOKEN" \
  python loadtest/verify_rate_limit.py --requests 60 --concurrency 20
```

Exit codes: `0` limiter engaged, `1` no 429, `2` auth/config error.

Uses a valid in-memory 64×64 PNG, so it exercises the real upload path
(magic bytes, ClamAV, EXIF scrub) without shipping a binary fixture.

## Interpreting results

| Observation | Meaning |
|---|---|
| Mostly `202`, a few `429` | Healthy: limiter protects the GPU |
| All `202` | Capacity too high for the burst or limiter not configured |
| All `429` | Capacity exhausted / previous test still leaking; wait or reset Redis key |
| `401`/`403` | Token missing, expired, or lacking `ai:render` |
| `415`/`422` | Upload rejected; check content type / image bytes |
| `503` | ClamAV unavailable with fail-closed enabled |

Do not reset production rate-limit keys. If you need a clean staging run, use a
dedicated staging tenant and wait for the bucket to leak.
