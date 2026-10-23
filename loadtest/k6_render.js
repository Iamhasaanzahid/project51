/**
 * GPU rate-limit load test (k6).
 *
 * Fires a constant arrival rate at POST /api/v1/ai/render and proves that the
 * leaky-bucket shield starts returning 429 once the GPU budget is exhausted.
 *
 *   BASE_URL=https://staging.example.com \
 *   TOKEN="$(curl -s ... | jq -r .access_token)" \
 *   RATE=25 DURATION=30s k6 run loadtest/k6_render.js
 *
 * Never run this against production.
 */
import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";

const rateLimited = new Counter("rate_limited");
const queued = new Counter("render_queued");
const rejected = new Counter("render_rejected");

const BASE_URL = (__ENV.BASE_URL || "http://localhost:8000").replace(/\/+$/, "");
const TOKEN = __ENV.TOKEN || "";
const RATE = Number(__ENV.RATE || 20);
const DURATION = __ENV.DURATION || "30s";

if (!TOKEN) {
  throw new Error("TOKEN is required (bearer token with render:write scope)");
}

const image = open("./fixtures/fabric.png", "b");

export const options = {
  scenarios: {
    render_flood: {
      executor: "constant-arrival-rate",
      rate: RATE,
      timeUnit: "1s",
      duration: DURATION,
      preAllocatedVUs: Math.max(50, RATE * 2),
      maxVUs: Math.max(100, RATE * 4),
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<2000"],
    // The test is only meaningful if the limiter actually engaged.
    rate_limited: ["count>0"],
  },
};

export default function () {
  const response = http.post(
    `${BASE_URL}/api/v1/ai/render`,
    {
      prompt: "load test fabric, studio lighting",
      fabric_image: http.file(image, "fabric.png", "image/png"),
    },
    {
      headers: { Authorization: `Bearer ${TOKEN}` },
      tags: { endpoint: "ai_render" },
      timeout: "60s",
    },
  );

  const ok = check(response, {
    "status is 202 or 429": (r) => r.status === 202 || r.status === 429,
    "429 is JSON with detail": (r) =>
      r.status !== 429 || (r.headers["Content-Type"] || "").includes("application/json"),
  });

  if (response.status === 202) queued.add(1);
  else if (response.status === 429) rateLimited.add(1);
  else rejected.add(1);

  if (!ok) {
    console.error(`unexpected status=${response.status} body=${response.body}`);
  }
}

export function handleSummary(data) {
  return {
    stdout: JSON.stringify(
      {
        queued: data.metrics.render_queued ? data.metrics.render_queued.values.count : 0,
        rate_limited: data.metrics.rate_limited ? data.metrics.rate_limited.values.count : 0,
        rejected: data.metrics.render_rejected ? data.metrics.render_rejected.values.count : 0,
        p95_ms: data.metrics.http_req_duration
          ? data.metrics.http_req_duration.values["p(95)"]
          : null,
      },
      null,
      2,
    ),
  };
}
