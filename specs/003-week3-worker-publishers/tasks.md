# Tasks: Week 3 — Worker, Publishers, Discord, Cron

**Input**: Design documents from `/specs/003-week3-worker-publishers/`
**Prerequisites**: Week 2 complete (schema applied, dashboard built, render round-trip confirmed)

**Tests**: Unit tests for each module, integration tests for publish_due and Discord webhook.

**Sandbox note**: This environment has Python 3.12, but **no Docker**. Tasks that need Docker are marked accordingly — `/sp.implement` should attempt them and clearly report what could and couldn't be verified.

**Organization**: Tasks are grouped by step from the user's instructions, in dependency order.

## Format: `[ID] [P?] [Step] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Step]**: Which step from the instructions (Step 1–10)
- Every task names its exact file(s) and the US(s) it satisfies

---

## Phase 1: Setup

- [x] T001 Confirm the working tree is on branch `003-week3-worker-publishers` and `git status --short` shows no unrelated uncommitted changes — repo root (created from `002-week2-dashboard-render`, where the Week 3 work had accumulated uncommitted; `002-week2-dashboard-render` itself is untouched at `bb3350b`)
- [x] T002 [P] Verify required tooling: `python3 --version`, `pip --version`; note that `docker` is not available in this environment and record which later tasks that affects (see Sandbox note above) — confirmed: Python 3.12.3, no `docker`

**Checkpoint**: Environment confirmed; known sandbox limitations recorded up front.

---

## Phase 2: Worker Scaffold (Step 1)

- [x] T003 [P] [Step1] Create `apps/worker/main.py` — FastAPI app, mounts all routers (US1-US8)
- [x] T004 [P] [Step1] Create `apps/worker/config.py` — pydantic-settings, reads every env var from §7 (US1-US8)
- [x] T005 [P] [Step1] Create `apps/worker/db/session.py` — engine + SessionLocal (US1-US8)
- [x] T006 [P] [Step1] Create `apps/worker/jobs/` directory with empty stubs: `refresh_tokens.py`, `publish_due.py`, `notify_review.py` (US1, US5, US8)
- [x] T007 [P] [Step1] Create `apps/worker/publishers/` directory (meta.py, youtube.py, tiktok.py) — already exists from Week 2, ensure all files present (US2-US4)
- [x] T008 [P] [Step1] Create `apps/worker/notify/` directory with empty stubs: `discord.py`, `whatsapp.py`, `telegram.py` (US6)
- [x] T009 [P] [Step1] Create `apps/worker/agents/` directory with empty stubs: `base.py`, `composer.py`, `vision.py` (Week 4)
- [x] T010 [P] [Step1] Create `apps/worker/mcp/` directory with empty stubs: `meta_mcp.py`, `youtube_mcp.py`, `asset_mcp.py` (Week 4)
- [x] T011 [Step1] Create `infra/Dockerfile.worker` — Python 3.11-slim + ffmpeg + faster-whisper, memory limit 1g hard (US1-US8)
- [x] T012 [Step1] Update `infra/docker-compose.yml` — add yl-worker alongside yl-dashboard, internal-only, no public port (US1-US8)

**Checkpoint**: Worker structure ready; Dockerfiles created; docker-compose updated.

---

## Phase 3: Credential Management (Step 2)

- [x] T013 [Step2] Create `apps/worker/db/credentials.py` — get_token(platform), save_token(platform, access_token, refresh_token, expires_at, meta), is_expiring_soon(platform, days=7) (US1)
- [x] T014 [Step2] Create `apps/worker/tests/test_credentials.py` — unit test that mocks DB and verifies is_expiring_soon correctly flags a token expiring in 5 days (US1)

**Checkpoint**: Credential management ready; unit test passes.

---

## Phase 4: Token Refresh Cron (Step 3)

- [x] T015 [Step3] Create `apps/worker/jobs/refresh_tokens.py` — for each platform in credentials table, if is_expiring_soon(platform, days=7): attempt refresh via platform API, if refresh succeeds: save_token with new expiry, if refresh fails: notify("URGENT: {platform} token refresh failed. Expires {expires_at}."), write audit_log row for every refresh attempt (US1)
- [x] T016 [Step3] Implement Meta refresh endpoint: GET /oauth/access_token?grant_type=fb_exchange_token&client_id=...&client_secret=...&fb_exchange_token={current_token} (US1)
- [x] T17 [Step3] Wire refresh_tokens job to APScheduler: daily at 03:00 (US1)
- [x] T018 [Step3] Create `apps/worker/tests/test_refresh_tokens.py` — mock a token expiring in 3 days, verify the job calls the refresh endpoint (US1)

**Checkpoint**: Token refresh cron fires daily; unit test passes.

---

## Phase 5: Meta Publisher (Step 4)

