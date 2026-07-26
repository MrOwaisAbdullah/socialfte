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
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE assets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  r2_key         TEXT NOT NULL,
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

-- ─────────────────────────────────────────────────────────────────────────────
-- posts — moves through AGENTS.md's draft -> render -> review -> approved ->
-- publish lifecycle, plus 'failed'.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE posts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform      TEXT NOT NULL,            -- facebook | instagram | youtube_shorts | tiktok
  format        TEXT NOT NULL,            -- image | reel | story | carousel | short
  state         TEXT NOT NULL,            -- draft | render | review | approved | published | failed
  template_id   UUID REFERENCES templates(id),
  asset_id      UUID REFERENCES assets(id),
  caption       TEXT,
  caption_vec   vector(1536),             -- dimension = EMBED_DIMENSIONS env var (docs/socialfte-spec-v2.md §7,
                                           -- currently openai/text-embedding-3-small @ 1536). NEVER change after
                                           -- first write without a full re-embed + reindex of every existing row.
  render_url    TEXT,
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
