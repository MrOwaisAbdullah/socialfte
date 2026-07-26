# Plan: Week 3 — Worker, Publishers, Discord, Cron

**Strategy**: Build in the exact order specified — token refresh cron first, then publishers, then jobs.

---

## Phase 1: Worker Scaffold (Step 1)

**Goal**: FastAPI + APScheduler app structure, Dockerfile, docker-compose

**Files to create**:
- `apps/worker/main.py` — FastAPI app, mounts all routers
- `apps/worker/config.py` — pydantic-settings, reads every env var from §7
- `apps/worker/db/session.py` — engine + SessionLocal
- `apps/worker/jobs/` — empty stubs (one file per cron job)
- `apps/worker/publishers/` — meta.py, youtube.py, tiktok.py
- `apps/worker/notify/` — discord.py, whatsapp.py, telegram.py
- `apps/worker/agents/` — base.py, composer.py, vision.py (empty stubs)
- `apps/worker/storage/r2.py` — already exists from Week 2
- `apps/worker/mcp/` — meta_mcp.py, youtube_mcp.py, asset_mcp.py (stubs)
- `infra/Dockerfile.worker` — Python 3.11-slim + ffmpeg + faster-whisper
- `infra/docker-compose.yml` — update to include yl-worker alongside yl-dashboard

**Dependencies**: None (can run in parallel with other phases)

**Risk**: Low — structural only, no business logic

---

## Phase 2: Credential Management (Step 2)

**Goal**: Token storage and expiry checking

**Files to create**:
- `apps/worker/db/credentials.py` — get_token(), save_token(), is_expiring_soon()

**Dependencies**: Phase 1 (db/session.py)

**Risk**: Low — simple DB operations

**Test**: Unit test that mocks DB and verifies is_expiring_soon correctly flags a token expiring in 5 days

---

## Phase 3: Token Refresh Cron (Step 3)

**Goal**: Daily token refresh before expiry

**Files to create**:
- `apps/worker/jobs/refresh_tokens.py` — Meta refresh endpoint logic

**Dependencies**: Phase 2 (credentials.py)

**Risk**: Medium — Meta API can be flaky, token exchange must be correct

**Test**: Mock a token expiring in 3 days, verify the job calls the refresh endpoint

**Critical**: This must be built BEFORE any publisher (spec requirement)

---

## Phase 4: Meta Publisher (Step 4)

**Goal**: Facebook + Instagram publishing via Graph API

**Files to create**:
- `apps/worker/publishers/meta.py` — post_image, post_reel, post_ig_image, post_ig_reel, post_story

**Dependencies**: Phase 2 (credentials.py), Phase 1 (config.py)

**Risk**: Medium — Instagram image container → publish two-step flow is complex

**Test**: httpx mock that verifies the image container → publish two-step flow for Instagram

---

## Phase 5: YouTube Publisher (Step 5)

**Goal**: Adapt existing youtube.py for Shorts

**Files to modify**:
- `apps/worker/publishers/youtube.py` — add #Shorts, read privacy from env, return video_id

**Dependencies**: Phase 1 (config.py)

**Risk**: Low — adapting existing code, not writing from scratch

**Test**: Existing tests + new test for #Shorts addition

---

## Phase 6: TikTok Publisher (Step 6)

**Goal**: Draft-only mode with future direct_post flag

**Files to create**:
- `apps/worker/publishers/tiktok.py` — draft_only logic, discord notification

**Dependencies**: Phase 1 (config.py), Phase 8 (discord.py) — can stub discord for now

**Risk**: Low — draft-only is simple (R2 upload + notification)

**Test**: Unit test that verifies draft_only mode writes correct post state

---

## Phase 7: Publish Due Job (Step 7)

**Goal**: Publish approved posts at scheduled time

**Files to create**:
- `apps/worker/jobs/publish_due.py` — query, cap check, publisher dispatch, error handling

**Dependencies**: Phase 4 (meta.py), Phase 5 (youtube.py), Phase 6 (tiktok.py), Phase 8 (discord.py)

