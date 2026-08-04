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

| Job | Default schedule | File |
|---|---|---|
| `refresh_tokens` | Daily, 03:00 | `apps/worker/jobs/refresh_tokens.py` |
| `publish_due` | Every 15 minutes | `apps/worker/jobs/publish_due.py` |
| `notify_review` | Daily, 04:30 | `apps/worker/jobs/notify_review.py` |
| `compose_batch` | Daily, 04:00 | `apps/worker/jobs/compose_batch.py` |
| `collect_metrics` | Every 6 hours | `apps/worker/jobs/collect_metrics.py` |
| `weekly_digest` | Sundays, 05:00 | `apps/worker/jobs/weekly_digest.py` |
| `process_footage` | Every 15 minutes | `apps/worker/jobs/process_footage.py` |

All seven are registered in `apps/worker/main.py`'s FastAPI `lifespan` handler
via APScheduler (`AsyncIOScheduler`), each wrapped by `job_runs.tracked()` so
every execution — scheduled or manual — records a `job_runs` row (status,
timing, error). Default schedules come from the `*_CRON` env vars in
`apps/worker/config.py`; the dashboard's **Jobs** page (`/jobs`) can override
any of them live via `POST /jobs/{id}/schedule` (persisted to `job_schedules`,
applied immediately with no restart) and shows each job's schedule in plain
English, last-run status, and a manual "Run Now" trigger. `GET /jobs` lists
every registered job with its schedule and last run; `GET /health` is the
container healthcheck. See "Jobs management" below for the full picture.

## 4. BOOTSTRAP — how a brand gets set up in the first place

There are **two** BOOTSTRAP paths, and only one of them actually configures a
live deployment — this used to not be true of either, worth being explicit
about given it was a real, confusing gap for a while:

**The CLI wizard** (`python -m worker bootstrap`, `apps/worker/bootstrap/steps.py`)
is a **local-only** tool — it writes `SOUL.md`, `BRAND.md`, `HEARTBEAT.md`,
`IDENTITY.md`, `.env.local`, and `BOOTSTRAP.md` to whatever's passed via
`--env=<path>` (default: the real repo root on disk). Step 2's docstring says
it "regenerates `packages/remotion/src/brand.ts`/`fonts.ts`" — it doesn't;
that never got implemented, it only writes `BRAND.md`. Step 4's `.env.local`
write is also inert: `config.py` only ever loads `.env`, never `.env.local`,
so nothing reads those values at runtime. This wizard only makes sense run
against a real repo checkout before a deployment exists (or for the
`clients/`-isolation testing described in `docs/client-provisioning.md`) — it
can't reach a live Docker container's actual config, since the deployed
worker has no repo root on disk to write to at all (confirmed live: it tried
to write `AGENT_LOG.md` to `/` and got a permission error — same root cause).

