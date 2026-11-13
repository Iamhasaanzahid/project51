# MeshLink — Cloudflare Deploy (Free)

Static marketing website for **MeshLink** — the free, secure, offline-first messaging app.

## Deploy (free)

```bash
cd /home/mhzaly/Documents/Default\ Project/cloudflare

# Login + deploy the MeshLink static site
npx wrangler login
npx wrangler pages publish /home/mhzaly/Documents/Default\ Project/cloudflare/meshlink --project-name=meshlink
```

Or via Cloudflare dashboard: **Pages → Create → Git / Direct Upload → Connect to repo** → pick this folder.

## Live after deploy

```
https://meshlink.pages.dev
```

You can also attach a custom domain later (free on Pages).

## Build config

- Source: `cloudflare/meshlink/` (index.html + _headers)
- Framework: none (plain HTML/CSS/JS — free)
- Static output: publish folder

## Notes

- Zero build step, zero cost on free plan.
- HTML cache: 300s; immutable for hashed assets.
- Site is fully self-contained (Google Fonts + Font Awesome via CDN).
