# How SocialFTE Works

This document explains how the system actually works today, through the end of
Week 5 (`005-week5-motion-generalise`) — every connection between components,
and the full path a post takes from nothing to published. It's written from
reading the actual code (`apps/worker/config.py`, each publisher/notify
module, `apps/worker/main.py`), not from the original spec documents, so it
reflects reality rather than the plan. Sections 1-9 below describe the system
as it stood at the end of Week 4; the "Week 5 additions" section at the end
covers video rendering, clip processing/cover-frame selection, the calendar
screen, and the generalisation pass — all real and verified, not speculative.

## 1. System map — who talks to whom

```
                         ┌─────────────────────┐
                         │   Discord (Bot API)  │
                         │  channel + webhook    │
                         └──────────┬────────────┘
                     bot token      │      Ed25519-signed
                     (send cards)   │      interaction webhook
                                    │
┌───────────────┐   internal    ┌───▼────────────┐    SQL over TLS   ┌──────────────┐
│  apps/dashboard│◄─────────────►│  apps/worker   │◄──────────────────►│ Neon Postgres│
│  (Next.js 16)  │  shared secret │  (FastAPI +    │                    │  + pgvector  │
│                │  header        │  APScheduler)  │                    └──────────────┘
└───────┬────────┘                └───┬───┬───┬────┘
        │ Puppeteer                   │   │   │
        │ (screenshot render)         │   │   │  S3-compatible API
        ▼                             │   │   ▼  (boto3 / aws-sdk)
┌───────────────┐                     │   │ ┌──────────────┐
│ render-preview │                    │   │ │ Cloudflare R2 │  renders, cover
│ (bare route)   │                    │   │ │  (media)      │  frames, clips
└───────────────┘                     │   │ └──────────────┘
                                       │   │
                        HTTPS + API key│   │ OAuth2 tokens (per-platform)
                                       ▼   ▼
                        ┌──────────────────────────────┐
                        │ OpenRouter (LiteLLM routing)  │   Meta Graph API
                        │ DeepSeek V4 (caption/judgement)│  YouTube Data + Analytics API
                        │ Gemini 2.5 Flash (vision)      │  TikTok Content Posting API
                        └──────────────────────────────┘
```

| Connection | Protocol / auth | Where it's configured |
|---|---|---|
| Dashboard ↔ Worker (render requests) | HTTP, `x-render-secret` header matching `RENDER_INTERNAL_SECRET` | `apps/worker/config.py`'s `RENDER_INTERNAL_URL`/`RENDER_INTERNAL_SECRET`; checked in `apps/dashboard/app/api/internal/render/route.ts` |
| Worker ↔ Neon | `asyncpg` over TLS, connection string | `apps/worker/config.py`'s `DATABASE_URL`; engine built in `apps/worker/db/session.py` |
| Dashboard ↔ Neon | `pg`/Drizzle over TLS | `apps/dashboard/lib/db/client.ts`, same `DATABASE_URL` |
| Worker/Dashboard ↔ R2 | S3-compatible API, access key + secret | `apps/worker/config.py`'s `R2_*` vars; `apps/worker/storage/r2.py` (worker), `apps/dashboard/lib/r2.ts` (dashboard) |
| Worker → Discord (sending) | Bot token, `Authorization: Bot <token>` | `apps/worker/config.py`'s `DISCORD_BOT_TOKEN`/`DISCORD_CHANNEL_ID`; `apps/worker/notify/discord.py` |
| Discord → Dashboard (button clicks) | Ed25519-signed webhook, verified against `DISCORD_PUBLIC_KEY` | `apps/dashboard/app/api/webhooks/discord/route.ts` |
| Worker → OpenRouter/LiteLLM | Bearer key via `OPENROUTER_API_KEY`, `litellm/openrouter/<model>` model strings | `apps/worker/brain/base.py`; used by `brain/composer.py` (caption) and `brain/vision.py` (tagging/quality) |
| Worker → Meta Graph API | Page access token (`META_PAGE_TOKEN` or `credentials` table) | `apps/worker/publishers/meta.py` |
| Worker → YouTube | OAuth2, local token file (`YOUTUBE_TOKEN_PATH`) — **not** the `credentials` DB table | `apps/worker/publishers/youtube.py` |
| Worker → TikTok | Access token (draft-only by default; direct-post gated behind `TIKTOK_MODE`) | `apps/worker/publishers/tiktok.py` |

