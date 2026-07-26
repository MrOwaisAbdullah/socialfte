# Data Model: Week 3 — Worker, Publishers, Discord, Cron

**Changes from Week 2**: None — Week 3 uses the existing 6-table schema without modifications.

---

## Tables Used

### 1. credentials
**Used by**: Token refresh cron (US1), all publishers (US2-US4)

| Column | Type | Usage |
|--------|------|-------|
| platform | TEXT UNIQUE | Key for get_token() / save_token() |
| access_token | TEXT | Used by publishers to authenticate API calls |
| refresh_token | TEXT | Used by refresh_tokens job to get new access_token |
| expires_at | TIMESTAMPTZ | Checked by is_expiring_soon() — must be > now() + 7 days |
| meta | JSONB | Platform-specific metadata (e.g., page_id, ig_user_id) |

**Query pattern**:
```sql
-- Refresh tokens job
SELECT platform, access_token, refresh_token, expires_at, meta
FROM credentials
WHERE expires_at < now() + interval '7 days';
```

---

### 2. posts
**Used by**: Publish due job (US5), notify review job (US8), Discord webhook (US7)

| Column | Type | Usage |
|--------|------|-------|
| id | UUID | Primary key, used in Discord button custom_id |
| platform | TEXT | Determines which publisher to call |
| format | TEXT | Determines which publisher function to call |
| state | TEXT | Lifecycle: draft → render → review → approved → published/failed. Also `tiktok_ready` (draft-only mode) and `skipped` (Discord Skip button) — no DB CHECK constraint, enforced by convention |
| caption | TEXT | Sent in Discord approval card, can be edited via Discord |
| render_url | TEXT | Shown in Discord approval card embed image |
| scheduled_at | TIMESTAMPTZ | Compared to now() in publish_due and notify_review |
| published_at | TIMESTAMPTZ | Set on successful publish |
| external_id | TEXT | Set on successful publish (platform's post ID) |
| error | TEXT | Set on failed publish |

**Query patterns**:
```sql
-- Publish due job
SELECT id, platform, format, caption, render_url, scheduled_at
FROM posts
WHERE state = 'approved' AND scheduled_at <= now();

-- Notify review job
SELECT id, platform, format, caption, render_url, scheduled_at
FROM posts
WHERE state = 'review' AND scheduled_at <= now() + interval '1 day';

-- Per-platform cap check
SELECT COUNT(*) FROM posts
WHERE platform = :platform AND state = 'published'
AND published_at >= now() - interval '1 day';
```

---

### 3. audit_log
**Used by**: All jobs (US1-US8) — every action writes one row

| Column | Type | Usage |
|--------|------|-------|
| actor | TEXT | Job name (e.g., "refresh_tokens", "publish_due", "meta_publisher") |
| action | TEXT | What happened (e.g., "token_refresh", "publish_success", "publish_failed") |
| subject_id | TEXT | Post ID, platform name, or credential ID |
| payload | JSONB | Full context (platform, error, duration, etc.) |

**Write pattern**:
```python
# Every action writes one row
audit_log.append(AuditLog(
    actor="refresh_tokens",
    action="token_refresh_success",
    subject_id="facebook",
    payload={"expires_at": new_expiry.isoformat()}
))
```

---

### 4. templates
**Used by**: Not directly in Week 3 — referenced by posts.template_id

### 5. assets
**Used by**: Not directly in Week 3 — referenced by posts.asset_id

### 6. metrics
**Used by**: Not directly in Week 3 — collect_metrics job is Week 4

---

## No Schema Changes

Week 3 does NOT add, modify, or drop any columns or tables. The existing schema from Week 2 is sufficient for all Week 3 requirements.

**Future considerations** (not in scope):
- `posts.pending_edit` flag for Discord edit flow (can be added to meta JSONB or as a new column)
- `posts.tiktok_ready` state for TikTok draft mode (already supported by state TEXT column)

---

## Indexes Used

```sql
-- Publish due job (the most frequent query)
CREATE INDEX idx_posts_state_scheduled ON posts (state, scheduled_at);

-- Per-platform cap check
CREATE INDEX idx_posts_platform_state ON posts (platform, state);

-- Audit log queries (weekly digest, debugging)
CREATE INDEX idx_audit_log_created_at ON audit_log (created_at);
```

All three indexes already exist from Week 2. No new indexes needed.