**Risk**: Medium — must handle per-platform caps, error states, audit logging

**Test**: Mock a post past scheduled_at, verify publish_due picks it up and calls publisher; verify cap-exceeded post gets skipped

---

## Phase 8: Discord Notification (Step 8)

**Goal**: Send approval cards and receive button clicks

**Files to create**:
- `apps/worker/notify/discord.py` — send(), send_approval()
- `apps/dashboard/app/api/webhooks/discord/route.ts` — ed25519 verification, PING/PONG, button handling

**Dependencies**: Phase 1 (config.py)

**Risk**: High — ed25519 verification is critical (Discord disables endpoint if it fails)

**Test**: End-to-end test: send card to channel, click Approve, verify post state changes

---

## Phase 9: Notify Review Job (Step 9)

**Goal**: Send approval cards daily for pending posts

**Files to create**:
- `apps/worker/jobs/notify_review.py` — query review posts, batch limit, send_approval

**Dependencies**: Phase 8 (discord.py)

**Risk**: Low — simple query + notification

**Test**: Unit test that verifies batch limit of 10, summary card for >10 posts

---

## Phase 10: Checkpoint (Step 10)

**Goal**: Verify everything works together

**Tasks**:
- [ ] `python -m pytest apps/worker/tests/` — all tests pass
- [ ] Token refresh cron fires in APScheduler (check logs)
- [ ] POST a dummy post row in state='approved' with scheduled_at in the past → verify publish_due picks it up
- [ ] Discord test: send a card to the channel and click Approve → verify post state changes to 'approved'
- [ ] `docker-compose up` — both dashboard and worker start without errors
- [ ] Worker logs show APScheduler registered all five jobs
- [ ] `git commit -m "week3: worker, publishers, discord, cron"`

**Dependencies**: All previous phases

**Risk**: High — integration issues may surface here

---

## Dependency Graph

```
Phase 1 (scaffold)
  ├── Phase 2 (credentials)
  │     └── Phase 3 (refresh_tokens)
  ├── Phase 4 (meta.py)
  │     └── Phase 7 (publish_due)
  ├── Phase 5 (youtube.py)
  │     └── Phase 7 (publish_due)
  ├── Phase 6 (tiktok.py)
  │     └── Phase 7 (publish_due)
  └── Phase 8 (discord.py)
        ├── Phase 7 (publish_due)
        └── Phase 9 (notify_review)

Phase 10 (checkpoint) ← all phases
```

---

## Critical Path

1. Phase 1 (scaffold) — must be first
2. Phase 2 (credentials) — must be before Phase 3
3. Phase 3 (refresh_tokens) — must be before any publisher (spec requirement)
4. Phase 8 (discord.py) — must be before Phase 7 (publish_due) and Phase 9 (notify_review)
5. Phase 7 (publish_due) — the core publishing job
6. Phase 10 (checkpoint) — verification

---

## Parallelization Opportunities

- Phase 4 (meta.py), Phase 5 (youtube.py), Phase 6 (tiktok.py) can run in parallel
- Phase 9 (notify_review) can run in parallel with Phase 7 (publish_due)
- Phase 8 (discord.py) must be before both Phase 7 and Phase 9

---

## Testing Strategy

- Unit tests for each publisher (httpx mock)
- Unit test for credentials.py (DB mock)
- Integration test for publish_due (mock publishers)
- Integration test for Discord webhook (ed25519 verification)
- End-to-end test: docker-compose up, verify jobs register

---

## Rollback Plan

If any phase fails:
1. Revert the specific files for that phase
2. Keep previous phases intact
3. Document the failure in research.md
4. Continue with remaining phases that don't depend on the failed one

---

## Notes

- Worker is internal-only: no public port, docker network only
- Memory limit: 1g hard (Remotion/OOM risk)
- All failures write to audit_log and notify Discord immediately
- No automatic retries unless explicitly defined in job
- Token refresh runs before compose_batch and notify_review each day