**The one asymmetry worth remembering**: every platform's credentials live in
the `credentials` table (`platform`, `access_token`, `refresh_token`,
`expires_at`, `meta` JSONB) **except YouTube**, whose OAuth token lives in a
local file (`YOUTUBE_TOKEN_PATH`, default `/app/secrets/token.json`) because
Week 3's `publishers/youtube.py` was adapted from a pre-existing standalone
script that already had its own file-based OAuth flow. Anything that needs a
YouTube credential (e.g. `collect_metrics.py`) has to read that file directly,
not query `credentials`.

## 2. Flow of actions — a single post, end to end

```
 1. compose_batch (daily, 04:00)
    apps/worker/jobs/compose_batch.py
    ├─ picks an asset (least-used first) + a template, both passing the
    │  anti-repeat gate (apps/worker/composer/anti_repeat.py)
    ├─ calls brain.composer.write_caption() → caption_agent (DeepSeek Flash)
    │  → checked against HUMANIZER_BANNED_PHRASES before being accepted
    ├─ embeds the caption (brain.base.embed()) and re-checks anti_repeat
    │  .check_caption() — retries with a new caption on rejection
    ├─ POSTs to /api/internal/render (apps/dashboard) → Puppeteer screenshots
    │  the composed template → uploads PNG to R2 → returns a public URL
    └─ writes a `posts` row: state='review', render_url=<the PNG>,
       caption_vec=<the embedding>

 2. notify_review (daily, 04:30)
    apps/worker/jobs/notify_review.py
    ├─ finds posts where state='review' and scheduled_at is within 24h
    └─ calls notify.discord.send_approval() for each (batched, max 10 per run)
       → an embed card with the render, caption, platform badge, and
         Approve / Edit / Skip buttons

 3. A human clicks a button in Discord
    apps/dashboard/app/api/webhooks/discord/route.ts (Ed25519-verified)
    ├─ Approve/Skip → updates posts.state directly
    └─ Edit → opens a Discord modal (Label+TextInput), submission updates
       posts.caption in place (no Gateway bot needed — see Week 3's fix)

 4. publish_due (every 15 minutes)
    apps/worker/jobs/publish_due.py
    ├─ finds posts where state='approved' and scheduled_at <= now()
    ├─ checks the platform's daily cap (_check_platform_cap)
    ├─ dispatches to the right publisher (publishers/meta.py, youtube.py,
    │  or tiktok.py) based on post.platform + post.format
    └─ on success: state='published', external_id=<platform's post ID>
       on failure: state='failed', notifies Discord

 5. collect_metrics (every 6 hours)
    apps/worker/jobs/collect_metrics.py
    ├─ finds published posts with an external_id
    ├─ Meta (Facebook/Instagram): batched Graph API insights query
    ├─ YouTube: reads the local token file directly, checks its granted
    │  scopes include yt-analytics.readonly, then queries the YouTube
    │  Analytics API's reports.query
    └─ writes `metrics` rows (window='24h'|'7d'), isolating per-post failures
       so one broken post doesn't abort the run

 6. weekly_digest (Sundays, 05:00)
    apps/worker/jobs/weekly_digest.py
    ├─ queries the past 7 days of metrics + audit_log
    ├─ calls the judgement-tier model (DeepSeek V4 Pro) to write a prose summary
    ├─ appends a dated section to MEMORY.md
    └─ sends the same summary to Discord

 (separately, daily at 03:00) refresh_tokens
    apps/worker/jobs/refresh_tokens.py
    checks every credential's expires_at; refreshes Meta/TikTok tokens before
    they expire; YouTube is a no-op here (Google's client library refreshes
    its own file-based token on demand)
```

