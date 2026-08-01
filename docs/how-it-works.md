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
calls, worth knowing before pointing this at a tight OpenRouter budget.