- [x] T019 [Step4] Create `apps/worker/publishers/meta.py` — post_image(page_id, image_url, caption) → external_id (US2)
- [x] T020 [Step4] Implement post_reel(page_id, video_url, caption) → external_id (US2)
- [x] T021 [Step4] Implement post_ig_image(ig_user_id, image_url, caption) → external_id (US2)
- [x] T022 [Step4] Implement post_ig_reel(ig_user_id, video_url, caption) → external_id (US2)
- [x] T023 [Step4] Implement post_story(ig_user_id, image_url) → external_id (US2)
- [x] T024 [Step4] Use META_PAGE_TOKEN from config, Graph API v20.0 (US2)
- [x] T025 [Step4] Every function writes audit_log row on success and on failure (US2)
- [x] T026 [Step4] Do NOT catch exceptions silently — let them bubble (US2)
- [x] T027 [Step4] Create `apps/worker/tests/test_meta.py` — httpx mock that verifies the image container → publish two-step flow for Instagram (US2)

**Checkpoint**: Meta publisher complete; unit test passes.

---

## Phase 6: YouTube Publisher (Step 5)

- [x] T028 [Step5] Adapt `apps/worker/publishers/youtube.py` — add #Shorts to description (US3)
- [x] T029 [Step5] Read privacy from YOUTUBE_PRIVACY_ON_UPLOAD env var (US3)
- [x] T030 [Step5] Return video_id so caller can write posts.external_id (US3)
- [x] T031 [Step5] Keep A/V drift verification, drop ghost-speech check (US3)
- [x] T032 [Step5] Keep the resumable upload with retry logic (US3)
- [x] T033 [Step5] Create `apps/worker/tests/test_youtube.py` — verify #Shorts addition and privacy read (US3)

**Checkpoint**: YouTube publisher adapted; unit test passes.

---

## Phase 7: TikTok Publisher (Step 6)

- [x] T034 [Step6] Create `apps/worker/publishers/tiktok.py` — when TIKTOK_MODE=draft_only (default): upload video to R2, write posts row with state='tiktok_ready', send Discord notification with R2 URL (US4)
- [x] T035 [Step6] When TIKTOK_MODE=direct_post (future, audited): use Content Posting API direct-post endpoint (US4)
- [x] T036 [Step6] Flag-based switching without rewrite (US4)
- [x] T037 [Step6] Create `apps/worker/tests/test_tiktok.py` — verify draft_only mode writes correct post state (US4)

**Checkpoint**: TikTok publisher complete; unit test passes.

---

## Phase 8: Discord Notification (Step 8)

