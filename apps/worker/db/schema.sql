-- SocialFTE Neon schema — Week 2, Story 1 (FR-001..FR-004).
-- Contract for /sp.implement: show this file to the operator for approval BEFORE
-- running it against any database (FR-004). Source of truth for models.py
-- (SQLAlchemy, Python) and lib/db/schema.ts (Drizzle, TypeScript) — both must
-- mirror this exactly, never the other way around (research.md Decision 3).

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid() (research.md Decision 2)

-- ─────────────────────────────────────────────────────────────────────────────
-- templates — the six named post layouts (Story 4). Minimal: "used recently?"
-- is answered by querying posts.template_id history, not a counter here.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT NOT NULL UNIQUE,      -- hero | price-card | set-breakdown | quote | before-after | carousel-slide
  display_name TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- assets — reusable media, tagged by the vision agent (later week's work).
-- kind/processed/sync_ok added Week 5 (research.md Decision 7, spec.md's Video
-- clip entity) — a 'clip' starts unprocessed until process_footage.py runs
-- noise cleanup + the A/V sync check; existing 'photo' rows default to already
-- processed since nothing needs to happen to them.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE assets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  r2_key            TEXT NOT NULL,
  original_filename TEXT,             -- the uploader's own filename, e.g. "pink-velvet-storage-bench.jpg" —
                                       -- passed to the vision model as a hint (brain/vision.py); r2_key itself
                                       -- is always a random UUID, so this is the only place any operator-supplied
                                       -- naming (color, product line, etc.) survives the upload at all
  kind           TEXT NOT NULL DEFAULT 'photo',  -- 'photo' | 'clip'
  processed      BOOLEAN NOT NULL DEFAULT true,  -- false for a newly-uploaded 'clip' until process_footage.py finishes
  sync_ok        BOOLEAN,                 -- A/V drift check result (verify_cut.py); null until checked, only set for 'clip'
  piece          TEXT,
  tier           TEXT,
  variant        TEXT,
  quality_score  INTEGER,                 -- 0-100, from vision tagging
  lighting_ok    BOOLEAN,
  composition_ok BOOLEAN,
  reject_reason  TEXT,                    -- set when quality_score < 60
  times_used     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_assets_times_used ON assets (times_used);  -- overuse detection
CREATE INDEX idx_assets_kind_processed ON assets (kind, processed);  -- process_footage.py's polling query

-- ─────────────────────────────────────────────────────────────────────────────
-- posts — moves through AGENTS.md's draft -> render -> review -> approved ->
-- publish lifecycle, plus 'failed'. Also: 'tiktok_ready' (TikTok draft-only mode,
-- see publishers/tiktok.py) and 'skipped' (Discord webhook Skip button, see
-- apps/dashboard/app/api/webhooks/discord/route.ts) — no CHECK constraint, so
-- these are enforced by convention across the worker/dashboard, not by the DB.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE posts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform      TEXT NOT NULL,            -- facebook | instagram | youtube_shorts | tiktok
  format        TEXT NOT NULL,            -- image | reel | story | carousel | short
  state         TEXT NOT NULL,            -- draft | render | review | approved | published | failed | tiktok_ready | skipped
  template_id   UUID REFERENCES templates(id),
  asset_id      UUID REFERENCES assets(id),
  caption       TEXT,
  caption_vec   vector(1536),             -- dimension = EMBED_DIMENSIONS env var (docs/socialfte-spec-v2.md §7,
                                           -- currently openai/text-embedding-3-small @ 1536). NEVER change after
                                           -- first write without a full re-embed + reindex of every existing row.
  render_url    TEXT,
  cover_frame_candidates JSONB,           -- Week 5: up to 3 {url, score} objects from cover-frame selection;
                                           -- the chosen one overwrites render_url directly (data-model.md) —
                                           -- this column is the offered shortlist, not the final choice
  scheduled_at  TIMESTAMPTZ,
  published_at  TIMESTAMPTZ,
  external_id   TEXT,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_posts_state_scheduled ON posts (state, scheduled_at);  -- the publish_due query
CREATE INDEX idx_posts_platform_state  ON posts (platform, state);     -- the per-platform cap check

-- ─────────────────────────────────────────────────────────────────────────────
-- metrics — performance snapshots for a published post at a given window.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE metrics (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      UUID NOT NULL REFERENCES posts(id),
  window       TEXT NOT NULL,             -- '24h' | '7d'
  reach        INTEGER,
  likes        INTEGER,
  saves        INTEGER,
  comments     INTEGER,
  shares       INTEGER,
  error        TEXT,                      -- set instead of crashing on a partial platform-API failure
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- audit_log — immutable, no-exceptions record of every action (AGENTS.md).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor      TEXT NOT NULL,
  action     TEXT NOT NULL,
  subject_id TEXT,                        -- kept as text: subjects aren't always a UUID row (e.g. a platform name)
  payload    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_log_created_at ON audit_log (created_at);  -- the weekly-digest query

-- ─────────────────────────────────────────────────────────────────────────────
-- credentials — one row per platform, drives AGENTS.md's token-refresh rule.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE credentials (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform      TEXT NOT NULL UNIQUE,     -- facebook | instagram | youtube_shorts | tiktok
  access_token  TEXT,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ,              -- credentials.expires_at < now() + 7 days triggers refresh
  meta          JSONB,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- brand_config — single-row brand identity + render tokens, written by the
-- /setup wizard (apps/dashboard/app/api/internal/bootstrap/verify) and read by
-- compose_batch.py's _build_brand_tokens() for both still-image and video
-- render payloads. `key` is always 'default' — one deployment, one brand, one
-- row, upserted via ON CONFLICT (key). setup_complete replaces the old
-- BOOTSTRAP.md file-existence check (bootstrap/status), which never worked in
-- Docker since the dashboard and worker containers share no filesystem.
-- config.py's BRAND_* env vars remain the fallback for a fresh deployment
-- before this row exists.
-- ─────────────────────────────────────────────────────────────────────────────
-- ─────────────────────────────────────────────────────────────────────────────
-- job_runs — every APScheduler job execution (cron-triggered or manually run
-- from the dashboard's Jobs page), so an operator can see status/last-run/
-- errors instead of only a list of registered jobs with no execution history.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE job_runs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      TEXT NOT NULL,            -- APScheduler job id, e.g. 'compose_batch'
  trigger     TEXT NOT NULL,            -- 'scheduled' | 'manual'
  status      TEXT NOT NULL DEFAULT 'running',  -- 'running' | 'success' | 'failed'
  error       TEXT,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX idx_job_runs_job_id_started_at ON job_runs (job_id, started_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- job_schedules — persisted cron overrides, set via the dashboard's Jobs page
-- schedule editor (POST /jobs/{id}/schedule). Checked at worker startup
-- (falls back to the corresponding *_CRON env var when no row exists) and
-- applied live via APScheduler's reschedule_job when changed, no redeploy.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE job_schedules (
  job_id          TEXT PRIMARY KEY,       -- APScheduler job id, e.g. 'compose_batch'
  cron_expression TEXT NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE brand_config (
  key             TEXT PRIMARY KEY DEFAULT 'default',
  brand_name      TEXT,
  tagline         TEXT,
  primary_color   TEXT,
  accent_color    TEXT,
  light_color     TEXT,
  dark_color      TEXT,
  muted_color     TEXT,
  secondary_color TEXT,   -- second accent hue (e.g. crimson) for highlight-box treatments; null = config.py's BRAND_SECONDARY_COLOR
  ink_color       TEXT,   -- true near-black for templates opting into a black+bone+white+secondary variant; null = config.py's BRAND_INK_COLOR
  font_heading    TEXT,
  font_body       TEXT,
  logo_url        TEXT,
  social_handle   TEXT,
  show_brand_mark BOOLEAN NOT NULL DEFAULT true,
  caption_language TEXT,   -- 'roman-urdu-english' | 'english' | 'urdu'; null = caption-writer.md's own default (Roman Urdu + English)
  target_platforms TEXT[] DEFAULT ARRAY['facebook', 'instagram', 'youtube_shorts', 'tiktok'],  -- platforms to create posts for
  setup_complete  BOOLEAN NOT NULL DEFAULT false,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