Every step above writes at least one `audit_log` row — "no action is too small
to log" is enforced by convention (`_write_audit()` helpers), not by a database
trigger.

## 3. Cron schedule

| Job | Schedule | File |
|---|---|---|
| `refresh_tokens` | Daily, 03:00 | `apps/worker/jobs/refresh_tokens.py` |
| `publish_due` | Every 15 minutes | `apps/worker/jobs/publish_due.py` |
| `notify_review` | Daily, 04:30 | `apps/worker/jobs/notify_review.py` |
| `compose_batch` | Daily, 04:00 | `apps/worker/jobs/compose_batch.py` |
| `collect_metrics` | Every 6 hours | `apps/worker/jobs/collect_metrics.py` |
| `weekly_digest` | Sundays, 05:00 | `apps/worker/jobs/weekly_digest.py` |

All six are registered in `apps/worker/main.py`'s FastAPI `lifespan` handler via
APScheduler (`AsyncIOScheduler`), reading their schedules from the `*_CRON` env
vars in `apps/worker/config.py`. `GET /jobs` on the worker lists all registered
jobs and their next run time; `GET /health` is the container healthcheck.

## 4. BOOTSTRAP — how a brand gets set up in the first place

Everything above assumes `SOUL.md`, `BRAND.md`, `HEARTBEAT.md`, and at least one
row in `credentials` already exist. `apps/worker/bootstrap/steps.py`'s six
steps are what produce them:

1. **Identity** → writes `SOUL.md`, `IDENTITY.md`
2. **Brand** → writes `BRAND.md`, regenerates `packages/remotion/src/brand.ts`/
   `fonts.ts` via the `/brand-setup` skill
3. **Platforms** → runs each platform's OAuth flow, writes rows to `credentials`
4. **Notification channel** → writes the chosen channel's token/IDs to
   `.env.local`, sends a real test message to confirm it works
5. **Cadence** → writes `HEARTBEAT.md` (posts/day per platform, posting hours)
6. **Verify and finish** → runs a real LLM call, a real render, a real
   notification, and a DB check; only deletes `BOOTSTRAP.md` if all pass

Every step is resumable — it checks whether its own output already exists
before re-prompting, so a killed process or closed browser tab doesn't lose
prior answers. `BOOTSTRAP.md`'s mere existence is the "first-time setup still
available" flag; step 6 deletes it on success, and both the CLI
(`python -m worker bootstrap`) and the dashboard's `/setup` page refuse to
re-run once it's gone.

## 5. Where to look

| Directory | What's in it |
|---|---|
| `apps/worker/jobs/` | Every cron job — one file per job, each with a `_write_audit()` helper and its own tests in `apps/worker/tests/` |
| `apps/worker/brain/` | LLM agents — `base.py` (model routing + embeddings), `composer.py` (captions + humanizer), `vision.py` (asset tagging + quality gate) |
| `apps/worker/composer/` | The anti-repeat gate (`anti_repeat.py`) — DB-query logic, deliberately kept separate from `brain/`'s LLM-calling agents |
| `apps/worker/publishers/` | One file per platform (`meta.py`, `youtube.py`, `tiktok.py`) — each exposes `post_*`/`publish_*` functions called by `publish_due.py` |
| `apps/worker/notify/` | `discord.py` (implemented), `whatsapp.py`/`telegram.py` (stubs — `NotImplementedError`) |
| `apps/worker/bootstrap/` | The guided setup wizard — `steps.py` (the six steps), `cli.py` (the `python -m worker bootstrap` entry point) |
| `apps/dashboard/app/(dashboard)/` | The human-facing screens (login, and whatever screens exist per week) |
| `apps/dashboard/app/api/internal/` | Endpoints only the worker calls (render, vision tagging) — secret-header authenticated, never exposed to end users |
| `apps/dashboard/app/api/webhooks/` | Endpoints external services call (Discord's interactions webhook) |

## Week 5 additions

Everything below is real and verified as of `005-week5-motion-generalise` —
either via the unit test suite or, where noted, a live run against the real
dev database/dashboard. It builds on top of everything above; nothing in
Weeks 1-4 changed shape, video posts and calendar rescheduling just plug into
the same `posts` table and the same Discord approval flow.

### Video post lifecycle

Image posts (Weeks 1-4) go `draft → review` synchronously inside
`compose_batch.py` — Puppeteer renders the screenshot before the `Post` row
is even created. Video posts can't work that way (a Remotion render takes
minutes, not milliseconds), so they get a second, async lifecycle:

```
compose_batch.py                 GitHub Actions                 apps/worker
┌─────────────────┐              ┌─────────────────┐            ┌──────────────────┐
│ creates Post     │  workflow_   │ render-video.yml │  POST      │ /api/render-      │
│ state='draft'    │─dispatch────►│ npx remotion     │───────────►│ complete          │
│ (no render_url)  │  REST call   │ render → R2      │  {output_  │ sets render_url,  │
└─────────────────┘              └─────────────────┘  key,       │ state='review'    │
        │                                              status}    │ (or 'failed')     │
        │ dispatch_render.py also polls run status                └──────────────────┘
        │ every 30s/15min max — purely for logs/audit,
        ▼ the callback above is what actually finishes the post
  audit_log: dispatch_sent / dispatch_rejected / dispatch_poll_timeout
```

- `jobs/compose_batch.py` maps each of the 6 static templates to one of 4
  Remotion compositions (`VIDEO_COMPOSITION_MAP`) when the candidate's format
  is `video`/`short`/`reel`, and calls `jobs/dispatch_render.py`'s
  `dispatch_video_render()` — which is `async def` and schedules its own
  status-polling as a background `asyncio.create_task()` rather than
  `await`ing it inline, so one slow render never blocks the rest of a
  batch's dispatches.
- The four compositions (`packages/remotion/src/compositions/`) —
  `HeroReveal`, `PriceReveal`, `FabricDetail`, `SetReveal` — all read colors
  and fonts from `packages/remotion/src/brand.ts`/`fonts.ts`, same contract
  `BrandProof.tsx` established in Week 1.