- [x] T038 [Step8] Create `apps/worker/notify/discord.py` — send(text, media_url=None), send_approval(post) with embed: rendered image, caption (truncated to 2000 chars), platform badge, scheduled time, three buttons: Approve / Edit / Skip (US6)
- [x] T039 [Step8] Use bot token (not webhook) for sending (US6)
- [x] T040 [Step8] Create `apps/dashboard/app/api/webhooks/discord/route.ts` — ed25519 signature verification with tweetnacl, handle type 1 (PING → PONG), handle type 3 (button click → update post state in DB) (US7)
- [x] T041 [Step8] Edit button opens a Discord modal (`type: 9`) pre-filled with the current caption (US7) — revised from the original "reply in the channel" design (see T042)
- [x] T042 [Step8] Handle the modal submission (`type: 5`, MODAL_SUBMIT) and update `posts.caption` (US7) — implemented via a Discord **modal** instead of a message listener. A plain-text "reply in the channel" design requires a persistent Gateway-bot process (the Interactions webhook this route implements only ever receives interaction events — buttons, modals — never arbitrary channel messages). A modal collects the same freeform text through the same stateless webhook already in place: Edit opens a Label+TextInput modal pre-filled with the current caption, submission updates `posts.caption`, writes an audit_log row, and re-renders the original approval card's embed with the new caption (keeping the Approve/Edit/Skip buttons, since editing isn't a terminal state). Verified against current Discord docs via Tavily — Action Row + Text Input in modals is deprecated in favor of the Label component, used here. This pass also caught and fixed two build-breaking bugs in this file that predated it: `tweetnacl` was never added to `package.json` (only just installed) and the file imported from `@/lib/db` (no such module — fixed to `@/lib/db/client`), meaning this route had never successfully typechecked or built before now. Confirmed via `tsc --noEmit` and a full `next build --webpack` (Turbopack doesn't support Windows x64 native bindings in this environment, unrelated to this change).
- [x] T043 [Step8] Create `apps/worker/tests/test_discord.py` — verify send_approval creates correct embed structure (US6)

**Checkpoint**: Discord notification complete; webhook endpoint works; unit test passes.

---

## Phase 9: Publish Due Job (Step 7)

- [x] T044 [Step7] Create `apps/worker/jobs/publish_due.py` — query posts WHERE state='approved' AND scheduled_at <= now() (US5)
- [x] T045 [Step7] Apply per-platform daily cap check (read CAP_* env vars) (US5)
- [x] T046 [Step7] For each eligible post: call the right publisher based on post.platform + post.format (US5)
- [x] T047 [Step7] On success: update post state='published', published_at=now(), external_id=..., write audit_log (US5)
- [x] T048 [Step7] On failure: update post state='failed', error=str(e), notify Discord, write audit_log (US5)
- [x] T049 [Step7] Wire publish_due job to APScheduler: every 15 minutes (US5)
- [x] T050 [Step7] Create `apps/worker/tests/test_publish_due.py` — verify a post past its scheduled_at gets published and a cap-exceeded post gets skipped (US5)

**Checkpoint**: Publish due job complete; unit test passes.

---

## Phase 10: Notify Review Job (Step 9)

- [x] T051 [Step9] Create `apps/worker/jobs/notify_review.py` — at 04:30 daily: query posts WHERE state='review' AND scheduled_at <= tomorrow (US8)
- [x] T052 [Step9] For each: call notify/discord.py send_approval(post) (US8)
- [x] T053 [Step9] Batch limit: 10 per run (US8)
- [x] T054 [Step9] If more than 10: send one summary card first: "You have {n} posts to review. Showing first 10." (US8)
- [x] T055 [Step9] Wire notify_review job to APScheduler: daily at 04:30 (US8)
- [x] T056 [Step9] Create `apps/worker/tests/test_notify_review.py` — verify batch limit of 10, summary card for >10 posts (US8)

**Checkpoint**: Notify review job complete; unit test passes.

---

## Phase 11: Checkpoint (Step 10)

- [x] T057 [Step10] Run `python -m pytest apps/worker/tests/` — all 44 tests pass (verified in a scratch venv; see note below)
- [ ] T058 [Step10] Verify token refresh cron fires in APScheduler (check logs) — structurally confirmed (`main.py` registers it via `CronTrigger.from_crontab`), but not observed live: startup requires a real `DATABASE_URL` (Neon) and this sandbox has none
- [ ] T059 [Step10] POST a dummy post row in state='approved' with scheduled_at in the past → verify publish_due picks it up and calls the publisher — covered by `test_publish_due.py` with a mocked DB; not run against a real Postgres instance
- [ ] T060 [Step10] Discord test: send a card to the channel and click Approve → verify the post state changes to 'approved' in the DB — needs a real Discord bot token + live channel; not available here
- [ ] T061 [Step10] Run `docker-compose up` — both dashboard and worker start without errors (if Docker available) — **Docker is not available in this sandbox** (confirmed: `docker` not on PATH). `infra/Dockerfile.worker` had a real bug (see note) now fixed, but the image itself has not been built
- [ ] T062 [Step10] Worker logs show APScheduler registered all five jobs — spec only defines **three** cron jobs (refresh_tokens, publish_due, notify_review); `main.py` registers exactly those three. The "five" in this task looks like a stale figure from an earlier plan revision, not a missing job
- [x] T063 [Step10] Git commit: `git commit -m "week3: worker, publishers, discord, cron"` — committed on the new `003-week3-worker-publishers` branch

**Checkpoint**: Unit-test-verifiable work is done and passing. Everything requiring Docker, a live Postgres/Neon instance, or a live Discord bot connection could not be exercised in this sandbox and is called out above rather than checked off. Real bugs found and fixed during this pass (beyond the earlier Meta/TikTok/token-refresh fixes): `infra/Dockerfile.worker` copied the app into a `worker/` subpackage and ran `uvicorn worker.main:app`, but every module uses bare imports (`from config import settings`) that only resolve when `apps/worker/` itself is the import root — the container would have crashed on startup; `db/session.py` built the async engine eagerly at import time from `DATABASE_URL`, which defaults to `""` and isn't a parseable URL, so importing almost any worker module without a real DB configured raised `ArgumentError` immediately (this alone was blocking most of the test suite); `youtube.py`'s `build_body()` read a module-level `DEFAULT_CATEGORY` frozen at import time instead of the live settings value; `jobs/publish_due.py` re-fetched a post via `session.get()` in a new session after the one that loaded it had already closed, discarding the in-memory state instead of reusing the already-fetched object; and a few inline `from notify.discord import send` calls were moved to module level for consistency/testability. `T042` (a Discord message listener that reads a plain-text reply and writes it to `posts.caption`) is a real, unimplemented gap — Discord's Interactions webhook only receives button/slash-command events, not arbitrary channel messages, so this needs a separate persistent Gateway-bot process, not more work on the existing stateless webhook route.

---

## Summary

| Phase | Tasks | Dependencies | Risk |
|-------|-------|--------------|------|
| 1. Setup | T001-T002 | None | Low |
| 2. Worker Scaffold | T003-T012 | Phase 1 | Low |
| 3. Credential Management | T013-T014 | Phase 2 | Low |
| 4. Token Refresh Cron | T015-T018 | Phase 3 | Medium |
| 5. Meta Publisher | T019-T027 | Phase 2 | Medium |
| 6. YouTube Publisher | T028-T033 | Phase 1 | Low |
| 7. TikTok Publisher | T034-T037 | Phase 1, 8 | Low |
| 8. Discord Notification | T038-T043 | Phase 1 | High |
| 9. Publish Due Job | T044-T050 | Phase 5, 6, 7, 8 | Medium |
| 10. Notify Review Job | T051-T056 | Phase 8 | Low |
| 11. Checkpoint | T057-T063 | All | High |

**Total**: 63 tasks
**Critical Path**: Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 8 → Phase 9 → Phase 11
