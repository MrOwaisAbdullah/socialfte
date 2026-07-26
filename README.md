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
2. **Renders** product visuals using six template layouts (hero, price-card, set-breakdown, quote, before-after, carousel)
3. **Screenshots** the rendered template via Puppeteer and uploads to Cloudflare R2
4. **Waits** for human approval before doing anything
5. **Publishes** to Facebook, Instagram, YouTube Shorts, and TikTok
6. **Logs** every action to an audit trail

It never posts without explicit human approval. No exceptions.

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
  dashboard/          # Next.js 16 app — templates, render pipeline, dashboard UI
  worker/             # Python — agent framework, publishers, DB models
packages/
  remotion/           # Remotion video compositions (brand proof, shots)
infra/
  Dockerfile.dashboard
  docker-compose.yml
  .github/workflows/deploy.yml
tools/                # Python media tools (cut, mix, format, render)
media/library/        # SFX, music, logos
specs/                # Design specs, research, contracts
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

### Prerequisites

- Node.js 22+
- Python 3.12+
- Neon Postgres database
- Cloudflare R2 bucket
- OpenRouter API key

### 1. Clone and install

```bash
git clone https://github.com/yourusername/SocialFTE.git
cd SocialFTE

# Dashboard
cd apps/dashboard
npm install

# Worker
cd ../worker
python -m venv venv
pip install -r ../../requirements.txt
```

### 2. Set up environment

Copy `.env.example` to `.env.local` in `apps/dashboard/` and fill in:

```bash
# Database
DATABASE_URL=postgresql://...

# R2 Storage
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=yl-social
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_PUBLIC_URL=https://media.yousufliving.com

# Rendering
RENDER_INTERNAL_SECRET=<random>
SESSION_SECRET=<openssl rand -hex 32>
```

### 3. Apply database schema

```bash
cd apps/dashboard
$env:DATABASE_URL = "postgresql://..."  # PowerShell
npx drizzle-kit push
```

This creates the 6 tables, pgvector extension, and 4 indexes.

### 4. Run

```bash
# Dashboard
cd apps/dashboard
npm run dev

# Worker (separate terminal)
cd apps/worker
python -m venv venv
venv\Scripts\activate
uvicorn main:app --reload
```

Dashboard runs at `http://localhost:3000`.

---

## Deployment

GitHub Actions builds the Docker image and pushes to GHCR. Dokploy pulls and runs it on the VPS.

```bash
# Push to master triggers CI/CD
git push origin master
```

### GitHub secrets required

| Secret | Source |
|---|---|
| `DOKPLOY_URL` | Your Dokploy panel URL |
| `DOKPLOY_API_KEY` | Dokploy → API keys |
| `DOKPLOY_APP_ID` | Application detail page in Dokploy |

### Docker

```bash
# Build (in CI, not locally)
docker build -f infra/Dockerfile.dashboard -t socialfte-dashboard .

# The container installs Chromium via apt for Puppeteer
# Standalone output, HOSTNAME=0.0.0.0, port 3000
```

---

## Relevant skills

These opencode skills were used during development and are relevant for future work:

| Skill | Use case |
|---|---|
| `vps-dokploy-nextjs` | VPS deployment, Dockerfile patterns, GitHub Actions, Cloudflare SSL |
| `frontend-designer` | Template component design, brand token application |
| `betterauth-nextjs` | Session auth patterns (used for reference, implemented custom) |
| `rag-pipeline-builder` | pgvector embedding patterns for anti-repeat |
| `building-nextjs-apps` | Next.js 16 App Router patterns, route groups |

---

## Environment variables

See `specs/002-week2-dashboard-render/contracts/env-vars.md` for the full list.

**Dashboard (Week 2):**

```bash
NODE_ENV=production
APP_URL=https://social.yousufliving.com
SESSION_SECRET=
DATABASE_URL=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_ENDPOINT=
R2_PUBLIC_URL=
RENDER_INTERNAL_SECRET=
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

**Worker (Week 3+):**

```bash
OPENROUTER_API_KEY=
REDIS_URL=
META_ACCESS_TOKEN=
YOUTUBE_*=
TIKTOK_*=
DISCORD_BOT_TOKEN=
```

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

## Week 2 progress

All 42 tasks complete. Verified:

- [x] Schema applied to Neon (6 tables, pgvector, 4 indexes)
- [x] Dashboard build succeeds
- [x] Render round-trip (Puppeteer → R2 → public URL)
- [x] Python models import clean
- [x] Dockerfile written and reviewed
- [x] GitHub Actions workflow created
- [x] Single commit: `week2: schema, dashboard, templates, render route`

Pending (environment-limited):
- [ ] Docker build (no Docker locally, CI handles it)
- [ ] Container smoke test (happens on VPS via Dokploy)

---

## Contributing

This is a single-operator project. Not accepting external contributions at this time.

## License

MIT License. Copyright (c) 2026 Owais Abdullah.
