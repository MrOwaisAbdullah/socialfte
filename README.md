# SocialFTE

Social media automation for Pakistani furniture brands. Drafts posts, renders visuals, waits for human approval, then publishes.

**Founding client:** Yousuf Living (Karachi)  
**Version:** 0.1.0  
**License:** MIT  
**Author:** Owais Abdullah

---

## What it does

SocialFTE runs the social media accounts for a furniture brand. It:

1. **Drafts** captions in the brand's voice (no AI-sounding copy, no em dashes, real prices upfront)
2. **Renders** product visuals using six template layouts (hero, price-card, set-breakdown, quote, before-after, carousel) — and, for video-format posts, dispatches a real Remotion render via GitHub Actions
3. **Screenshots** the rendered template via Puppeteer and uploads to Cloudflare R2 (or downloads the rendered MP4, for video posts)
4. **Processes raw video clips** uploaded to the asset library — noise cleanup, A/V sync check, music mixing, and vision-scored cover-frame selection
5. **Waits** for human approval before doing anything — via Discord approval cards, including a cover-frame picker for video posts
6. **Publishes** to Facebook, Instagram, YouTube Shorts, and TikTok
7. **Lets a human reschedule** anything from a weekly Calendar screen, with a visible daily-cap warning
8. **Logs** every action to an audit trail

It never posts without explicit human approval. No exceptions.

The product itself is brand-agnostic — every brand-specific value (name, colors, prices,
platform credentials) lives in configuration, not code, so it can run more than one
client's accounts from the same codebase. See `docs/client-provisioning.md` for onboarding
a new client.

## Supported platforms

| Platform | Status |
|---|---|
| Facebook | Active |
| Instagram | Active |
| YouTube Shorts | Active |
| TikTok | Draft-only (pending audit) |

## Notification channels

| Channel | Status |
|---|---|
| Discord | Active |
| WhatsApp | Available |
| Telegram | Available (off by default, VPN required in Pakistan) |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    SocialFTE                         │
├──────────────────┬──────────────────────────────────┤
│  Dashboard       │  Worker (Python)                 │
│  Next.js 16      │  OpenAI Agents SDK               │
│  Templates       │  LiteLLM model router            │
│  Render pipeline │  Platform publishers             │
│  Session auth    │  Media tools (ffmpeg, whisper)   │
├──────────────────┴──────────────────────────────────┤
│  Neon Postgres + pgvector  │  Cloudflare R2         │
│  Upstash Redis             │  OpenRouter (LLM)      │
└─────────────────────────────────────────────────────┘
```

### Repo structure

```
apps/
  dashboard/          # Next.js 16 app — templates, render pipeline, Calendar, dashboard UI
  worker/             # Python — agent framework, publishers, DB models, BOOTSTRAP wizard
packages/
  remotion/           # Remotion video compositions (brand proof + 4 post-video templates)
infra/
  Dockerfile.dashboard
  Dockerfile.worker
  docker-compose.yml
.github/workflows/
  deploy.yml          # builds + deploys the dashboard image on push to master
  render-video.yml    # dispatched per-post by dispatch_render.py, not by git push
clients/
  test-client-2/      # throwaway second-brand config proving the isolation boundary works
