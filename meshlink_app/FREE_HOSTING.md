# MeshLink — Free Hosting (Backend)

The backend is a single FastAPI app with SQLite. It runs on any free tier.
Choose **one** option below.

---

## Option 1 — Render.com (free, no card) ✅ Easiest

1. Push this repo to GitHub.
2. Go to https://render.com → **New → Blueprint**.
3. Select the repo. Render reads `render.yaml` automatically.
4. Deploy. You get a URL like `https://meshlink-api.onrender.com`.
5. Check `https://meshlink-api.onrender.com/health`.

**Note:** Free Render services sleep after ~15 min of inactivity and cold-start in ~30 s.
The SQLite DB is on ephemeral storage (`/tmp`) on the free plan, so it resets on redeploy.
For permanent storage, add a free Postgres (Render free Postgres) and switch `DB_PATH`
to its URL later.

---

## Option 2 — Railway (free trial credit)

1. https://railway.app → New Project → Deploy from GitHub.
2. Root directory: `meshlink_app`
3. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add variable `MESHLINK_DB=/data/meshlink.db`

---

## Option 3 — Fly.io (free allowances)

```bash
cd meshlink_app
fly launch --no-deploy
fly volumes create meshlink_data --size 1
fly deploy
```

Fly gives a small free allowance; a 1 GB volume is enough for text messaging.

---

## Option 4 — Oracle Cloud Always Free VM (most generous, no sleep)

1. Create an **Always Free** ARM VM (4 CPU / 24 GB RAM free).
2. Install Docker.
3. Run:

```bash
docker build -t meshlink-api ./meshlink_app
docker run -d --restart unless-stopped \
  -p 8000:8000 \
  -v /opt/meshlink-data:/data \
  -e MESHLINK_DB=/data/meshlink.db \
  meshlink-api
```

4. Put it behind Caddy/Nginx for HTTPS (Caddy auto-TLS is free).

This is the best free option for a **real, always-on** server.

---

## Option 5 — Your own PC (LAN / mesh only)

```bash
cd meshlink_app
.venv-meshlink/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Works fully free on your local network. The Android app connects via the LAN IP
instead of `10.0.2.2`.

---

## Point the Android app at your host

No code edits needed — pass the URL at build time:

```bash
cd meshlink_android
gradle assembleDebug -PmeshlinkApiUrl="https://meshlink-api.onrender.com"
```

Default release URL is `https://meshlink-api.onrender.com`
(edit the default in `app/build.gradle` if you host elsewhere).

---

## Notes on "free forever"

- Text messaging over the internet: free (tiny bandwidth).
- Media (images / voice): will consume storage quickly. Use a free object store
  (Cloudflare R2 free tier, Backblaze B2 free 10 GB) when you add real media storage.
- There are **no ads, no subscriptions, no paid APIs** anywhere in this codebase.
