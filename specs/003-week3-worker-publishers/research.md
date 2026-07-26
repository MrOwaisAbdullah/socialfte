# Research: Week 3 — Worker, Publishers, Discord, Cron

**Date**: 2026-07-27
**Scope**: Worker architecture, platform APIs, Discord interactions, cron scheduling

---

## Decision 1: FastAPI over Flask

**Options**: FastAPI, Flask, Django
**Choice**: FastAPI

**Rationale**:
- Native async/await support (critical for httpx calls to platform APIs)
- Pydantic integration for request/response validation
- Auto-generated OpenAPI docs (useful for debugging)
- Modern Python ecosystem standard

**Tradeoffs**:
- Slightly more complex than Flask for simple cases
- Worth it for the async HTTP calls to Meta/YouTube/TikTok APIs

---

## Decision 2: APScheduler over Celery

**Options**: APScheduler, Celery + Redis, RQ, dramatiq
**Choice**: APScheduler

**Rationale**:
- No external broker required (Redis is optional, not required)
- Deterministic cron-like scheduling (matches §9's fixed schedule)
- Simple in-process execution (no worker pool complexity)
- Memory footprint fits in 1g container limit

**Tradeoffs**:
- No distributed task queue (fine — single worker instance)
- No retry persistence (we handle retries manually in publisher code)
- No result backend (we use audit_log instead)

---

## Decision 3: Discord Bot over Webhook for Sending

**Options**: Webhook (outbound only), Bot (bidirectional)
**Choice**: Bot for sending, Webhook for receiving

**Rationale**:
- Webhooks cannot send messages with components (buttons)
- Bot can send embeds with interactive buttons
- Webhook endpoint receives button clicks (ed25519 verified)
- Two separate concerns: sending (bot) vs receiving (webhook)

**Tradeoffs**:
- Bot token must be kept secret (more sensitive than webhook URL)
- Required for the approval UX (buttons are non-negotiable per §4a)

---

## Decision 4: Ed25519 Signature Verification

**Options**: tweetnacl, pynacl, cryptography library
**Choice**: tweetnacl (via `nacl` package)

**Rationale**:
- Matches the spec's TypeScript example (§4a)
- Simple, well-audited library
- NaCl/libsodium binding — battle-tested crypto

**Tradeoffs**:
- C extension (might need build tools in Docker)
- Alternative: `pynacl` is more maintained, same underlying lib

---

## Decision 5: Token Refresh Strategy

**Options**: Proactive refresh (7 days before), reactive refresh (on failure), hybrid
**Choice**: Proactive refresh at 7 days (§9: 03:00 daily)

**Rationale**:
- Meta long-lived tokens last ~60 days
- Refresh at day 55 (60 - 5 buffer) = proactive
- Matches §5's explicit instruction: "Refresh it before day 55 or publishing dies silently"
- AGENTS.md rule: "Never publish using a credential where credentials.expires_at < now() + 7 days"

**Tradeoffs**:
- Extra API call daily (negligible cost)
- Prevents silent publish failures (high value)

---

## Decision 6: Meta Graph API Version

**Options**: v18.0, v19.0, v20.0, v25.0
**Choice**: v25.0 (revised — see pitfall below)

**Rationale**:
- Spec §5 examples used v20.0; this research doc originally claimed v20.0 was
  "current stable... as of July 2026" without checking — that claim was wrong
- Instagram Content Publishing API requires v14.0+
- Verified via Context7 + Tavily against Meta's own version table: v20.0 expires
  **September 24, 2026** — 2 months out from a fresh integration, not "current"
- v25.0 (released Feb 2026) is the actual current version

**Tradeoffs**:
- Must upgrade when Meta deprecates (typical 2-year cycle)
- Pin version in env var for easy update (`META_GRAPH_VERSION`, `apps/worker/config.py`)

---

## Decision 7: TikTok Draft-Only Default

**Options**: Direct post (if API works), draft-only (manual upload), hybrid
**Choice**: Draft-only with flag for future direct_post

**Rationale**:
- Spec §5: "Unaudited API clients can only post SELF_ONLY"
- Audit is "serial multi-week review" — don't fight it
- Draft-only means: upload to R2, notify Discord with download link
- Flag-based switching: `TIKTOK_MODE=draft_only | direct_post`

**Tradeoffs**:
- Manual step for TikTok (20 seconds per post)
- Zero API risk (no unaudited calls)
- Can switch to direct_post later without rewrite

---

## Decision 8: YouTube #Shorts Detection

**Options**: Separate Shorts endpoint, auto-detection by shape, metadata tag
**Choice**: Auto-detection by shape + #Shorts in description

**Rationale**:
- YouTube auto-classifies Shorts by shape (vertical ≤3 min) + metadata
- No separate Shorts API endpoint exists
- #Shorts in description signals intent (per spec §5)
- Original yt_upload.py already handles this pattern

**Tradeoffs**:
- Thumbnail caveat: YouTube often ignores API-set thumbnails for Shorts
- Must set cover in YouTube mobile app (documented limitation)

---

## Decision 9: Worker Memory Limit

**Options**: 512MB, 1GB, 2GB, unlimited
**Choice**: 1GB hard limit

**Rationale**:
- Spec §8: "Set the worker's memory limit explicitly"
- ffmpeg + faster-whisper can spike memory
- Remotion renders happen on GitHub Actions, not VPS
- Must not starve Octively (co-located on same VPS)

**Tradeoffs**:
- Might OOM on very large video processing
- Mitigated by: render on GH Actions, not worker
- Documented in Dockerfile comment

---

## Decision 10: Audit Log Actor Naming

**Options**: "system", "worker", job name, "scheduler"
**Choice**: job name (e.g., "refresh_tokens", "publish_due", "meta_publisher")

**Rationale**:
- More specific than "system" or "worker"
- Enables filtering by job in audit queries
- Matches AGENTS.md: "Every action writes one row to the audit log"

**Tradeoffs**:
- More strings to manage
- Worth it for debugging and compliance

---

## Decision 11: Discord Batch Limit for notify_review

**Options**: No limit, 5, 10, 20
**Choice**: 10 per run

**Rationale**:
- Discord embed limit: 10 per message
- If >10 posts: send summary card first, then individual cards
- Prevents rate limiting (Discord: 50 messages/second per channel)

**Tradeoffs**:
- Might miss posts if >10 pending (mitigated by daily run)
- Summary card ensures human knows the full scope

---

## Decision 12: Edit Flow via Discord DM

**Options**: Channel message reply, DM reply, dashboard redirect
**Choice**: Channel message reply (minimal)

**Rationale**:
- Spec §8: "The Edit button sends a Discord DM or channel message"
- Channel message is simpler (no DM permission required)
- Sets pending_edit flag, listens for reply, updates caption
- Minimal implementation for Week 3

**Tradeoffs**:
- Channel message might get buried
- Can upgrade to DM later

---

## Decision 13: YouTube Privacy from Env Var

**Options**: Hardcoded "private", read from plan, read from env var
**Choice**: Read from `YOUTUBE_PRIVACY_ON_UPLOAD` env var

**Rationale**:
- Spec §7: `YOUTUBE_PRIVACY_ON_UPLOAD=private`
- Default: private (draft mode, manual publish in Studio)
- Can flip to "public" after audit passes
- Env var = no code change needed

**Tradeoffs**:
- Requires env var to be set correctly
- Documented in .env.example

---

## Decision 14: Meta Token Refresh Endpoint

**Options**: Exchange endpoint, debug_token, re-authorize
**Choice**: Exchange endpoint (§5)

**Rationale**:
- Spec §5: `GET /oauth/access_token?grant_type=fb_exchange_token&client_id=...&client_secret=...&fb_exchange_token={current_token}`
- Returns long-lived token (~60 days)
- Standard Meta OAuth flow

**Tradeoffs**:
- Token exchange is one-way (can't reverse)
- Must store refresh_token for next refresh cycle
- Implementation pitfall (fixed, see below): the response's `expires_in` field is
  the source of truth for the new expiry — don't hardcode a days-from-now guess

---

## Decision 15: Worker Docker Image Base

**Options**: python:3.11-slim, python:3.11, ubuntu:22.04
**Choice**: python:3.11-slim

**Rationale**:
- Minimal image size (~150MB vs ~900MB for full python:3.11)
- Fast pull on VPS (saves bandwidth)
- Add ffmpeg + faster-whisper via apt
- Matches Week 2's pattern (node:20-slim for dashboard)

**Tradeoffs**:
- Might miss some system libraries
- Mitigated by explicit apt installs in Dockerfile

---

## Pitfalls Found During Post-Implementation Verification (2026-07-27)

The original implementation was written against this research doc without
independently re-checking the platform APIs against current docs, and without ever
running the test suite end-to-end. A follow-up pass using Context7 + Tavily against
Meta/TikTok's live documentation, plus actually running `pytest` and importing
`main.py`, surfaced the following real bugs — all fixed in code, listed here so the
next person doesn't reintroduce them.

**Platform API protocol bugs** (would have failed at runtime against the real APIs):

- `publishers/meta.py` `post_reel()` posted to the generic `/{page_id}/videos`
  endpoint with `upload_phase: start/transfer`. Facebook Page Reels require the
  dedicated `/{page_id}/video_reels` edge instead — a `start` call (JSON) returns
  `video_id` + `upload_url`, the video is uploaded to that `upload_url` directly
  (host is `rupload.facebook.com`, not `graph.facebook.com`) via a `file_url` header
  rather than downloading and re-uploading the bytes, then a `finish` call
  (`video_state: PUBLISHED`) back on `/{page_id}/video_reels` completes it. Using the
  wrong endpoint either fails outright or publishes as a plain video, not a Reel.
- `publishers/tiktok.py` `_publish_direct()`'s `init` call used httpx's `data=`
  (form-encoded, and with a *nested* dict that wouldn't even serialize correctly) —
  the Content Posting API's `/v2/post/publish/video/init/` endpoint requires a JSON
  body. It also hardcoded `video_size: 0` (real byte size is required upfront for
  `FILE_UPLOAD`) and `privacy_level: PUBLIC_TO_EVERYONE` (must come from
  `/creator_info/query/`'s `privacy_level_options` — unaudited apps only ever get
  `SELF_ONLY` back, audited apps still must respect the creator's actual options).
  Fixed by switching to `source: PULL_FROM_URL` (TikTok's servers pull the video
  straight from the public R2 URL — no download/re-upload needed at all) and by
  querying creator info first. Separately, `status/fetch` was called as `GET` with
  `params={"publish_id": ...}` — that endpoint is actually `POST` with a JSON body
  (`{"publish_id": ...}`); also fixed.
- `META_GRAPH_VERSION` defaulted to `v20.0`, which this doc incorrectly called
  "current" (see Decision 6) — verified via Meta's version table that v20.0 expires
  September 24, 2026. Bumped default to `v25.0`.
- `refresh_meta_token()` ignored the real `expires_in` field in Meta's exchange
  response and hardcoded `today-at-3am + 60 days` via a stray
  `__import__("datetime").timedelta(...)` call (a sign the plain `timedelta` import
  was missing, not a deliberate choice). Fixed to read `expires_in` from the
  response and import `timedelta` normally.

**Wiring/infra bugs** (not protocol issues — found by actually running the code):

- `infra/Dockerfile.worker` copied the app into `/app/worker/` and ran
  `uvicorn worker.main:app`, but every worker module uses bare absolute imports
  (`from config import settings`, `from db.session import SessionLocal`) that only
  resolve when `apps/worker/` itself is the import root — there is no
  `apps/worker/__init__.py` and no `worker.`-prefixed imports anywhere. As shipped,
  the container would crash on startup with `ModuleNotFoundError: No module named
  'config'`. Fixed to copy directly into `/app` and run `uvicorn main:app`; verified
  by importing `main` successfully with `apps/worker` as the working directory.
- `db/session.py` built the async SQLAlchemy engine **eagerly at import time** from
  `settings.DATABASE_URL`, which defaults to `""`. An empty string isn't a parseable
  SQLAlchemy URL at all, so importing almost any worker module (every publisher, every
  job) raised `sqlalchemy.exc.ArgumentError` immediately in any environment without a
  real `DATABASE_URL` set — including this one. That alone was blocking nearly the
  entire test suite (`session.py` is imported transitively by everything, and
  `create_async_engine` never actually connects at construction time). Fixed with a
  syntactically-valid placeholder fallback when the env var is unset.
- `publishers/youtube.py`'s `build_body()` read a module-level `DEFAULT_CATEGORY`
  constant that was frozen from `settings.YOUTUBE_DEFAULT_CATEGORY` at import time,
  so changing the setting later (including in tests) had no effect. Fixed to read
  `settings.YOUTUBE_DEFAULT_CATEGORY` live inside the function, and removed the dead
  constant.
- `jobs/publish_due.py` fetched posts in one `SessionLocal()` block, then — after
  that session closed — opened a *second* session per post and called
  `session.get(Post, post.id)` to re-fetch it before mutating state. This discards
  the in-memory `post` object (including whatever the publisher call did with it)
  for no benefit; fixed to mutate the already-fetched `post` directly and re-attach
  it via `session.add(post)` in the update session.
- A handful of `from notify.discord import send` imports were written as lazy,
  inline imports inside function bodies (in `publish_due.py`, `notify_review.py`,
  `tiktok.py`). This is harmless at runtime but makes the call sites unpatchable by
  their own tests (`patch("jobs.publish_due.send")` fails with `AttributeError`
  because the module has no such top-level attribute until the function actually
  runs). Moved to module-level imports; `tiktok.py`'s test patches
  `notify.discord` as a submodule reference (`import notify.discord`) rather than
  a bare `send` name, so it was changed to match that shape specifically.
- `posts.state` gained two values in practice (`tiktok_ready` from TikTok draft-only
  mode, `skipped` from the Discord webhook's Skip button) that were never added to
  the documented lifecycle (`draft → render → review → approved → published/failed`)
  in `schema.sql` or `data-model.md`. There's no DB CHECK constraint, so nothing
  broke, but the drift was undocumented. Both values are now called out explicitly
  in both files.

**Test-only bugs** (source was correct; the pre-written tests were not isolated
correctly and would fail in any clean environment, not just this sandbox):

- `tests/test_refresh_tokens.py` never mocked `settings.META_APP_ID` /
  `META_APP_SECRET`, so it silently depended on real environment variables being
  present — which they aren't in a clean checkout. Fixed by patching
  `jobs.refresh_tokens.settings` in the fixture.
- `tests/test_tiktok.py` patched `publishers.tiktok.notify.discord` with the
  default `MagicMock` (not `AsyncMock`), so `await notify.discord.send(...)` raised
  `TypeError: object MagicMock can't be used in 'await' expression`. Fixed by
  explicitly assigning `mock_discord.send = AsyncMock(...)` in the fixture.
- `tests/test_notify_review.py` (task T056) didn't exist at all despite
  `jobs/notify_review.py` being fully implemented. Written from scratch, covering
  the batch-limit-of-10 and summary-card-for->10 behavior described in Decision 11.

**Net effect**: before this pass, `python -m pytest apps/worker/tests/` could not
even collect most tests (import-time crash from `db/session.py`). After: 44/44
passing. None of this was caught earlier because nobody had run the test suite or
attempted to import `main.py` since the code was written — the original
implementation pass validated each file by reading it, not by executing it.
