-- Creative Pipeline Schema - Phase 1: Concepts & Content Library
-- Add this to schema.sql and run the migration

-- ─────────────────────────────────────────────────────────────────────────────
-- concepts — pre-generated creative concepts for posts (Phase 1 creative pipeline)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE concepts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id          UUID REFERENCES assets(id),
  concept_type      TEXT NOT NULL,                 -- 'price-focused', 'lifestyle', 'quality', 'exclusive'
  headlines         JSONB NOT NULL,                -- ["Premium comfort", "Luxury within reach", "Best value"]
  captions          JSONB NOT NULL,                -- ["Option 1", "Option 2", "Option 3"]
  creative_direction TEXT,                       -- "Focus on craftsmanship", "Emphasize savings"
  suggested_templates TEXT[],                     -- ['hero', 'price-card', 'carousel-slide']
  animation_style   TEXT,                         -- 'frame-sequence', 'shader-dissolve', 'card-convergence'
  state             TEXT NOT NULL DEFAULT 'draft',-- draft, approved, rejected
  approved_by        UUID,                         -- user who approved
  approved_at       TIMESTAMPTZ,                   -- when approved
  usage_count       INTEGER NOT NULL DEFAULT 0,   -- how many times used in posts
  performance_score NUMERIC,                      -- engagement rate for this concept
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_concepts_asset_id ON concepts (asset_id);
CREATE INDEX idx_concepts_state ON concepts (state);
CREATE INDEX idx_concepts_type_state ON concepts (concept_type, state);

-- ─────────────────────────────────────────────────────────────────────────────
-- content_library — reusable content snippets (headlines, captions, angles)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE content_library (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type  TEXT NOT NULL,                  -- 'headline', 'caption', 'angle', 'cta'
  category      TEXT NOT NULL,                  -- 'quality', 'price', 'luxury', 'lifestyle', 'comfort'
  content       TEXT NOT NULL,                  -- the actual content
  tags          TEXT[],                        -- ['sheesham', 'modern', 'budget-friendly']
  usage_count   INTEGER NOT NULL DEFAULT 0,   -- how many times used
  performance_score NUMERIC,                    -- avg engagement rate when used
  is_active     BOOLEAN NOT NULL DEFAULT true, -- can disable poor performers
  created_by    UUID,                          -- user who added it
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_content_library_type ON content_library (content_type);
CREATE INDEX idx_content_library_category ON content_library (category);
CREATE INDEX idx_content_library_active ON content_library (is_active) WHERE is_active = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- concept_performance — track which concepts perform best (A/B testing)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE concept_performance (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id      UUID REFERENCES concepts(id),
  post_id         UUID REFERENCES posts(id),
  platform        TEXT NOT NULL,
  impressions     INTEGER DEFAULT 0,
  engagement      INTEGER DEFAULT 0,            -- likes + comments + shares
  engagement_rate NUMERIC,                       -- engagement / impressions
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_concept_performance_concept ON concept_performance (concept_id);
CREATE INDEX idx_concept_performance_post ON concept_performance (post_id);

-- Sample content library entries (optional seed data)
INSERT INTO content_library (content_type, category, content, tags) VALUES
  ('headline', 'quality', 'Handcrafted to last generations', ['craftsmanship', 'durability']),
  ('headline', 'price', 'Luxury within reach', ['value', 'affordable']),
  ('headline', 'lifestyle', 'Transform your space', ['lifestyle', 'home']),
  ('caption', 'quality', 'Built with precision, designed for comfort. Every piece tells a story of craftsmanship.', ['quality', 'craftsmanship']),
  ('caption', 'price', 'Premium quality without the premium price tag. Experience luxury for less.', ['value', 'savings']),
  ('angle', 'comfort', 'Focus on comfort and ergonomics', ['comfort', 'ergonomic']),
  ('angle', 'exclusive', 'Emphasize limited availability', ['exclusive', 'limited']),
  ('cta', 'standard', 'WhatsApp for details', ['contact', 'whatsapp']),
  ('cta', 'urgent', 'Limited stock – order now', ['urgency', 'stock'])