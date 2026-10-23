#!/usr/bin/env python3
"""Credential-light GPU rate-limit verifier (no k6 required).

Sends a burst of render requests and asserts that the leaky-bucket limiter
returns at least one HTTP 429. Intended for staging.

    BASE_URL=https://staging.example.com TOKEN=... python loadtest/verify_rate_limit.py

Exit codes: 0 = limiter engaged, 1 = no 429 observed, 2 = auth/config error.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import os
import sys

import httpx

# 64x64 PNG (valid signature + decodable by Pillow).
PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAUUlEQVR42u3PQQkAMAzAwAwqevKn"
    "Yo/ChRi4U3dq89PqAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    "AP73AKB/A24eMiziAAAAAElFTkSuQmCC"
)


async def run(base_url: str, token: str, requests: int, concurrency: int) -> int:
    url = f"{base_url.rstrip('/')}/api/v1/ai/render"
    headers = {"Authorization": f"Bearer {token}"}
    counts: dict[int, int] = {}
    semaphore = asyncio.Semaphore(concurrency)

    async with httpx.AsyncClient(timeout=60) as client:
        async def one() -> None:
            async with semaphore:
                try:
                    response = await client.post(
                        url,
                        headers=headers,
                        files={"fabric_image": ("fabric.png", PNG_BYTES, "image/png")},
                        data={"prompt": "rate limit verification"},
                    )
                    counts[response.status_code] = counts.get(response.status_code, 0) + 1
                except httpx.HTTPError as exc:
                    counts[-1] = counts.get(-1, 0) + 1
                    print(f"transport error: {exc}", file=sys.stderr)

        await asyncio.gather(*(one() for _ in range(requests)))

    print("status counts:", dict(sorted(counts.items())))
    if counts.get(401) or counts.get(403):
        print("ERROR: token rejected; supply a token with render:write scope.", file=sys.stderr)
        return 2
    if counts.get(429, 0) == 0:
        print("FAIL: no 429 observed — check RENDER_BUCKET_CAPACITY / RENDER_LEAK_RATE_PER_SEC.", file=sys.stderr)
        return 1
    print(f"PASS: {counts[429]} request(s) were rate-limited.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=os.getenv("BASE_URL", "http://localhost:8000"))
    parser.add_argument("--token", default=os.getenv("TOKEN", ""))
    parser.add_argument("--requests", type=int, default=int(os.getenv("REQUESTS", "60")))
    parser.add_argument("--concurrency", type=int, default=int(os.getenv("CONCURRENCY", "20")))
    args = parser.parse_args()

    if not args.token:
        print("ERROR: TOKEN (or --token) is required.", file=sys.stderr)
        return 2
    return asyncio.run(run(args.base_url, args.token, args.requests, args.concurrency))


if __name__ == "__main__":
    raise SystemExit(main())