- `.github/workflows/render-video.yml` runs on `ubuntu-latest` (7GB RAM —
  the reason rendering doesn't happen on the VPS), writes the dispatch's
  `props` JSON to a file via `env:`+`echo` rather than interpolating it
  directly into a shell command (a documented `workflow_dispatch`
  script-injection anti-pattern), uploads the MP4 to R2 via `aws s3 cp`, and
  calls back to `/api/render-complete` with an `x-render-secret` header —
  same shared-secret pattern as every other internal endpoint.
- `POST /api/render-complete` (`apps/worker/main.py`) parses the post ID out
  of the `output_key`'s filename (`renders/{post_id}.mp4` convention) and
  sets `state='review'` on success or `state='failed'` + an `error` message
  on anything else — this is the only thing that actually finishes a video
  post; `dispatch_render.py`'s own polling is observability, not completion.

### Clip processing (audio) and cover-frame selection

A second, independent pipeline handles raw uploaded video clips
(`assets.kind='clip'`), separate from the static-image/video-post flow above:

```
process_footage.py (every PROCESS_FOOTAGE_CRON, default */15 min)
  query: assets WHERE kind='clip' AND processed=false
    │
    ├─ clean_voice.py (local RNNoise) — falls back to the original file on failure
    ├─ check_av_sync() — direct ffprobe stream-duration comparison
    │     (not tools/media/verify_cut.py — that script expects an ASR
    │      transcript + planned-cut structure this raw-clip flow doesn't have)
    │
    ├─ sync fails → sync_ok=false, processed=true, STOP (no music, no cover-frames)
    │
    └─ sync passes → mix_music.py (bed from media/library/music/ at
         settings.MUSIC_BED_DB, default -18dB) → quality_score=80,
         processed=true → extract 12 candidate frames (direct ffmpeg calls,
         not tools/media/cutlib.py — that's audio cut-planning logic keyed on
         ASR word transcripts, not a frame-extraction primitive) → score each
         via brain/vision.py's score_frame() (same structured-output Agent
         pattern as Week 4's tag_asset/quality_gate) → keep the top 3 scoring
         >= MIN_USABLE_FRAME_SCORE → upload to R2, write to
         posts.cover_frame_candidates (JSONB: up to 3 {url, score, reason})
```

- If zero of the 12 candidate frames clear the usability threshold, nothing
  is written to any post and a `cover_frames_none_usable` audit row explains
  why (FR-010) — never a silently empty or broken candidate list.
- `notify/discord.py`'s `send_approval()` checks for non-empty
  `cover_frame_candidates` on the post and, if present, adds one preview
  embed per candidate (Discord buttons can't carry an image themselves) plus
  a second action row of three buttons (`custom_id: cover:{post_id}:{n}`)
  alongside the existing Approve/Edit/Skip row.
- Clicking one of those buttons hits `apps/dashboard/app/api/webhooks/discord/route.ts`,
  which sets the chosen candidate's URL directly as `posts.render_url` (there's
  no separate thumbnail field — the chosen cover *is* the render) and writes a
  `cover_frame_selected` audit row.

### Calendar screen

`apps/dashboard/app/(dashboard)/calendar/page.tsx` — a week view, one column
per platform, backed by two API routes:

- `GET /api/posts?weekStart=YYYY-MM-DD` — returns 7 days × 4 platforms, each
  cell pre-computed with its posts and a `{count, cap, overCap}` daily-cap
  status. The cap values themselves come from `lib/cap-limits.ts`, which
  reads the *same* `CAP_*_PER_DAY` env vars `publish_due.py`'s
  `_check_platform_cap()` enforces at actual publish time — one source of
  truth, read twice, not reimplemented twice.
- `PATCH /api/posts/[id]` — updates `scheduled_at` (native HTML5 drag-and-drop
  on the frontend, no added dependency), recomputes that day/platform's cap
  status, and writes a `post_rescheduled` audit row. Going over cap doesn't
  block the move — it's a human override — but the UI surfaces a dismissible
  toast so it's never silent (FR-015).
- Both routes are session-gated by `proxy.ts` like the rest of the dashboard.
  Wiring this up surfaced a real, separate bug in `proxy.ts`: its matcher
  excluded `api/internal` but not `api/webhooks`, so the Discord interactions
  endpoint above would have been redirected to `/login` instead of returning
  the JSON Discord expects — fixed alongside the calendar work since it
  directly broke the cover-frame picker feature.

### Generalisation (no more hardcoded brand)

The dashboard's title, header wordmark, and login heading now read from a
`BRAND_NAME` env var (falling back to a generic default if unset) instead of
a literal "Yousuf Living" string; `next.config.ts`'s allowed image hostname
derives from `R2_PUBLIC_URL` instead of a hardcoded domain. `apps/worker/bootstrap/`
now accepts `--env=<path>` (an isolated client's `.env` file), threading a
`root: Path` through every step instead of always writing to the real repo
root — proven by actually running `python -m worker bootstrap
--env=clients/test-client-2/.env` and confirming (via `stat`/`git status`)
the real repo root's `SOUL.md`/`BRAND.md`/`HEARTBEAT.md`/`IDENTITY.md`/`BOOTSTRAP.md`
were untouched. See `docs/client-provisioning.md` for the full new-client
onboarding runbook this isolation makes possible.
