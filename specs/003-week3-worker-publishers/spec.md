# Spec: Week 3 — Worker, Publishers, Discord, Cron

**Input**: `docs/socialfte-spec-v2.md` §4a (Discord), §5 (platform connections), §9 (cron schedule)
**Prerequisites**: Week 2 complete (schema applied, dashboard built, render round-trip confirmed)
**Priority**: P1 — this is the most critical week. Token refresh cron must be built before any publish code.

---

## 1. Goal

Build the Python worker service that runs all scheduled jobs, publishes to platforms, and handles Discord approval workflows. The worker is the "mouth and ears" of SocialFTE — it connects the dashboard's approved posts to the outside world.

## 2. User Stories

### US1: Token Refresh Cron (Priority: P1 — MVP)
**As** the system,
**I want** platform tokens refreshed before they expire,
**So that** publishing never fails silently due to expired credentials.

**Acceptance Criteria**:
- Cron runs daily at 03:00 (§9)
- Checks all credentials where `expires_at < now() + 7 days`
- Attempts refresh via platform API (Meta: `fb_exchange_token` flow)
- On success: saves new token with updated expiry
- On failure: notifies Discord with URGENT message
- Writes audit_log row for every attempt

### US2: Meta Publisher (Priority: P2)
**As** the system,
**I want** to publish images and videos to Facebook Pages and Instagram,
**So that** approved content reaches the audience.

**Acceptance Criteria**:
- `post_image(page_id, image_url, caption)` → returns external_id
- `post_reel(page_id, video_url, caption)` → returns external_id
- `post_ig_image(ig_user_id, image_url, caption)` → returns external_id
- `post_ig_reel(ig_user_id, video_url, caption)` → returns external_id
- `post_story(ig_user_id, image_url)` → returns external_id
- Uses Graph API v20.0
- Writes audit_log on success and failure
- Does NOT catch exceptions silently

### US3: YouTube Publisher (Priority: P2)
**As** the system,
**I want** to upload Shorts to YouTube,
**So that** video content reaches YouTube audiences.

**Acceptance Criteria**:
- Adapts existing `youtube.py` from Week 1
- Adds #Shorts to description
- Reads privacy from `YOUTUBE_PRIVACY_ON_UPLOAD` env var
- Returns video_id for caller to record
- Keeps A/V drift verification
- Keeps resumable upload with retry logic

### US4: TikTok Publisher (Draft-Only) (Priority: P3)
**As** the system,
**I want** to prepare TikTok posts for manual upload,
**So that** content is ready when TikTok API audit completes.

**Acceptance Criteria**:
- When `TIKTOK_MODE=draft_only` (default):
  - Uploads video to R2 (already done by render job)
  - Writes posts row with state='tiktok_ready'
  - Sends Discord notification with R2 URL and "Download and post manually"
- When `TIKTOK_MODE=direct_post` (future, audited):
  - Uses Content Posting API direct-post endpoint
- Flag-based switching without rewrite

### US5: Publish Due Job (Priority: P1 — MVP)
**As** the system,
**I want** approved posts published at their scheduled time,
**So that** content goes out on schedule.

**Acceptance Criteria**:
- Runs every 15 minutes (§9)
- Queries posts WHERE state='approved' AND scheduled_at <= now()
- Applies per-platform daily cap check (reads CAP_* env vars)
- For each eligible post:
  - Calls appropriate publisher based on platform + format
  - Updates post: state='published', published_at=now(), external_id=...
  - Writes audit_log
- On failure:
  - Updates post: state='failed', error=str(e)
  - Sends Discord notification
  - Writes audit_log

### US6: Discord Notification (Priority: P2)
**As** a human reviewer,
**I want** approval cards sent to Discord,
**So that** I can approve/edit/skip posts from my phone.

**Acceptance Criteria**:
- `send(text, media_url=None)` — basic notification
- `send_approval(post)` — approval card with:
  - Rendered image
  - Caption (truncated to 2000 chars)
  - Platform badge
  - Scheduled time
  - Three buttons: Approve / Edit / Skip
- Uses bot token (not webhook) for button interactions
- Ed25519 signature verification on webhook endpoint

### US7: Discord Webhook Endpoint (Priority: P2)
**As** Discord,
**I want** button clicks received and processed,
**So that** approval decisions update the database.

**Acceptance Criteria**:
- Endpoint: `POST /api/webhooks/discord`
- Ed25519 signature verification (tweetnacl)
- Handles type 1 (PING → PONG)
- Handles type 3 (button click → update post state)
- Edit button sends "Reply with new caption" message
- Message listener reads reply and updates posts.caption

### US8: Notify Review Job (Priority: P2)
**As** the system,
**I want** approval cards sent daily for pending posts,
**So that** humans review before scheduled_at.

**Acceptance Criteria**:
- Runs at 04:30 daily (§9)
- Queries posts WHERE state='review' AND scheduled_at <= tomorrow
- For each: calls notify/discord.py send_approval(post)
- Batch limit: 10 per run
- If >10: sends summary card first ("You have {n} posts to review. Showing first 10.")

## 3. Technical Requirements

### Worker Scaffold
- Python 3.11+ with FastAPI
- APScheduler for cron jobs
- Docker container with ffmpeg + faster-whisper
- Memory limit: 1g hard (Remotion/OOM risk)
- Internal-only: no public port, docker network only

### Database Access
- SQLAlchemy models from Week 2
- Session management via `db/session.py`
- Credential management via `db/credentials.py`

### Platform APIs
- Meta Graph API v20.0
- YouTube Data API v3
- TikTok Content Posting API (future)

### Notification
- Discord bot (not webhook) for sending
- Discord webhook for receiving button clicks
- Ed25519 signature verification

## 4. Out of Scope

- LLM integration (Week 4)
- Caption agent (Week 4)
- Vision agent (Week 4)
- Anti-repeat checks (Week 4)
- Weekly digest (Week 4)
- BOOTSTRAP wizard (Week 4)

## 5. Success Criteria

- [ ] `python -m pytest apps/worker/tests/` — all tests pass
- [ ] Token refresh cron fires in APScheduler (check logs)
- [ ] POST a dummy post row in state='approved' with scheduled_at in the past → verify publish_due picks it up
- [ ] Discord test: send a card to the channel and click Approve → verify post state changes to 'approved'
- [ ] `docker-compose up` — both dashboard and worker start without errors
- [ ] Worker logs show APScheduler registered all five jobs
- [ ] `git commit -m "week3: worker, publishers, discord, cron"`