tools/                # Python media tools (cut, mix, format, render)
media/library/        # SFX, music, logos
specs/                # Per-week spec/plan/tasks (Speckit workflow)
docs/                 # How-it-works, local dev + deployment, client provisioning, etc.
```

### Database schema (6 tables)

| Table | Purpose |
|---|---|
| `templates` | The six named post layouts |
| `assets` | Reusable media, tagged by vision agent |
| `posts` | Every draft, render, approval, and publish event |
| `metrics` | Post-performance data |
| `audit_log` | Every action the system takes |
| `credentials` | Platform OAuth tokens (encrypted) |

Uses pgvector for caption anti-repeat (cosine similarity on 1536-dim embeddings).

---

## The six templates

| Template | What it shows |
|---|---|
| `hero` | Full room render with price overlay and WhatsApp CTA |
| `price-card` | "Ye kitne ka hoga?" price reveal |
| `set-breakdown` | 5-piece bedroom set, individual + bundle pricing |
| `quote` | Fabric/detail close-up with quality messaging |
| `before-after` | Workshop process or room transformation |
| `carousel-slide` | Multi-image carousel post |

Each template renders at three aspects: `square` (1080x1080), `feed` (1080x1350), `reel` (1080x1920).

---

## Content workflow

```
draft → render → review → approved → publish
  │        │        │         │          │
  │        │        │         │          └─ Posts to platform, logs external_id
  │        │        │         └─ Human said yes, queued for next publish run
  │        │        └─ Human-approval card sent, waiting on decision
  │        └─ Puppeteer screenshot + R2 upload, URL attached to draft
  └─ Caption composed, template picked, brand tokens applied
```

Video-format posts take a slightly different path: `draft` (no render yet) → a GitHub
Actions workflow renders the Remotion composition and uploads it to R2 → a callback moves
the post to `review` (or `failed`) — the rest of the lifecycle is identical. See
`docs/how-it-works.md`'s "Week 5 additions" section for the full diagram.

**Anti-repeat rules** (checked before reaching review):
- No template repeat within 4 posts
- No asset repeat within 10 posts
- No caption >0.85 cosine similarity within 30 posts

**Token refresh:** never publishes with <7 days until credential expiry.

---

## Tech stack

| Layer | Tech | Cost |
|---|---|---|
| Dashboard | Next.js 16, React 19, Tailwind 3, TypeScript | Free |
| DB | Neon Postgres + pgvector, Drizzle ORM | Free tier |
| Storage | Cloudflare R2 (S3-compatible) | Free tier, 10 GB, zero egress |
| Cache | Upstash Redis | Free tier |
| Render | Puppeteer (screenshots) | Free |
| Video | Remotion on GitHub Actions | Free (≤3 employees) |
| Worker | Python 3.12, OpenAI Agents SDK | Free |
| LLM | OpenRouter (DeepSeek V4 Flash + Gemini 2.5 Flash) | ~$1-2/mo at 200 posts |
| Media | ffmpeg, faster-whisper, RNNoise | Free |
| Infra | Dokploy on Hetzner VPS, Cloudflare | Already paid |
| **Total** | | **Under $5/client/month** |

### LLM routing

| Job | Model | Cost per 1M tokens |
|---|---|---|
| Caption writing, hashtags | DeepSeek V4 Flash | $0.09 |
| Weekly digest, planning | DeepSeek V4 Flash | $0.09 |
| Hero post, brand-voice audit | DeepSeek V4 Pro | $0.435 |
| Vision (asset tagging, quality gate) | Gemini 2.5 Flash | ~$0.075 |
| Embeddings (anti-repeat) | OpenAI text-embedding-3-small | $0.02 |
| Dev / testing | DeepSeek V4 Flash (free) | $0 |

Why OpenRouter: one key instead of four, automatic fallback, prompt caching (60-80% cost cut on repeated context).

---

## Getting started

**Full step-by-step guide (env files, database setup, ffmpeg, BOOTSTRAP wizard,
troubleshooting): [`docs/local-development-and-deployment.md`](docs/local-development-and-deployment.md).**
Quick version:

```bash
git clone <this-repo>
cd SocialFTE

# Dashboard
cd apps/dashboard && npm install
cp .env.example .env.local   # fill in DATABASE_URL, R2_*, SESSION_SECRET, etc.
npx drizzle-kit push         # enable the `vector` extension in Neon first
npm run dev                  # -> http://localhost:3000

# Worker (separate terminal) — needs ffmpeg/ffprobe on PATH
cd apps/worker
python -m venv venv && source venv/bin/activate   # venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env         # same DATABASE_URL/R2_*/RENDER_INTERNAL_SECRET as the dashboard
python main.py                                    # -> http://localhost:8000

