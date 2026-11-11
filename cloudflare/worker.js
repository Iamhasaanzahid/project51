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

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Expose-Headers": "X-Model,X-AI-Log,Retry-After",
};

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

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
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

async function hfImage(space, prompt) {
  const seed = Math.floor(Math.random() * 1000000);
  const call = `${space.base}/gradio_api/call${space.ep}`;
  const res = await fetch(call, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA, "Accept": "application/json" },
    body: JSON.stringify({ data: space.args(prompt, seed) }),
  });
  if (!res.ok) throw new Error(space.id + " http " + res.status + " " + (await res.text()).slice(0, 100));
  const { event_id } = await res.json();
  if (!event_id) throw new Error("no event");
  const sse = await fetch(`${call}/${event_id}`, { headers: { "User-Agent": UA, "Accept": "text/event-stream" } });
  const text = await sse.text();
  let payload = null;
  for (const line of text.split("\n")) {
    if (!line.startsWith("data:")) continue;
    try { const arr = JSON.parse(line.slice(5)); if (Array.isArray(arr)) payload = arr; } catch {}
  }
  const file = payload && payload.find((x) => x && x.url);
  if (!file) throw new Error("no file");
  const img = await fetch(file.url, { headers: { "User-Agent": UA } });
  if (!img.ok) throw new Error("file " + img.status);
  return new Response(img.body, { headers: { ...CORS, "Content-Type": "image/webp", "Cache-Control": "public, max-age=86400" } });
}

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
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&nologo=true&model=${model}&referrer=mhzaly.pages.dev&seed=${seed}`;
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

  if (!bytes) return { res: null, log, retryAfter };

  return {
    res: new Response(bytes, {
      headers: { ...CORS, "Content-Type": "image/jpeg", "X-Model": model, "X-AI-Log": log.join("|").slice(0, 300), "Cache-Control": "public, max-age=86400" },
    }),
    log,
    retryAfter: 0,
  };
}

export default {
  async fetch(request, env) {
    globalThis.__env = env;
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    if (url.pathname === "/health") {
      return json({ ok: true, keys: pool(env).length, providers: Object.keys(PROVIDERS) });
    }

    if (url.pathname === "/api/generate" && request.method === "POST") {
      let body = {};
      try { body = await request.json(); } catch {}
      const prompt = String(body.prompt || "").slice(0, 1200);
      if (!prompt) return json({ status: "failed", error: "prompt required" }, 400);
      const plan = await planFor(prompt);
      return json({ status: "ready", plan });
    }

    // Vision: read the uploaded garment so the generated model wears the SAME design.
    if (url.pathname === "/api/vision" && request.method === "POST") {
      let body = {};
      try { body = await request.json(); } catch {}
      const b64 = String(body.image || "").replace(/^data:image\/[a-z]+;base64,/, "");
      if (!b64) return json({ error: "image required" }, 400);
      let bin;
      try { bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); } catch { return json({ error: "bad image" }, 400); }
      if (bin.length > 4000000) return json({ error: "image too large" }, 413);
      if (!env || !env.AI) return json({ ok: false, error: "vision unavailable" }, 502);
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
          if (text.length > 8) return json({ ok: true, model: "llama-3.2-11b-vision", description: text });
        } catch {}
      }

      for (const m of [forced, "@cf/llava-hf/llava-1.5-7b-hf", "@cf/unum/uform-gen2-qwen-500m"].filter(Boolean)) {
        try {
          const out = await env.AI.run(m, { image: [...bin], prompt: ask, max_tokens: 220 });
          const text = String(out.description || out.response || "").trim();
          if (text.length > 8) return json({ ok: true, model: m, description: text });
        } catch {}
      }
      return json({ ok: false, error: "vision failed" }, 502);
    }

    // FLUX.2 [dev] — best quality + optional reference image (true "same design" try-on).
    if (url.pathname === "/api/image" && request.method === "POST") {
      let body = {};
      try { body = await request.json(); } catch {}
      const prompt = String(body.prompt || "").slice(0, 1500);
      if (!prompt) return json({ error: "prompt required" }, 400);
      const ref = String(body.ref || "");
      const w = Math.min(1920, Math.max(256, parseInt(body.width || "1024", 10) || 1024));
      const h = Math.min(1920, Math.max(256, parseInt(body.height || "1536", 10) || 1536));
      const steps = Math.min(30, Math.max(4, parseInt(body.steps || "18", 10) || 18));
      const refBytes = ref ? Uint8Array.from(atob(ref.replace(/^data:[^;]+;base64,/, "")), (c) => c.charCodeAt(0)) : null;
      const out = await generateImageCore(env, { prompt, refBytes, w, h, steps, quality: body.quality });
      if (out.res) return out.res;
      return json({ error: "image unavailable", retryAfter: out.retryAfter, detail: out.log }, out.retryAfter ? 429 : 502);
    }

    if (url.pathname === "/api/image") {
      const prompt = String(url.searchParams.get("prompt") || "").slice(0, 1200);
      if (!prompt) return json({ error: "prompt required" }, 400);
      const out = await generateImageCore(env, { prompt, refBytes: null, w: 1024, h: 1536, steps: 6 });
      if (out.res) return out.res;
      return json({ error: "image unavailable", retryAfter: out.retryAfter, detail: out.log }, out.retryAfter ? 429 : 502);
    }

    return json({ error: "not found", routes: ["/health", "/api/generate", "/api/image"] }, 404);
  },
};
