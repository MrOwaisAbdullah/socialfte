# CLAUDE

## What this is

SocialFTE - social media automation for a Pakistani furniture brand. Drafts posts,
renders visuals, waits for human approval, then publishes. Monorepo: dashboard
(Next.js 16), worker (Python), shared schema, infra (Docker).

## Repo structure

`
apps/
  dashboard/          # Next.js 16 app - templates, render pipeline, dashboard UI
  worker/             # Python - R2 storage client, DB models, YouTube publisher
packages/
  remotion/           # Remotion video compositions (brand proof, shots)
infra/
  Dockerfile.dashboard
  docker-compose.yml
tools/                # Python media tools (cut, mix, format, render)
media/library/        # SFX, music, logos (committed - no mp3 blanket ignore)
specs/                # Design specs, research, contracts (committed, not deployed)
.claude/skills/       # opencode skills (NOT part of this project - gitignored)
.specify/             # Speckit templates (gitignored)
`

## Tech stack

| Layer | Tech |
|---|---|
| Dashboard | Next.js 16.2, React 19, Tailwind 3, TypeScript 5.7 |
| DB | Neon Postgres + pgvector, Drizzle ORM |
| Storage | Cloudflare R2 (S3-compatible) |
| Render | Puppeteer (screenshots), bundled Chromium |
| Worker | Python 3.12, pg, R2 via boto3 |
| Infra | Docker, Dokploy on Hetzner VPS, Cloudflare |
| LLM | OpenRouter (DeepSeek V4 Flash primary, Gemini 2.5 Flash vision) |

## Commands

`ash
# Dashboard
cd apps/dashboard
npm run dev          # dev server (localhost:3000)
npm run build        # production build
npm run typecheck    # tsc --noEmit

# Schema push (requires DATABASE_URL in env)
cd apps/dashboard
$env:DATABASE_URL = "postgresql://..." ; npx drizzle-kit push

# Worker
cd apps/worker
python -m venv venv; venv\Scripts\activate
pip install -r ../../requirements.txt
`

## Conventions

- No em dashes. Use periods or commas.
- No AI-sounding copy. No "elevate your space", no forced enthusiasm.
- Human approval before publish. No exceptions.
- Audit log every action. No action is too small to log.
- Anti-repeat: no template repeat within 4 posts, no asset repeat within 10,
  no caption >0.85 cosine similarity within 30.
- Token refresh: never publish with less than 7 days until credential expiry.
- Schema source of truth: apps/worker/db/schema.sql. Drizzle schema at
  apps/dashboard/lib/db/schema.ts mirrors it.
- Puppeteer: bundled Chromium locally; system Chromium in Docker via
  PUPPETEER_EXECUTABLE_PATH.

## Environment variables

See specs/002-week2-dashboard-render/contracts/env-vars.md for the full list.
Key ones: DATABASE_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
R2_BUCKET, RENDER_INTERNAL_SECRET, SESSION_SECRET.

## Gotchas

- Next.js 16 uses devIndicators (plural), not devIndicator.
- next.config.ts must have output: standalone for Docker.
- drizzle-kit push fails if vector extension is not enabled first.
- PUPPETEER_EXECUTABLE_PATH env var overrides launch({ executablePath }) at
  import time - remove it from .env.local to use bundled Chromium locally.
- Route groups: root layout is bare (fonts+globals), (dashboard) has header,
  /render-preview inherits bare - no app chrome in screenshots.
