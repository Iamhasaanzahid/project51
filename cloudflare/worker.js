/**
 * MHZALY AI proxy — Cloudflare Worker (free plan: 100k requests/day).
 *
 * Why: keeps API keys on the server (never in the browser) and gives one
 * stable endpoint that rotates across many free-tier providers.
 *
 * Deploy:
 *   1. dash.cloudflare.com → Workers & Pages → Create → Worker
 *   2. Paste this file, Deploy
 *   3. Settings → Variables → add secrets (comma-separated, any subset):
 *        GEMINI_KEYS, GROQ_KEYS, OPENROUTER_KEYS, CEREBRAS_KEYS,
 *        MISTRAL_KEYS, TOGETHER_KEYS, HUGGINGFACE_KEYS
 *   4. Copy the worker URL (https://<name>.<account>.workers.dev)
 *      and paste it into the site: AI settings → Backend URL
 */

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Only our own sites may call this API from a browser. Anything else gets a
// 403 before it can burn the shared free quota.
const ALLOWED_ORIGIN = /^(?:https:\/\/(?:[a-z0-9-]+\.)*(?:mhzaly-fabric\.surge\.sh|mhzaly\.surge\.sh|mhzaly\.pages\.dev)|http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?)$/i;

// CORS is built per request and never uses "*": the allowed origin is echoed
// back exactly, so no other site can read a response even if it can send one.
function corsHeaders(origin) {
  const h = {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  };
  if (origin && ALLOWED_ORIGIN.test(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

// Hard limits so a single request can never exhaust memory or quota.
const MAX_BODY_BYTES = 8 * 1024 * 1024;      // 8 MB request body
const MAX_IMAGE_B64 = 5_600_000;              // ~4 MB binary image, base64
const MAX_PROMPT = 1500;

// Decode base64 safely: reject anything that is not plain base64 and never
// throw on a hostile payload.
function decodeB64(input) {
  const clean = String(input || "").replace(/\s+/g, "");
  if (!clean || clean.length > MAX_IMAGE_B64) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) return null;
  try { return Uint8Array.from(atob(clean), (c) => c.charCodeAt(0)); }
  catch { return null; }
}

// Per-IP rate limiting. A Cloudflare rate-limit binding is used when it is
// configured; an in-memory bucket is the fallback so the endpoint is never
// unprotected.
const buckets = new Map();
function localBucket(ip, max, windowMs) {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b || now > b.reset) { b = { count: 0, reset: now + windowMs }; buckets.set(ip, b); }
  b.count++;
  if (buckets.size > 4096) {
    for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
  }
  if (b.count > max) return { ok: false, retry: Math.max(1, Math.ceil((b.reset - now) / 1000)) };
  return { ok: true, retry: 0 };
}

async function rateLimit(env, request, max, windowSec) {
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "anon";
  if (env && env.AI_LIMIT && typeof env.AI_LIMIT.limit === "function") {
    try {
      const res = await env.AI_LIMIT.limit({ key: ip });
      if (res && res.success === false) return { ok: false, retry: windowSec };
    } catch {}
  }
  return localBucket(ip, max, windowSec * 1000);
}

const SYSTEM = `You are an AR asset planner. Reply with JSON only:
{"assetType":"3d-model","category":"kurta|shirt|suit|dress|saree|shalwar kameez|curtains|sofa|bag|shoes|3d asset",
"placement":"body|window|floor|wall|table","style":"photoreal","description":"one vivid sentence describing the item, colour, fabric and pattern",
"targetUnits":"meters"}`;

const PROVIDERS = {
  gemini: { kind: "gemini", base: "https://generativelanguage.googleapis.com/v1beta/models", model: "gemini-flash-latest" },
  groq: { kind: "openai", base: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  openrouter: { kind: "openai", base: "https://openrouter.ai/api/v1", model: "meta-llama/llama-3.1-8b-instruct:free" },
  cerebras: { kind: "openai", base: "https://api.cerebras.ai/v1", model: "llama3.1-8b" },
  mistral: { kind: "openai", base: "https://api.mistral.ai/v1", model: "mistral-small-latest" },
  together: { kind: "openai", base: "https://api.together.xyz/v1", model: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo" },
  huggingface: { kind: "openai", base: "https://api-inference.huggingface.co/v1", model: "meta-llama/Llama-3.1-8B-Instruct" },
};

function json(body, status = 200, origin = "") {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function pool(env) {
  const out = [];
  for (const name of Object.keys(PROVIDERS)) {
    const raw = env[name.toUpperCase() + "_KEYS"] || "";
    for (const key of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
      out.push({ provider: name, key });
    }
  }
  return out;
}

async function callOne(provider, key, prompt) {
  const cfg = PROVIDERS[provider];
  if (cfg.kind === "gemini") {
    const url = `${cfg.base}/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(25000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.8 },
      }),
    });
    if (!res.ok) throw new Error(provider + " " + res.status);
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }
  const res = await fetch(`${cfg.base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(25000),
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }],
      temperature: 0.8,
    }),
  });
  if (!res.ok) throw new Error(provider + " " + res.status);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

function parsePlan(text) {
  try { return JSON.parse(text); } catch {}
  const m = String(text || "").match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return { assetType: "3d-model", category: "3d asset", placement: "floor", style: "photoreal", description: String(text || "").slice(0, 240), targetUnits: "meters" };
}

async function freePlan(prompt) {
  const res = await fetch("https://text.pollinations.ai/openai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(25000),
    body: JSON.stringify({
      model: "openai",
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error("free " + res.status);
  const data = await res.json();
  return parsePlan(data?.choices?.[0]?.message?.content || "");
}

async function planFor(prompt) {
  for (const { provider, key } of pool({ ...globalThis.__env })) {
    try {
      const plan = parsePlan(await callOne(provider, key, prompt));
      if (plan && plan.description) return plan;
    } catch {}
  }
  try { return await freePlan(prompt); } catch {}
  return parsePlan("");
}

const SPACES = [
  { id: "flux-schnell", base: "https://black-forest-labs-flux-1-schnell.hf.space", ep: "/infer", args: (p, s) => [p, s, true, 1024, 1536, 4] },
  { id: "flux-merged", base: "https://multimodalart-flux-1-merged.hf.space", ep: "/infer", args: (p, s) => [p, s, true, 1024, 1536, 3.5, 20] },
  { id: "flux-dev", base: "https://black-forest-labs-flux-1-dev.hf.space", ep: "/infer", args: (p, s) => [p, s, true, 1024, 1536, 3.5, 25] },
  { id: "sd35", base: "https://stabilityai-stable-diffusion-3-5-large.hf.space", ep: "/infer", args: (p, s) => [p, "blurry, low quality, text, watermark", s, true, 1024, 1536, 4.5, 24] },
];

// ---- FLUX.2 [dev] multipart helper ------------------------------------------
// The AI binding only accepts multipart via a raw stream + explicit boundary.
function mhMultipart(fields, files) {
  const enc = new TextEncoder();
  const boundary = "----mhzaly" + Math.random().toString(16).slice(2);
  const parts = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  for (const [k, f] of Object.entries(files || {})) {
    parts.push(enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"; filename="${f.name}"\r\nContent-Type: ${f.type}\r\n\r\n`));
    parts.push(f.bytes);
    parts.push(enc.encode("\r\n"));
  }
  parts.push(enc.encode(`--${boundary}--\r\n`));
  const total = parts.reduce((a, q) => a + q.length, 0);
  const bytes = new Uint8Array(total);
  let off = 0;
  for (const q of parts) { bytes.set(q, off); off += q.length; }
  return { bytes, contentType: `multipart/form-data; boundary=${boundary}` };
}

// ---- free image core -------------------------------------------------------
// Strategy: free cache -> Workers AI (while the free daily quota lasts) ->
// Pollinations (free, no daily cap). Everything is keyless.
let aiDeadUntil = 0;
const AI_COOLDOWN = 15 * 60 * 1000;

function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

function noteAiError(e) {
  const msg = String((e && e.message) || e);
  if (/4006|used up your daily|neurons/i.test(msg)) aiDeadUntil = Date.now() + AI_COOLDOWN;
}

async function flux2Image(env, model, { prompt, width, height, steps, refBytes }) {
  const mp = mhMultipart(
    { prompt, width: String(width), height: String(height), steps: String(steps) },
    refBytes ? { input_image_0: { name: "ref.jpg", type: "image/jpeg", bytes: refBytes } } : {}
  );
  const out = await env.AI.run(model, {
    multipart: { body: new Blob([mp.bytes]).stream(), contentType: mp.contentType },
  });
  const b64 = out && (out.image || (Array.isArray(out.images) ? out.images[0] : ""));
  if (!b64) throw new Error("no image");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// Pollinations: free + keyless. Soft limit is 1 image / 45s per IP, so we
// honour the retry-after the service tells us instead of failing.
async function pollinations(prompt, w, h) {
  // Free tier: 1 image / 45s per IP, shared across models. `flux` gives the
  // best quality per second; `sana` is the last-resort fallback.
  for (const model of ["flux", "sana"]) {
    const seed = Math.floor(Math.random() * 1e9);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&nologo=true&model=${model}&referrer=mhzaly-fabric.surge.sh&seed=${seed}`;
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "image/*" } });
      const type = r.headers.get("content-type") || "";
      if (r.ok && type.startsWith("image/")) {
        const b = new Uint8Array(await r.arrayBuffer());
        if (b.length > 3000) return { bytes: b, model };
      }
      if (r.status === 402 || r.status === 429) {
        const txt = await r.text();
        const m = /retry after (\d+)\s*s/i.exec(txt);
        return { bytes: null, retryAfter: m ? parseInt(m[1], 10) : 45 };
      }
    } catch {}
  }
  return { bytes: null, retryAfter: 45 };
}

async function generateImageCore(env, { prompt, refBytes, w, h, steps, quality }) {
  let bytes = null;
  let model = "";
  const log = [];

  const wantBest = String(quality || "fast") === "best";
  if (env && env.AI && Date.now() > aiDeadUntil) {
    if (wantBest) {
      try {
        bytes = await flux2Image(env, "@cf/black-forest-labs/flux-2-klein-4b", { prompt, width: w, height: h, steps, refBytes });
        model = "flux-2-klein-4b";
      } catch (e) { noteAiError(e); log.push("klein:" + String((e && e.message) || e).slice(0, 80)); }
    }
    if (!bytes) {
      try {
        // schnell only accepts prompt/steps — no size control.
        const out = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
          prompt,
          steps: wantBest ? 8 : 6,
        });
        if (out && out.image) {
          const b = Uint8Array.from(atob(out.image), (c) => c.charCodeAt(0));
          if (b.length > 3000) { bytes = b; model = "flux-1-schnell"; }
        }
      } catch (e) { noteAiError(e); log.push("schnell:" + String((e && e.message) || e).slice(0, 80)); }
    }
  }

  let retryAfter = 0;
  if (!bytes) {
    const p = await pollinations(prompt, w, h);
    if (p.bytes) { bytes = p.bytes; model = "pollinations"; }
    else retryAfter = p.retryAfter || 45;
  }

  if (!bytes) return { bytes: null, model: "", log, retryAfter };

  // The response is built by the caller so the CORS and security headers are
  // always the ones for this request. No provider internals are exposed.
  return { bytes, model, log, retryAfter: 0 };
}

export default {
  async fetch(request, env) {
    globalThis.__env = env;
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);
    const denied = () =>
      new Response(JSON.stringify({ error: "not allowed" }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      });

    // Only our own pages may use the API. A request with no Origin is a
    // non-browser client: it passes the origin check but is rate limited
    // exactly like a browser, so it can never burn the shared quota.
    if (origin && !ALLOWED_ORIGIN.test(origin)) return denied();

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === "/health") {
      // Deliberately says nothing about keys, providers or quota.
      return json({ ok: true }, 200, origin);
    }

    const isApi = url.pathname.startsWith("/api/");

    // Every API call must come from a browser page on our own domain. This
    // blocks third-party sites from triggering renders through <img>, <form>
    // or a background request, because those carry no Origin header.
    if (isApi && !origin) return denied();

    // Rate limits, per IP, per route.
    if (isApi) {
      const ip = request.headers.get("CF-Connecting-IP") || "anon";
      const cap = url.pathname === "/api/image" ? 15 : 30;
      const limit = await rateLimit(env, request, cap, 60);
      if (!limit.ok) {
        return new Response(
          JSON.stringify({ error: "too many requests", retryAfter: limit.retry }),
          { status: 429, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Retry-After": String(limit.retry) } }
        );
      }
      void ip;
    }

    // Body limits: nothing big is ever read into memory.
    const declared = Number(request.headers.get("content-length") || 0);
    if (declared > MAX_BODY_BYTES) return json({ error: "payload too large" }, 413, origin);
    const ctype = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (request.method === "POST" && ctype && ctype !== "application/json") {
      return json({ error: "content type must be application/json" }, 415, origin);
    }

    const readJson = async () => {
      try { return await request.json(); } catch { return null; }
    };

    if (url.pathname === "/api/generate" && request.method === "POST") {
      const body = await readJson();
      if (!body) return json({ error: "invalid json" }, 400, origin);
      const prompt = String(body.prompt || "").slice(0, MAX_PROMPT);
      if (!prompt) return json({ status: "failed", error: "prompt required" }, 400, origin);
      const plan = await planFor(prompt);
      return json({ status: "ready", plan }, 200, origin);
    }

    // Vision: read the uploaded garment so the generated model wears the SAME design.
    if (url.pathname === "/api/vision" && request.method === "POST") {
      const body = await readJson();
      if (!body) return json({ error: "invalid json" }, 400, origin);
      const b64 = String(body.image || "").replace(/^data:image\/[a-z+]+;base64,/i, "");
      if (!b64) return json({ error: "image required" }, 400, origin);
      if (b64.length > MAX_IMAGE_B64) return json({ error: "image too large" }, 413, origin);
      const bin = decodeB64(b64);
      if (!bin) return json({ error: "bad image" }, 400, origin);
      if (bin.length > 4_000_000) return json({ error: "image too large" }, 413, origin);
      if (!env || !env.AI) return json({ ok: false, error: "vision unavailable" }, 502, origin);
      const ask = "You are a fashion buyer. Describe ONLY the garment in this photo with precision: type (kurta, kurti, saree, shirt, suit, dress, jacket...), exact colours, fabric, print or pattern, embroidery, borders, sleeves and neckline. One dense sentence. No preamble, no mention of the person.";
      const forced = String(body.model || "");
      const dataUrl = `data:image/jpeg;base64,${b64}`;

      // Llama 3.2 Vision uses the chat/messages shape.
      if (!forced || forced.includes("llama-3.2")) {
        try {
          const out = await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", {
            messages: [{
              role: "user",
              content: [
                { type: "image_url", image_url: { url: dataUrl } },
                { type: "text", text: ask },
              ],
            }],
            max_tokens: 220,
          });
          const text = String(out.response || out.description || "").trim();
          if (text.length > 8) return json({ ok: true, model: "llama-3.2-11b-vision", description: text }, 200, origin);
        } catch {}
      }

      for (const m of [forced, "@cf/llava-hf/llava-1.5-7b-hf", "@cf/unum/uform-gen2-qwen-500m"].filter(Boolean)) {
        try {
          const out = await env.AI.run(m, { image: [...bin], prompt: ask, max_tokens: 220 });
          const text = String(out.description || out.response || "").trim();
          if (text.length > 8) return json({ ok: true, model: m, description: text }, 200, origin);
        } catch {}
      }
      return json({ ok: false, error: "vision failed" }, 502, origin);
    }

    // FLUX.2 [dev] - best quality + optional reference image (true "same design" try-on).
    if (url.pathname === "/api/image" && request.method === "POST") {
      const body = await readJson();
      if (!body) return json({ error: "invalid json" }, 400, origin);
      const prompt = String(body.prompt || "").slice(0, MAX_PROMPT);
      if (!prompt) return json({ error: "prompt required" }, 400, origin);
      const refRaw = String(body.ref || "");
      if (refRaw.length > MAX_IMAGE_B64) return json({ error: "reference image too large" }, 413, origin);
      const refBytes = refRaw ? decodeB64(refRaw.replace(/^data:[^;]+;base64,/i, "")) : null;
      if (refRaw && !refBytes) return json({ error: "bad reference image" }, 400, origin);
      const w = Math.min(1920, Math.max(256, parseInt(body.width || "1024", 10) || 1024));
      const h = Math.min(1920, Math.max(256, parseInt(body.height || "1536", 10) || 1536));
      const steps = Math.min(30, Math.max(4, parseInt(body.steps || "18", 10) || 18));
      const out = await generateImageCore(env, { prompt, refBytes, w, h, steps, quality: body.quality });
      if (out.bytes) {
        const res = new Response(out.bytes, {
          headers: {
            ...cors,
            "Content-Type": "image/jpeg",
            "Cache-Control": "public, max-age=86400",
            "X-Content-Type-Options": "nosniff",
          },
        });
        return res;
      }
      // No provider internals are returned to the caller.
      return json({ error: "image unavailable", retryAfter: out.retryAfter }, out.retryAfter ? 429 : 502, origin);
    }

    if (url.pathname === "/api/image" && request.method === "GET") {
      const prompt = String(url.searchParams.get("prompt") || "").slice(0, MAX_PROMPT);
      if (!prompt) return json({ error: "prompt required" }, 400, origin);
      const out = await generateImageCore(env, { prompt, refBytes: null, w: 1024, h: 1536, steps: 6 });
      if (out.bytes) {
        return new Response(out.bytes, {
          headers: { ...cors, "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" },
        });
      }
      return json({ error: "image unavailable", retryAfter: out.retryAfter }, out.retryAfter ? 429 : 502, origin);
    }

    return json({ error: "not found" }, 404, origin);
  },
};