# One-time: guided brand/platform setup
python -m worker bootstrap
```

---

## Deployment

Two Docker services (`yl-dashboard`, `yl-worker`) on a Dokploy-managed VPS. Pushing to
`master` builds and deploys the **dashboard** image automatically via
`.github/workflows/deploy.yml` (GHCR → Dokploy API); the worker currently redeploys
manually (see the deployment doc for exactly how, and why). Video rendering runs on its
own separate, per-post-dispatched workflow (`.github/workflows/render-video.yml`), not
tied to `git push` at all.

**Full architecture, one-time Dokploy setup, required secrets, and manual-deploy
commands: [`docs/local-development-and-deployment.md`](docs/local-development-and-deployment.md#7-deployment).**

Onboarding a **new client** onto an already-deployed instance is a separate, documented
process — see [`docs/client-provisioning.md`](docs/client-provisioning.md).

---

## Relevant skills

These skills were used during development and are relevant for future work:

| Skill | Use case |
|---|---|
| `vps-dokploy-nextjs` | VPS deployment, Dockerfile patterns, GitHub Actions, Cloudflare SSL |
| `frontend-designer` | Template component design, brand token application |
| `betterauth-nextjs` | Session auth patterns (used for reference, implemented custom) |
| `rag-pipeline-builder` | pgvector embedding patterns for anti-repeat |
| `building-nextjs-apps` | Next.js 16 App Router patterns, route groups |

---

## Environment variables

Three fully-commented `.env.example` files are the canonical reference — copy the
relevant one and fill it in, don't retype variables by hand from this README:

| File | For |
|---|---|
| `.env.example` (repo root) | Complete reference — every variable either app reads, one place |
| `apps/dashboard/.env.example` | Copy to `apps/dashboard/.env.local` |
| `apps/worker/.env.example` | Copy to `apps/worker/.env` |

`DATABASE_URL`, every `R2_*` variable, and `RENDER_INTERNAL_SECRET` **must be identical**
between the dashboard's and worker's env files — they're two processes sharing one
database, one bucket, and one internal-auth secret. Per-week variable history (which
week introduced what, and why) lives in `specs/*/contracts/env-vars.md`.

---

## Brand: Yousuf Living

Karachi-based furniture brand. Upholstered bedroom sets, made to order, sold direct from workshop.

**Voice:** Direct. Warm. Confident.  
**Tagline:** Workshop Price. Showroom Quality.  
**Pricing:** From Rs 190,000 for a complete 5-piece bedroom set.

### Visual identity

| Token | Value |
|---|---|
| Primary | Forest Green `#1B4332` |
| Accent | Warm Gold `#C9A227` |
| Light | Cream `#F5F0E8` |
| Dark | Deep Charcoal `#1A1A1A` |
| Heading font | Instrument Serif |
| Body font | Archivo |

---

## Status

Tagged `v0.1.0` — five weeks of Speckit-driven development (`specs/001-week1-repo-harvest`
through `specs/005-week5-motion-generalise`), each with its own spec, plan, and task
breakdown. Current scope: schema + dashboard shell + render pipeline (Week 2), worker +
publishers + Discord approval flow (Week 3), LLM captioning + anti-repeat + BOOTSTRAP
wizard (Week 4), and video rendering + clip processing + Calendar + multi-client
generalisation (Week 5).

- [x] `apps/worker/tests/` — 89 passed, 1 skipped (see `docs/how-it-works.md` for what
      each piece actually does, verified against the real code rather than the spec)
- [x] Dashboard typechecks clean
- [x] Calendar screen and BOOTSTRAP's `--env` isolation both verified live against a real
      Neon database, not just unit-tested
- [ ] Full video-render checkpoint (dispatch → R2 → callback) needs a pushed GitHub repo
      with Actions secrets configured — see `docs/github-actions-setup.md`

Per-week task lists and their checkpoint results live in each `specs/*/tasks.md`.

---

## Contributing

This is a single-operator project. Not accepting external contributions at this time.

## License

MIT License. Copyright (c) 2026 Owais Abdullah.