**The dashboard wizard** (`/setup`, six steps in
`apps/dashboard/app/setup/page.tsx`) is what actually configures a **live**
deployment. Its last step (`POST /api/internal/bootstrap/verify`) upserts
brand name, tagline, primary/accent colors, logo URL, social handle, and the
brand-mark toggle into a single-row `brand_config` DB table, and sets
`setup_complete=true` there once its checks pass. `GET /api/internal/bootstrap/status`
reads that same flag (previously `existsSync(BOOTSTRAP.md)`, which could never
work in production — the dashboard and worker are separate Docker containers
sharing no filesystem). `compose_batch.py`'s `_build_brand_tokens()` reads
`brand_config` at render time, falling back field-by-field to `config.py`'s
`BRAND_*` env vars for anything the wizard hasn't set yet (or a completely
fresh deployment with no row at all). This wizard does **not** yet run
platform OAuth flows or persist connected-platform selection — connecting
Facebook/Instagram/YouTube/TikTok credentials is still a manual, out-of-band
step (register an app in each platform's own developer console, then insert
the token via `db/credentials.py`'s `save_token()`).

Both wizards are resumable — each step checks whether its own output already
exists before re-prompting.

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

## Operational fixes and Jobs management (post-launch)

Found and fixed after Week 5's implementation, mostly by actually running the
deployed system and watching what broke rather than by re-reading code —
each is a real, previously-live bug, not a hypothetical.

**Still-image rendering was completely broken.** `compose_batch.py`'s
non-video branch sent every render request with `props: {caption,
assetImageUrl}` and `brand: {}` regardless of which template was picked —
none of the 6 templates' actual required props (`registry.ts`) are named
`caption`/`assetImageUrl`, so `validateTemplateProps` rejected every single
one with a 400 before anything rendered, and colors/fonts/wordmark were
undefined even on the rare request that did validate. The video-dispatch
path already had a working props-builder (`_build_video_props`); the
still-image path never got an equivalent. Fixed with `_build_image_props()`
(maps each template slug to its real required props, same "honest
best-effort" precedent already set for video's `SetReveal.bundlePrice`) and
`_build_brand_tokens()` (reads `brand_config`, falls back to `config.py`'s
`BRAND_*` env vars).

**Brand logo + social handle toggle**, added at the same time since it
touches the same `brand_config`/`BrandTokens` object: `logoUrl`,
`socialHandle`, `showBrandMark` fields flow from the `/setup` wizard →
`brand_config` → `_build_brand_tokens()` → a shared `BrandBadge` component
rendered bottom-right on all 6 dashboard templates (still images,
`apps/dashboard/components/templates/brand-badge.tsx`) and all 5 Remotion
compositions (video, `packages/remotion/src/lib/kit.tsx`'s `BrandBadge`,
sourced from `brand.ts`'s static `logoUrl`/`socialHandle`/`showMark` fields
since that pipeline renders on GitHub Actions, not per-request).

**Vision tagging ignored the uploader's own filename.** Confirmed live: 7+
assets that were visually distinct (different colors/fabrics of the same
storage bench) all got tagged with the same generic `variant`, because
`_analyze_asset()` only ever saw the image itself — meanwhile the uploaded
filenames already named the color/material/product line by hand. Fixed by
threading `asset.original_filename` (new `assets` column, populated at
upload time in both `apps/dashboard/app/api/assets/upload/route.ts` and its
internal equivalent) into `_analyze_asset(image_url, original_filename)`,
which appends it to the vision prompt as an explicit **hint, not ground
truth** — the model is told the filename may name the color/material but
could also be wrong or generic, so it still has to look at the photo.
`tag_asset`, `quality_gate`, and `retag_assets.py`'s retag path all pass it
through. Run `drizzle-kit push` again from `apps/dashboard` to pick up the
new `original_filename` column if you haven't already.

**Captions had markdown asterisks, too many emoji, and duplicated
hashtags.** Confirmed live: a real published caption had
`**Yousuf Living Storage Bench**` with the literal asterisks intact
(Facebook/Instagram/TikTok don't render markdown), 6+ emoji, and a 30-item
hashtag list with the same tags repeated twice. `skills/caption-writer.md`
now states these rules explicitly (no markdown, 1-3 emoji, exactly 3-8
unique hashtags, no "quote card" structure), but a prompt instruction alone
doesn't guarantee compliance — `brain/composer.py` gained
`clean_caption_output()` (deterministically strips `**`/`*` markers,
de-dupes hashtags case-insensitively, caps at `MAX_HASHTAGS=8`, safe to fix
outright rather than spend a retry on) and `check_formatting()` (flags
`< MIN_HASHTAGS=3` hashtags or `> MAX_EMOJI=4` emoji — not safely
auto-fixable, so these do trigger a regeneration, same pattern as
`check_humanizer`).

**Captions still read as AI-written even with the banned-phrase list
enforced.** Removing "elevate your space" doesn't make a caption sound
human if the sentence shape underneath is still doing the same inflating
move. `brain/composer.py` now runs a second agent after the writer:
`caption_reviewer_agent` (judgement-tier model, `skills/caption-reviewer.md`)
reads the mechanically-clean draft as a skeptical real Pakistani Instagram
scroller and either approves it or rewrites it — catching rhythm, structure,
and "does this sound like a real person" issues the mechanical checks can't
express as a rule. `_review_caption()` never blocks the pipeline: if the
reviewer call itself fails, or its own rewrite fails `check_humanizer`/
`check_formatting`, the original writer draft is kept rather than losing an
otherwise-good caption to a review-step outage.

**Deleting a file directly from R2 left the dashboard and worker with no
way to know.** Confirmed live: a user deleted image files from the R2
dashboard directly (outside the app entirely), leaving `assets` rows whose
`r2_key` 404s permanently. Two symptoms: the assets page rendered a raw
broken-image icon with no fallback (`<img>` had no `onError` handler), and
`retag_assets.py` retried the same dead vision-tag call every
`RETAG_ASSETS_CRON` run forever, since a failed vision call just logged and
left `quality_score` untouched — the exact `IS NULL` condition the job
selects on. There was also no delete-asset feature anywhere in the app at
all (no DELETE route, no R2 delete client method, no UI button) — the only
way an asset row could previously go away was via a fresh `drizzle-kit push`
or a manual DB edit.

Fixed on both ends:
- `retag_assets.py` now recognizes OpenRouter/LiteLLM's specific "404 status
  code when fetching image" error and marks the row `quality_score=0` +
  `reject_reason="R2 object not found..."` on that specific failure only —
  a transient failure (rate limit, timeout) still leaves it untouched for
  the next run's retry, only a confirmed-dead image stops being retried.
- The assets page's `<img>` now has an `onError` handler that swaps in an
  "Image unavailable" placeholder card instead of a raw broken-image icon,
  with a **Delete asset** button that appears only once an image is
  confirmed broken.
- New `DELETE /api/assets/[id]` (dashboard) removes the R2 object
  (best-effort — a 404 there is already the goal, not a failure) and the
  `assets` row together. Refuses with a 409 if any `posts` row still
  references the asset (`posts.asset_id` has no `ON DELETE` clause in
  `schema.sql`, so an unchecked delete would 500 on the FK constraint
  instead of explaining why).

**Image/video overlay text was a truncated caption fragment, not a
headline.** `_build_image_props`/`_build_video_props` in `compose_batch.py`
used to do `caption_text.splitlines()[0][:80]` — the first line of the full
caption, hard-truncated at 80 characters (potentially mid-word), because
there was no dedicated generation step for the overlay text at all. The
caption agent now writes a distinct `headline` field (2-5 words, e.g.
"Solid Sheesham, Not Veneer") alongside the caption and hashtags, per
`skills/caption-writer.md`'s new Headline section — it must relate to the
same piece and the same hook as the caption, not be an unrelated tagline.
`write_caption()` returns `(caption, headline, hashtags)`; the reviewer
agent checks and can rewrite the headline too. `check_headline()` enforces
the 2-5 word count in code (same retry pattern as
`check_humanizer`/`check_formatting`); `clean_headline()` strips markdown
the same way `clean_caption_output()` does for the caption.

**compose_batch drafted zero posts with no connected platform credentials.**
`_get_connected_platforms()` returning empty made the whole job return
immediately — but drafting doesn't need real publish credentials, only
`publish_due` does, and it already fails safely (`state='failed'`, a clear
error) when a platform has no token. Now falls back to drafting for every
known platform when none are connected, so there's something to
review/approve while OAuth setup for real platforms is still pending.

**The `templates` table was never seeded.** `registry.ts`'s 6 templates have
always been code constants; nothing ever inserted matching rows into the DB
table `compose_batch.py` joins against by slug — confirmed live: 10 real
uploaded assets, 0 templates, "No candidate asset+template pairs found" on
every run, regardless of asset count. `main.py`'s `_seed_templates()` now
inserts the 6 defaults at worker startup, only when the table is completely
empty (never overwrites an operator's own edits).

**Internal service hostnames have no safe hardcoded default.** Dokploy runs
each app as its own Docker Swarm service with a generated internal hostname
that includes a random per-deployment suffix (confirmed live:
`socialfte-worker-2s66t5`, not `socialfte-worker` and not
`docker-compose.yml`'s `yl-worker`) — `WORKER_INTERNAL_URL` (on the dashboard
app) and `RENDER_INTERNAL_URL` (on the worker app) must be set explicitly per
deployment; check each app's own Dokploy panel for its real name, verify with
`curl http://<name>:<port>/health` (worker) or `/login` (dashboard) from the
*other* app's Dokploy terminal before trusting a guess. Both env vars now
default to `localhost` (correct for local dev, the one case where no env var
is needed) instead of a plausible-looking but wrong guess.

**`AGENT_LOG.md` couldn't be written in Docker.** `audit.py`'s `REPO` path
(three `.parent`s up from its own file) resolves to `/` inside the worker
container — no monorepo root is copied in, just `apps/worker/`'s own
contents (`Dockerfile.worker`) — so every write attempted
`/AGENT_LOG.md`, which the non-root `worker` user can't touch. Falls back to
right next to `audit.py` (`/app/AGENT_LOG.md`, writable) instead of just
logging a warning on every single action; a real host-visible `tail -f` in
production still needs a Dokploy volume mount at that path.

**Jobs management** (`/jobs` in the dashboard, `apps/worker/main.py` +
`scheduling.py` + `job_runs.py` + `job_schedules.py`) went from "list
registered jobs, trigger one" to a full operational view in three parts:

1. *Human-friendly schedules* — `scheduling.trigger_to_cron()` reconstructs
   the actual cron string from APScheduler's trigger object (its own
   `str(trigger)` is a verbose non-cron repr), and `humanize_cron()` renders
   the shapes this app uses ("Daily at 4:00 AM", "Every 15 minutes") —
   falling back to the raw cron for anything more complex.
2. *Run status/history* — every job registration is wrapped in
   `job_runs.tracked()`, which records a `job_runs` row (status,
   started/finished, error) for **every** execution, cron-triggered or
   manual. Both paths go through the same wrapper: the manual endpoint calls
   `job.func()`, which after registration *is* the tracked version; a
   `contextvar` labels which is which without a second code path. `GET
   /jobs` attaches each job's most recent run.
3. *Editable schedules* — `POST /jobs/{id}/schedule` takes a structured
   shape (`every_n_minutes`, `every_n_hours`, `every_n_days`, `hourly`,
   `daily`, `weekly`, `monthly` + the relevant time/day fields),
   `scheduling.build_cron()` turns it into a validated cron expression
   (`InvalidSchedule` on out-of-range input), persists it to
   `job_schedules`, and calls APScheduler's `reschedule_job()` directly — no
   restart needed, and it survives one anyway since `job_schedules` is
   checked at startup before falling back to the `*_CRON` env var default.

**No connected platform credentials → compose_batch drafted zero posts.**
`_get_connected_platforms()` returning empty made the whole job return
immediately. Drafting doesn't need real publish credentials, only
`publish_due` does — and it already fails safely (`state='failed'`, a clear
error) when a platform has no token, confirmed by checking `meta.py`'s
`_get_page_token()`. Falls back to drafting for every known platform when
none are connected, so there's something to review/approve/test before any
OAuth setup exists.

**The `templates` table was never seeded.** `registry.ts`'s 6 templates have
always been code constants; nothing ever inserted matching rows into the DB
table `compose_batch.py` joins against by slug — confirmed live: 10 real
uploaded assets, 0 templates, "No candidate asset+template pairs found" on
every run regardless of asset count. `main.py`'s `_seed_templates()` now
inserts the 6 defaults at worker startup, only when the table is completely
empty (never overwrites an operator's own edits).

**Facebook/Instagram were hardcoded to one fixed format.** The original
`PLATFORM_FORMAT_MAP` said Facebook is always "video," Instagram always
"image" — doesn't match reality (both platforms take either) and fed the
round-robin bug above (a platform whose one fixed format kept failing had
nowhere else to go). Replaced with `PLATFORM_FORMATS` (list of supported
formats per platform) and `_choose_format()`, weighted-random for
Facebook/Instagram via `IMAGE_POST_RATIO` (default 0.7 = 70% image), fixed
for TikTok/YouTube Shorts (video-only).

**A new "retag assets" job catches vision-tagging failures.** The
upload-time `/vision/tag` call is fire-and-forget — if it fails (wrong
internal hostname, LLM timeout), the asset stays untagged forever with
nothing to retry it. Confirmed live: all 10 real uploaded assets had
`piece`/`tier`/`variant`/`quality_score` stuck null after
`WORKER_INTERNAL_URL` was misconfigured at upload time. `retag_assets`
(`RETAG_ASSETS_CRON`, default every 6 hours, also manually runnable from
the Jobs page) finds every asset with `quality_score IS NULL` and retags it.

**Video dispatch's `ref` was hardcoded to the wrong branch.**
`dispatch_render.py` sent `"ref": "main"` to GitHub's `workflow_dispatch`
API — this repo's actual default branch is `master` (confirmed via
`gh repo view`), so every video render dispatch failed with a 422. Now
configurable (`RENDER_WORKFLOW_REF`, default `"master"`). Verified live
after the fix deployed — 3 fresh video dispatches succeeded with no 422.

**Puppeteer's Chrome crash-handler couldn't launch — every still-image
render 500'd.** Confirmed live: `Failed to launch the browser process...
chrome_crashpad_handler: --database is required`. `Dockerfile.dashboard`'s
non-root user is created with `useradd --system`, which gives it no real
home directory, so Chrome's crash-reporting subprocess has nowhere to write
its crash database and the whole browser launch fails before rendering
anything — a documented Puppeteer failure mode for restricted/read-only
containers with no writable profile directory. Two-layer fix:
`XDG_CONFIG_HOME`/`XDG_CACHE_HOME` point at a writable `/tmp/.chromium` in
the Dockerfile (created and chowned to the app user before `USER` switches),
and `render/route.ts`'s `puppeteer.launch()` call gets an explicit
`userDataDir` (`/tmp/.puppeteer-profile`) plus `--disable-crash-reporter` to
skip the crash-handler subprocess outright as a second layer. Not
live-verified — no Chromium binary was available to launch-test against in
the sandbox this was fixed in; needs confirmation on the next real deploy.

**Vision quality scores were on the wrong scale.** Confirmed live: 7 real
assets all scored `quality_score: 9` while *also* marked
`lighting_ok: true` and `composition_ok: true` by the same model call — a
photo the model itself considers well-lit and well-composed shouldn't score
9 out of 100. `skills/asset-tagging.md`'s prompt already said "0-100" but
the model (Gemini 2.5 Flash) was drifting to a 0-10 scale regardless;
hardened the prompt with explicit anchor points (90-100 = studio quality,
below 50 = genuinely poor) and a self-check instruction. Existing
mis-scored rows aren't auto-corrected (the retag job only targets
`quality_score IS NULL`, not "already scored but probably wrong") — reset
`quality_score` to `NULL` by hand for any row you want re-scored under the
fixed prompt.

**Captions had zero brand context.** `write_caption(asset, template, brand)`
accepted a `brand` parameter, but both real call sites in `compose_batch.py`
called it as `write_caption(asset, tmpl)` — `brand` always defaulted to
`{}`. `_build_brand_tokens()` (previously computed redundantly, only inside
the still-image render branch) is now computed once per batch and threaded
into both `write_caption()` calls and the render payload.

**Caption language is now a real, selectable setting.** `brand_config`
gained `caption_language`, exposed as a dropdown in step 2 of the `/setup`
wizard (Roman Urdu + English / English / Urdu), read by
`skills/caption-writer.md` via `brand.language`. Default (unset) is
**Roman Urdu + English** — how Pakistani furniture brands actually write on
social media — not the plain English every caption used before, with no way
to change it (both because brand context never reached the model at all,
per the bug above, and because there was no field for it to read even if it
had).

`skills/caption-writer.md` was also rewritten for tone, after loading the
`humanizer-main` and `social-media-writer` Claude Code skills as reference
(neither runs at request time — the deployed caption agent calls DeepSeek
via OpenRouter directly, not Claude Code — their guidance was used to
rewrite the static prompt file instead). Significance-inflation
("stands as a testament to..."), promotional puffery ("nestled," "boasts,"
"showcases"), superficial "-ing" padding, rule-of-three padding, vague
attribution, and same-length-sentence sameness are now called out
explicitly in the prompt, not just left to banned-phrase matching.
`HUMANIZER_BANNED_PHRASES` (the code-level enforcement list `check_humanizer()`
actually runs) gained ~20 more phrases pulled from the same patterns.
`hallmark` (also loaded as a candidate) turned out to be a page/UI-design
skill with nothing applicable to caption text — not used.

**`render-video.yml`'s GitHub Actions secrets were never actually set.**
Confirmed live: 4 real workflow runs, all failing the same way — the R2
upload step got `Invalid endpoint: https://.r2.cloudflarestorage.com` (an
empty `R2_ACCOUNT_ID`) and the worker-notify step got `curl: (3) URL
rejected: Malformed input to a URL function` (an empty `CALLBACK_URL` and
`RENDER_INTERNAL_SECRET`). `gh secret list` confirmed none of the 6 secrets
`docs/github-actions-setup.md` already documented as required were ever
actually added to the repo — only the 4 Dokploy deploy secrets existed.

Diagnosing this surfaced a real, separate architectural gap:
`CALLBACK_URL` can't point at the worker directly, because the worker has
**no public port at all** (internal-only, Dokploy Docker network) — a
GitHub-hosted runner has no way to reach it. Nothing publicly reachable
existed for the callback to hit. `apps/dashboard/app/api/render-complete/route.ts`
is a new public proxy (the dashboard has a real domain) that forwards the
callback through to the worker's actual `/api/render-complete` over the
internal network, authenticated the same `x-render-secret` way as every
other internal endpoint. `proxy.ts`'s session gate excludes it, same
reasoning as the existing Discord webhook exclusion — a GitHub-hosted
runner has no session cookie either.

**Posts page had no real preview.** Each post only showed a bare "View"
text link when it had a `renderUrl` — no thumbnail in the list, no way to
read a full caption without truncation, no way to watch a video without
leaving the dashboard for a new tab. Post cards now show a real thumbnail
(`<img>` for image posts, a muted `<video>` for video/reel/short formats),
and clicking a card opens a detail popup — full-size image or a real
`<video controls>` player, the untruncated caption, platform/state,
timestamps, and error text for failed posts — closer to how
Instagram/Facebook's own post detail view works.

**Four new still-image templates, built to match `Sample-posts/*.png`
directly.** `bold-headline`, `exclusive-badge`, `light-circle-frame`, and
`sweet-dreams` (`apps/dashboard/components/templates/`) reproduce the
macrostructure of the 4 reference designs (two-tone stacked headline +
circular discount badge; eyebrow + boxed headline + floating badge; a large
circular framed photo with a ring border; a split dark panel with a
stacked-word headline) using brand tokens throughout, not hardcoded colors
— any brand's `/setup` palette renders correctly through them. Registered
in `registry.ts` (required props: `imageUrl` + `headline` only, matching
`hero`/`carousel-slide`'s convention) and in `main.py`'s
`DEFAULT_TEMPLATES`. Badge text, CTA label, and phone number are all
optional with either an in-component default or honest omission — nothing
fabricates a discount percentage or phone number that compose_batch.py has
no real field to generate from (CLAUDE.md: no unauthorized prices).
`BrandBadge` gained a `variant="lockup"` mode (prominent top-left
logo+wordmark) since all 4 samples brand every post that way, distinct from
the existing small bottom-right `variant="corner"` pill every other
template already used.

**`_seed_templates()` only ever seeded once, ever.** It only inserted
`DEFAULT_TEMPLATES` when the whole `templates` table was empty — so adding
the 4 templates above to `DEFAULT_TEMPLATES` would have silently never
reached a live, already-populated table on restart, the same way
`before-after` is registered but was never added to `DEFAULT_TEMPLATES` in
the first place. Now inserts whichever slugs are missing on every startup,
without touching rows that already exist (an operator's own edits/
deletions are still preserved) — a genuinely additive migration path
instead of a one-shot bootstrap.

**Video format for the same 4 templates** maps to existing Remotion
compositions via `VIDEO_COMPOSITION_MAP` — `light-circle-frame` →
`DetailFocus` ("circular reveal detail shot" is a direct match),
`exclusive-badge` → `PromoHighlight` (built for this exact aesthetic
earlier the same week), `sweet-dreams` → `LifestyleFrame`, `bold-headline`
→ `HeroReveal`. Fixing this also surfaced that `DetailFocus`/`LifestyleFrame`/
`PromoHighlight` had no branch in `_build_video_props()` at all — any
existing `detail-focus`/`lifestyle` video post was rendering with
`DetailFocus`'s required `detailName` prop undefined. All three now get the
generated headline the same way every other composition does.

**Three tests were quietly broken by concurrent changes, unrelated to the
templates work above but caught while running the full suite before
committing it.** `compose_batch()`'s platform selection was switched from
`_get_connected_platforms()` to a new `_get_target_platforms()` (Settings
page's platform picker) without updating the 5 tests that still mocked the
old, now-dead function — the real `_get_target_platforms()` ran unmocked
against a fake session, returning a `MagicMock` where a list was expected,
and `platforms[attempt % len(platforms)]` divided by a `MagicMock`'s
default `__len__` of `0`. Separately, `QUALITY_SCORE_REJECT_THRESHOLD` was
lowered from 60 to 40 (Gemini under-scoring good photos), but two tests
still asserted rejection at exactly `quality_score=40` — `< 40` no longer
rejects a score of `40` once the threshold itself is `40`. Fixed by
re-pointing the mocks at the real function name and asserting strictly
below the threshold (imported, not hardcoded, so a future threshold change
can't silently reintroduce the same off-by-one).

**`create_concepts.py` (the Phase 1 creative-planning job — headline/
caption drafts a human reviews and approves on `/concepts` before
`compose_batch` can use them) existed only as a manually-invoked script,
never registered with the scheduler.** The dashboard's own Concepts page
told the operator to "run the create_concepts job first," but there was no
such job on the Jobs page to run — fixed by registering it in `main.py`'s
`job_definitions` with a new `CREATE_CONCEPTS_CRON` setting (default
weekly, Sundays 06:00).

Its content generation was also canned English-only template strings, not
real generation — confirmed to directly violate this project's own rules:
one template used "elevate your home" verbatim (a `HUMANIZER_BANNED_PHRASES`
entry), most used em dashes, several exceeded the 1-3 emoji rule, and none
of it went through `check_humanizer`/`check_formatting`/`clean_caption_output`
at all, since concepts never called `write_caption()`. `write_caption()`
gained an optional `creative_direction` parameter (a one-line steer like
"Emphasize value, savings, and smart purchasing decisions", backward
compatible — existing callers don't pass it) so `create_concepts.py` can
generate each concept type's angle through the exact same writer+reviewer
pipeline, humanizer checks, and Roman Urdu default every regular post
already gets, instead of a parallel path with none of those guarantees.
Generates `CONCEPT_VARIATIONS = 3` real headline/caption pairs per concept
(down from the canned version's free 5/3) since real generations cost
actual model calls — a full run is up to 10 assets × 2 concepts ×
3 variations × 2 agent calls (writer + reviewer) = up to 120 real model
calls, worth knowing before pointing this at a tight OpenRouter budget. The
3 variations per concept run concurrently (`asyncio.gather`), not one at a
time — a sequential version made a real run take 20-40+ minutes and looked
"stuck at 1 concept" to an operator checking a few minutes in.

**`/api/internal/render` (the Puppeteer screenshot route) never checked
whether the page it navigated to actually loaded.** Confirmed live: a real
published post's `render_url` was, byte for byte, a screenshot of Chrome's
own "This page couldn't load — a server error occurred" interstitial, not
the actual template — uploaded to R2 and returned as a successful render.
`page.goto()` only rejects for network-level failures (DNS, connection
refused, timeout); a transient non-2xx from `/render-preview` itself (a
cold-start hiccup, a DB blip) still completes the navigation, and Chrome
swaps in its own error page in place of the real content, which the code
then dutifully screenshotted. Fixed by checking `response.ok()` after
`page.goto()` and throwing (caught, returned as a 502 with a real error
body) if it isn't. A related gap in the same route: broken `<img>` loads
were already detected (a leftover `naturalWidth === 0` check) but only
`console.error`'d inside the browser itself — invisible outside Puppeteer,
and the render proceeded anyway with a broken image icon in the shot. Now
a failed image load fails the render the same way. `compose_batch.py`'s
existing `resp.raise_for_status()` around this call already does the right
thing once the route actually reports failure — it just never used to.
Scanned all 28 posts with a `render_url` for this exact byte-size
fingerprint after the fix; only the one reported was affected — this was a
rare transient failure, not a systemic one.

**Redesigned all 10 still-image templates for real structural variety**,
after the user flagged that posts "aren't attractive" and real renders
confirmed it: most templates shared the same "full photo + dark gradient +
serif headline + pill CTA" formula, several used a glassmorphism card
(`rgba(255,255,255,0.08)` white glass) that was invisible on light
backgrounds (`quote.tsx`, `set-breakdown.tsx`), 5 templates hardcoded an
off-brand `#d62828` red instead of `brand.colors.accent`, and `hero.tsx` /
`bold-headline.tsx` / `sweet-dreams.tsx` were missing the emoji/glyph-strip
fix already applied to the other 7 (confirmed live: a broken glyph box in a
real headline). Reference DNA pulled from
`docs/daily-linkedin-posts-pipeline/linkedin-infographic-template.html` (a
different, unrelated pipeline the user pointed at as a design reference) —
a two-tier type pairing (bold upright serif headline + a small italic
serif accent, not a box-highlight background) and a hairline-rule footer
instead of another glass panel — applied through `brand.fonts.heading`'s
existing upright/italic forms, no new fonts introduced. `hero.tsx` and
`carousel-slide.tsx` were near-duplicate macrostructures; differentiated
by moving `carousel-slide` to text-directly-on-photo (no glass panel) with
a small rect slide-counter instead of a pill. `set-breakdown.tsx` gained
an optional `imageUrl` prop (wired through `compose_batch.py`) since it
previously had no image slot at all and rendered mostly blank space when
`pieces` is empty — the common case, since compose_batch has no real
per-piece pricing data to populate it with. `price-card.tsx` was rebuilt
directly in the linkedin-infographic style (eyebrow badge, bold headline,
italic-accent price, hairline footer) since it has no photo dependency to
begin with — the strongest fit for a typography-led treatment.

Visual QA done with the `agent-browser` skill against a local dev server
(this sandbox has no working headless Chrome otherwise, and chrome-devtools
MCP was down) — caught two real bugs invisible from code review alone:
`price-card.tsx`'s default corner `BrandBadge` overlapped its own CTA
button (removed — the template's footer already shows the wordmark), and
`exclusive-badge.tsx`'s boxed headline vertically overlapped the photo
below it, which painted on top and clipped the text (increased the image's
top offset for clearance). Also confirmed live: this WSL environment's
`/mnt/d/`-backed filesystem doesn't reliably deliver file-watch events to
Turbopack's dev server — an edit that doesn't seem to take effect after a
save needs a full dev-server restart, not just a page reload.

**Gave `set-breakdown.tsx`'s piece list a RANKED_BARS treatment**, following
up on the still-unused parts of `docs/daily-linkedin-posts-pipeline/` (a
separate, unrelated LinkedIn content pipeline dropped into `docs/` as a
reference). Its `skills/illustration-formats/SKILL.md` documents a
RANKED_BARS infographic format that maps directly onto a priced item list:
an italic serif rank numeral, a bold label, a horizontal bar sized
proportionally to the value, the value itself set bold at the far right,
and three color tiers by rank (top = full accent, next two = accent at
reduced opacity, rest = dark at reduced opacity). Replaced the plain
hairline-divided rows with this. Bar width is only ever computed from a
real numeric value parsed out of the price string (`parsePriceValue`); a
piece whose price doesn't parse gets an honest full-width bar instead of a
fabricated proportion, keeping with the no-invented-numbers rule applied
everywhere else in this codebase. Verified with a 4-piece real-data test
(`agent-browser` screenshot against the local dev server) — bar widths and
tier colors matched the underlying values exactly, no overlap with the
bundle-price/savings row below. Other parts of that pipeline's skills
(the `branded-carousel` 7-slide brand-research system, its own
`render.js`) were read and deliberately not ported — they assume a
different data shape and brand-scraping workflow than SocialFTE's
single-own-photo-per-post model, and SocialFTE's own render route (after
the earlier fix above) is already more robust than the reference one.

**`compose_batch` was composing 1 of its 5 target posts per run**, confirmed
live from production logs: a run would compose exactly one post, then log a
"batch shortfall" with 14 more shortfall reasons — all of them "asset X
already used in this batch" or "anti-repeat rejected for asset X", every
single one naming the *same* asset ID that had already been composed. The
candidate pool for that entire run was, in other words, one single asset
paired with 14 different templates — there was nothing else to fall back
to. Root cause in `_pick_candidates()` (`jobs/compose_batch.py`): it built
the (asset, template) candidate list with a nested loop — every template
against `assets[0]` first, only moving on to `assets[1]` once
`MAX_ASSET_TEMPLATE_COMBOS` (15) was reached. The DB has 20 templates, and
with only 2 of those price-focused (excluded 80% of the time), the regular
template pool alone (18) already exceeds 15 — so the inner loop filled the
entire candidate list from `assets[0]` before the outer loop ever got to
check `assets[1]`. Any one bad asset (already used, anti-repeat-rejected)
then burned through the whole batch's remaining attempts instead of just
its own. Fixed by interleaving round-robin instead: candidate `i` pairs
`assets[i % len(assets)]` with `templates[i % len(templates)]`, so
consecutive candidates vary both asset and template. Added
`test_pick_candidates_interleaves_across_assets` (11 mock assets, 18 mock
templates — the real prod shape) asserting the candidate pool spans all 11
distinct assets instead of 1.

**Increased `hero.tsx`'s gradient scrim opacity** — the bottom-left dark
gradient behind the headline/CTA text was too light against brighter
source photos (light walls, windows, sky), thinning out contrast. Bumped
the gradient stops from 60%/27% dark to 90%/60%, and pushed the fade point
out from 65% to 70%, so text stays legible across more of the catalog's
photos.

**Fixed two real overlap bugs in `exclusive-badge.tsx` and
`light-circle-frame.tsx`**, both confirmed live from real post renders and
reproduced exactly with the same headline text:

- `exclusive-badge.tsx`'s gold-outlined headline box and the photo below
  it were both absolutely positioned, with the photo's `top` a hardcoded
  fraction of the canvas height tuned for a short headline. A longer
  headline ("Your Daily Routine, Upgraded.") wraps to 2 lines, making the
  header block taller than that fixed offset assumed, so the box's bottom
  edge visually overlapped the photo. Fixed structurally instead of
  tuning another magic number: the header, photo, and footer are now a
  flex column, so the header's real rendered height — whatever it turns
  out to be for a given headline — pushes the photo down via normal flow.
  This can't recur regardless of headline length. The floating discount
  badge (previously positioned relative to the whole canvas) now
  positions relative to the photo's own container instead, since that
  container no longer has a fixed size.
- `light-circle-frame.tsx`'s eyebrow+headline block had no `maxWidth` at
  all, so a headline long enough to want the full canvas width
  shrink-to-fit nearly edge-to-edge, overlapping the top-left wordmark
  ("Elegance That Fits Your Budget" reproduced this exactly). Added
  `maxWidth: '54%'` to force it to wrap sooner. That then pushed the
  (now 2-line) block low enough to touch the circular photo frame's top
  edge, so the circle was also shrunk (0.82 → 0.72 of the canvas) and
  recentered lower (top 55% → 60%) to give the header real clearance
  without running the circle's bottom off-canvas. Verified against both
  a 2-line and a short 1-word headline to confirm neither overlaps nor
  leaves an awkward empty gap.

**Gave `quote.tsx` a real background** instead of a flat
`brand.colors.light` fill — flagged live as "looking very empty" next to
the rest of the photo-driven lineup. Reuses the same asset photo
`compose_batch` already passes in as `thumbnailUrl`, full-bleed behind a
heavy dark gradient scrim (`brand.colors.dark` at ~94%/85% opacity), so
only the photo's texture and mood come through rather than a clear,
competing product shot — the quote text stays the focus. Text colors
flipped to light-on-dark to match the now-dark background.

**Fixed the actual root cause of "why are all the posts black + white +
gold, where's the forest green or crimson"**: the live `brand_config` DB
row has every color column `NULL` (the /setup wizard has never been able
to write brand colors — config.py's own comment already flagged this gap),
so every render was falling back to `config.py`'s hardcoded defaults.
`BRAND_DARK_COLOR` defaulted to `#1A1A1A` (near-black) — and `dark` is the
single most-used color token across all 10 templates (37 uses, vs. 3 for
`primary`, which already held the correct green). Checked every actual
design reference this brand's templates were built from
(`Sample-posts/Bold Headline.png`, `Exclusive + Save Badge.png`, `Light
Circle Frame.png`, `Sweet Dreams.png`) — every one uses the same deep
forest green for its dark background, never black. Changed
`BRAND_DARK_COLOR`'s default to `#1B4332` (matching `primary` and every
reference), which immediately fixes all 7 dark-background templates (plus
`quote.tsx`'s new dark background above) without touching a single line
of template code.

Also added two new brand color tokens (`BrandTokens.colors.secondary`,
`.ink`; new `secondary_color`/`ink_color` columns on `brand_config`,
migrated live; new `BRAND_SECONDARY_COLOR` (`#9A2A2A`, crimson) /
`BRAND_INK_COLOR` (`#161616`) env defaults; wired through
`_build_brand_tokens()`):

- `secondary` (crimson) — for the occasional highlight-box treatment seen
  in `Sample-posts/post-popup.png`: a solid-color box behind one
  emphasized headline word ("Furniture your **dulhan** deserves."), not a
  base color. `hero.tsx`'s `highlightWord` now renders as a solid
  `brand.colors.secondary` box with light text instead of italic gold —
  reproduced the reference almost exactly.
- `ink` (true near-black) — for templates that deliberately run a
  black+bone+white+crimson variant instead of the brand's usual green,
  so a batch of posts shows real visual variety instead of every
  dark-background template converging on the same look now that `dark`
  is green. Converted `bold-headline.tsx` and `exclusive-badge.tsx` to
  this variant (background `ink`, every gold accent swapped to
  `secondary`); the other 8 templates stay on green+gold+cream.
  While wiring `exclusive-badge.tsx`'s floating discount badge into this
  variant, found and fixed a real clipping bug along the way: the badge
  is a child of the photo container and intentionally floats outside its
  bounds (negative `right`), but that container also had
  `overflow: hidden` for the image's rounded corners — clipping the badge
  along with it, so it silently never rendered even with `badgeText`/
  `badgeValue` set. Split image-clipping onto its own inset layer,
  separate from the container the badge is positioned against.

**Reworked the Jobs page's "Run Now" status tracking, and gave Posts/Concepts
their own run buttons** — user feedback: "the run job buttons should be on
top, like on posts page add a compose button... make sure the status will
change correctly currently its not changing the status of job."

Root cause of the status bug: `/jobs/{id}/run` only *dispatches* the job
(`asyncio.create_task(job.func())`) and returns immediately — it doesn't
wait for the job to finish. The Jobs page's old `runJob()` cleared its own
"Running..." button state the instant that near-instant POST resolved, and
did a single refetch 1.5s later to pick up the real status. That worked for
quick jobs but missed slow ones entirely (`compose_batch` commonly runs
30-60s), so the status badge looked permanently stuck on "Running..." until
a manual page refresh. Fixed by polling `/api/jobs` every 2s (2-minute cap)
until the specific job's `last_run.status` actually leaves `"running"`,
keeping the button's own state in sync with the real job the whole time.

Also added the same fire-and-poll pattern as standalone buttons on the
pages where each job's output actually shows up, instead of only being
reachable from `/jobs`: a **Compose** button on the Posts page top bar
(triggers `compose_batch`, then refetches posts) and a **Generate
Concepts** button on the Concepts page top bar (triggers `create_concepts`,
then refetches concepts).

**Gave the Dashboard home page's Recent Activity real detail, pagination,
and pipeline grouping** — was a flat, undifferentiated list of the last 10
audit_log rows, each entry showing only its action label, a truncated
subject ID, and a timestamp; the entry's own `payload` (e.g. a
`batch_shortfall`'s 14 real reasons) was fetched but never rendered.
`/api/stats` now also selects `actor` (already written by every
`write_audit()` call, e.g. `"compose_batch"`, `"create_concepts"` — just
never selected before) and accepts `activityLimit`/`activityOffset` query
params for a "See more" button instead of a hard `LIMIT 10`. The dashboard
groups consecutive same-actor entries together under one heading (so a
`compose_batch` run's caption-generated/anti-repeat-checked/post-composed
events read as one pipeline instead of unrelated events) and renders a
short inline summary of each entry's payload fields, with the full JSON on
hover. Verified against live production data.

**Fed the user's real headline/caption examples into `skills/caption-writer.md`**,
the actual prompt `write_caption()` uses — the user first asked for
sample headings/subheadings and full captions as a one-off writing task,
then explicitly asked why they hadn't been wired into the agent's own
prompt. Added: a "no exclamation marks, ever" rule plus curated short
headline examples in the Headline section; a new "Brand facts (Yousuf
Living)" reference block (5-piece set pricing, Shaadi Package, 15-day
build time, 1-year warranty, 30% advance, Manzoor Colony location, custom
fabric/size, workshop-direct) for the model to draw from only when
relevant to the specific post; a new "Caption structure — hook, body, CTA"
section with the exact 4-part shape and 12 curated real hook/body/CTA
examples spanning product-led, price/value, emotional, curiosity, urgency,
and trust angles. Also promoted "amazing"/"stunning"/"luxurious" from
prose-only guidance to real code-enforced entries in
`HUMANIZER_BANNED_PHRASES` (they were listed in the .md but never actually
in the enforced list), and added a code-level exclamation-mark check to
`check_headline()` — fixed one existing "correct usage" example in the doc
that itself contained an exclamation mark, which directly contradicted the
new rule.

**Concepts now get retired once their post is approved** — user feedback:
"if a post is generated from a concept and also approved, the concept
should also be removed... we have to remove it after post approval."
Root gap: `posts` had no link back to the concept it was composed from at
all (no `concept_id` column) — `schema.sql` was even missing the
`concepts` table definition entirely, despite being declared the source
of truth for models.py/schema.ts (added it, matching what was already
live in the DB and in models.py). Added `posts.concept_id` (nullable FK
to `concepts.id`), set by `compose_batch.py` whenever `_get_approved_concept()`
supplied the caption/headline. When the dashboard approves a post
(`PATCH /api/posts/[id]`) and that post has a `concept_id`, the concept is
soft-retired to a new `state='used'` — the row and its headlines/captions
stay for history, but it drops out of `_get_approved_concept()`'s
`state = 'approved'` query so it can never be reused. Before this, an
approved concept stayed in the reusable pool forever, generating more and
more posts off the same creative indefinitely. Added a "Used" filter tab
to the Concepts page.

**Manual approve/reject override + bulk actions on Posts and Concepts** —
user feedback that anti-repeat/render rejections were leaving posts stuck
with no way to manually push them through. The Approve/Reject buttons on
the Posts page were gated to `state === "review"` only — a post that
landed in draft/render/failed/skipped (an anti-repeat rejection, a render
hiccup) had no path back to approved at all from the UI. Both buttons are
now always available except on already-terminal states (`approved`/`publish`
hides Approve, `failed`/`publish` hides Reject). Same fix on the Concepts
page (was gated to `state === "draft"` only). Added bulk "Approve
selected"/"Reject selected" next to the existing bulk delete on both
pages — implemented as parallel per-item PATCH calls (not a dedicated
bulk-state endpoint) so bulk approval on Posts gets the concept-retirement
side effect above for free instead of duplicating that logic.

**Asset selection was picking "line by line" instead of randomly** — user
added 150+ new assets in one batch, several the same item in different
colors/variants, and noticed compose_batch/create_concepts kept picking
near-duplicate variants back to back. Root cause: both
`compose_batch.py`'s `_pick_candidates()`/`_pick_distinct_images()` and
`create_concepts.py`'s `_pick_assets_needing_concepts()` order assets by
`times_used ASC` (correct — prefer under-used assets) but used
`created_at DESC` as the tiebreaker. With a large batch of fresh uploads
all tied at `times_used=0`, that tiebreaker is deterministic upload
order — exactly "line by line". Changed the tiebreak to `func.random()`
in all three places: still prioritizes least-used assets, but randomizes
which of the tied ones comes first each run.

**Investigated the garbled captions flagged from live posts** — one
post's caption contained Nastaliq Urdu script mid-caption, another
contained a literal `???` exactly where an emoji clearly belonged. Traced
both against the actual DB rows (raw UTF-8 bytes, not a terminal display
artifact — `??` really is three ASCII `0x3F` bytes) and their audit_log
history. Scanned all posts: each pattern occurs in exactly 1 of 29
posts — rare, not systemic. Directly tested `check_humanizer()` against
the exact leaked Nastaliq text with the current code: it correctly
rejects it, so that specific post is very likely a historical artifact
from before this pipeline was fully wired up, not a reproducible gap in
current code. The `???` pattern, though, had no check at all — added one:
`check_formatting()` now rejects 2+ consecutive `?` characters (not
legitimate punctuation in any real caption) as a "likely garbled emoji"
violation, so a future occurrence gets caught and regenerated instead of
published.

**`carousel-slide.tsx` really was still overlapping the corner badge** —
flagged live again with a fresh (same-day) render, disproving the earlier
conclusion that this was a stale pre-fix screenshot. The text block had
`left:0, right:0, padding` with no reservation for the bottom-right corner
`BrandBadge` (the `@handle` pill), unlike `hero.tsx`'s own text block,
which does reserve `paddingRight` for exactly this reason. A short
headline ("Max Savings, Smart Style", the one used to test this earlier)
never reached far enough right to notice; a longer one within the same
2-8 word limit ("Smart style, smart savings") does, and visually collided
with the badge. Added `paddingRight: width * 0.22` matching hero.tsx's
approach. Verified against the exact headline from the live screenshot —
clean separation now.

**`publish_due` and `notify_review` never picked up any post that hadn't
been explicitly scheduled** — surfaced while connecting real Facebook/
Instagram credentials for the first time: the operator approved ~44
posts, `publish_due` kept running every 15 minutes reporting "No posts
due for publishing," and none of them ever went out. Root cause,
confirmed directly against the live DB: every one of those 44 approved
posts has `scheduled_at = NULL` — approving a post via the dashboard or a
Discord approval card never sets `scheduled_at` at all; only dragging a
post onto the Calendar does. Both jobs' queries used a bare
`Post.scheduled_at <= <cutoff>` comparison, and in SQL a NULL comparison
is neither true nor false, so it's silently excluded from the `WHERE`
clause — every approved-but-unscheduled post was invisible to
`publish_due` forever, and the same bug meant `notify_review` never sent
a Discord approval card for an unscheduled review post either. Fixed
both to `or_(Post.scheduled_at.is_(None), Post.scheduled_at <= <cutoff>)`
— NULL now means "due now" (approve with no explicit schedule = publish
on the next tick), the same convention this codebase already uses for
credential expiry (`None` => not expiring, not excluded). Added a
regression test to each job asserting the compiled query actually
contains `IS NULL`, since the existing mocked tests all stub
`session.execute()` directly and wouldn't otherwise exercise the real
WHERE-clause semantics.

One side effect worth noting for whoever reads this later: one of the 44
approved posts had previously failed for a real reason and was swept
into `approved` by a bulk-approve (this session's own bulk-action
feature doesn't distinguish *why* something failed) — once this fix
deploys, it'll be retried and may fail again for its original reason.
`publish_due.py` still records that as `state='failed'` + `post.error` +
an audit_log entry regardless of Discord — the failure is never lost,
just not proactively pushed anywhere.

**Connected real Facebook Page + Instagram credentials for the first
time** — confirmed via direct read-only Graph API calls against the live
token (fetching Page name, then Instagram Business Account name/username)
that `META_APP_ID`/`META_APP_SECRET`/`META_PAGE_ID`/`META_PAGE_TOKEN`/
`META_IG_USER_ID` are all correctly wired. Also corrected a stated-but-
unverified claim from earlier in this same conversation: `DISCORD_BOT_TOKEN`/
`DISCORD_CHANNEL_ID` are both blank in `.env`, and `notify/discord.py`'s
`send()` raises immediately when either is missing — `publish_due.py`
catches that and only logs it, so no Discord notification actually goes
out on a publish failure right now, despite an earlier message in this
session asserting one would. The failure itself is still fully recorded
(state, error, audit_log) regardless; only the proactive Discord ping is
missing until that's connected separately.

**Added `alt_text` to Facebook/Instagram image publishing** — the one
concrete "social SEO" lever the Graph API supports that wasn't wired up:
Meta indexes `alt_text_custom` (Facebook Page photos) and `alt_text`
(Instagram image posts only — not Reels/Stories, confirmed against
Meta's Content Publishing docs) for accessibility and discoverability.
Built from real asset data only: `asset.piece` (a structural field like
"bed"/"wardrobe") is used, but `asset.tier`/`asset.variant` are
deliberately excluded — those are pricing labels ("Premium", "Save 40%"),
not visual descriptors, so including them would produce nonsense like
"Save 40% Premium bed". No `piece` on record means no `alt_text` sent at
all, never a generic placeholder — same no-fabricated-content rule this
codebase already applies everywhere else (set-breakdown's bar
proportions, the caption-writer's brand-facts block, etc.).

**First live production run of the fixed `publish_due` surfaced two more
real bugs**, both diagnosed against the live worker logs and the actual
Graph API:

- **A YouTube post with no `client_secret.json` crashed the entire job**,
  not just that one post. `publishers/youtube.py`'s `get_creds()` called
  `sys.exit(...)` when the credentials file was missing — appropriate for
  its CLI entry point (`main()`), fatal here: `get_creds()` is also
  called from the live `publish_due.py -> upload_video()` path, and
  `SystemExit` is a `BaseException`, not an `Exception`, so it skips
  `publish_due.py`'s `except Exception` entirely. Confirmed live: the
  job's traceback showed exactly this, and because the crash happened
  before the post's state could be set to `failed`, every subsequent run
  hit the same post and crashed again — permanently wedging every post
  queued after it (Facebook, Instagram, TikTok, all of them) behind one
  unconfigured YouTube post. Fixed by raising a normal `RuntimeError`
  instead — `publish_due.py` now catches it, marks just that one post
  failed, and continues to the next as designed.
- **Every Facebook publish attempt failed with a 403** — `"(#200) The
  permission(s) publish_actions are not available. It has been
  deprecated."` Diagnosed live (a direct, unpublished-container Graph API
  call reproduced the exact failure, then confirmed the fix before
  touching any code) that `META_PAGE_TOKEN` held the Business Manager
  System User's own identity token — valid for proving the System User
  manages the Page, but not itself a token Graph API will accept for
  posting *as* that Page. The actual required token is a further-derived
  Page-scoped token (`GET /{page-id}?fields=access_token`, authenticated
  with the System User token) — a well-documented, common trap (Meta's
  own developer forum has several open threads about exactly this
  token-type confusion). Fixed `_get_page_token()` in
  `publishers/meta.py` to auto-derive the real page token on every call
  rather than trusting whatever's configured is already page-scoped, with
  a graceful fallback to the configured token as-is if the derivation
  call itself fails (covers the case where an operator *does* paste an
  already-page-scoped token in some future setup). Verified against the
  live Page with real (unpublished, then deleted) test posts before and
  after the fix.

**With both of those fixed, `publish_due` posted 33 real Facebook posts
in about 6 minutes — 27 of them in an 11-second-apart burst.** Root cause
was a redundant second Graph API call in `post_image()`
(`publishers/meta.py`): unlike Instagram's genuine two-step
container-then-publish model, Facebook's `/{page-id}/photos` endpoint
publishes immediately on the *first* POST (`url` + `caption`, no
`published` param — defaults to `true`). The old code always made a
second "publish the container" call anyway. That call sometimes returned
400 for a photo that had already gone live from the first call, which
made `post_image()` raise — so `publish_due.py` marked an
already-successfully-published post as `failed`. Two compounding
effects: the daily cap check (`CAP_FACEBOOK_PER_DAY`, counts only
`state='published'`) never engaged, since posts never reached that
state despite being live, and every one of those wrongly-`failed` posts
was sitting in the dashboard's approval queue ready to be re-approved
into a live duplicate. Diagnosed by cross-referencing the actual
worker logs, a live paginated fetch of the real Facebook Page's post
history (33 posts, timestamps matched exactly), and the DB's `error`
column — not by guessing. Fixed by removing the second call entirely;
`post_image()` now does one POST and reads the post ID straight from
that response. The 27 posts confirmed live were manually reconciled to
`state='published'` in the DB (SQL run directly by the operator against
Neon) so they can't be re-approved into duplicates; the other 15
`failed` Facebook posts from that run (8 pre-token-fix 403s, 7
unsupported-video-format errors) were confirmed via the same Page fetch
to never have gone live, and are safe to re-approve once resolved.

**A real caption came back with "Headline: ..." and "Hashtags:" showing up
as literal text inside the post body.** Same category of bug as the
already-fixed inline-hashtag duplication above, just with explicit
labels: the model sometimes echoes its own separate `headline`/
`hashtags` output fields back into the `caption` field's text, even
though both already exist independently (the headline is rendered on
the image itself; the real hashtags get appended after the caption by
`compose_batch.py`). `clean_caption_output()` in `brain/composer.py` now
strips any `Headline: ...` line outright and drops a bare `Hashtags:`
label (the actual tags on that line still get picked up by the existing
inline-hashtag pass). `skills/caption-writer.md`'s rule 0 now also says
explicitly not to echo either field back into the caption.

**Added a real phone/website mention to the caption CTA.** `BRAND.md`'s
own Contact section had WhatsApp listed as "to be filled" and no website
field at all, and `_build_brand_tokens()` never passed a phone number or
URL to the caption prompt — so implementing this properly meant getting
the actual number (`+92 313 045 3565`) and site (`yousufliving.pk`) from
the operator rather than inventing one, the same no-fabrication rule
`alt_text` already follows. Both now live in `brand_config.phone`/
`.website` (falling back to `BRAND_PHONE`/`BRAND_WEBSITE` env vars,
matching every other brand token's DB-then-env fallback), reach the
caption prompt as an explicit `Contact: phone=..., website=...` line
(same reasoning as `language` getting called out on its own line rather
than left buried in the raw context dict), and `skills/caption-writer.md`'s
CTA rule now uses them when set. Critically, the prompt states outright
when either is "not set" — the model is told not to mention a phone/
website at all in that case, never to reuse an example from elsewhere in
the prompt or invent one.

**Facebook/Instagram video posts were failing with "Unsupported Facebook
format: video."** `compose_batch.py`'s `PLATFORM_FORMATS` labels
Facebook/Instagram's video format `"video"`; `publish_due.py`'s
`_dispatch_publisher()` only recognized the literal string `"reel"` for
those two platforms. Not a real platform limitation — `post_reel()` and
`post_ig_reel()` (in `publishers/meta.py`) are already the only Facebook/
Instagram video publishers that exist (their own docstrings call
themselves "reel/video"), so this was purely a naming mismatch between
the two modules. Fixed by having both branches treat `"video"` as an
alias for `"reel"`.

**The Calendar screen wasn't showing published posts, and looked stuck.**
`app/api/posts/route.ts`'s week view filtered and bucketed every post by
`scheduledAt` alone. `scheduledAt` is commonly NULL — `compose_batch.py`
doesn't always set one, and neither the manually-reconciled Facebook
posts nor their Instagram cross-post drafts ever got one — and
`column >= x` is NULL (excluded), not true, when `column IS NULL`. Same
NULL-comparison trap already fixed twice on the worker side
(`publish_due.py`, `notify_review.py`), just not yet on the dashboard
side: every post with a NULL `scheduledAt` was invisible on every week
view, forever, including the 27 confirmed-live Facebook posts. Fixed
with a `displayDate()` helper — `publishedAt` if the post has one (shows
on the day it actually went out), else `scheduledAt`, else `createdAt` —
so nothing with a NULL `scheduledAt` disappears. The cap-progress bar's
count was also missing `published` from the states it counts (it only
counted queued `review`/`approved`/`tiktok_ready`), which didn't match
what the worker's `_check_platform_cap()` actually counts — added.

**Added a platform filter to the Posts page.** Client-side on top of the
existing (server-side, state-filtered) list — the full list is already
in memory, so a second query param wasn't needed. Checked the Concepts
page for the same request first: concepts have no `platform` column at
all (`db/models.py`'s `Concept` — a concept is one asset + creative
direction, reused across whichever platform a later post composes it
for), so there's nothing to filter by there without inventing a field
that doesn't reflect anything real.
