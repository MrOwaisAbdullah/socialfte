// Drizzle schema — Week 2, Story 3 (research.md Decision 3).
// Mirrors apps/worker/db/schema.sql exactly. That SQL file is the source of
// truth (see its own header comment) — this file, and Python's models.py,
// must never diverge from it.
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  vector,
  index,
} from 'drizzle-orm/pg-core';

// EMBED_DIMENSIONS (docs/socialfte-spec-v2.md §7) — currently 1536
// (openai/text-embedding-3-small). Must match schema.sql's caption_vec exactly.
const EMBED_DIMENSIONS = 1536;

export const templates = pgTable('templates', {
  id: uuid().defaultRandom().primaryKey(),
  slug: text().notNull().unique(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const assets = pgTable(
  'assets',
  {
    id: uuid().defaultRandom().primaryKey(),
    r2Key: text('r2_key').notNull(),
    piece: text(),
    tier: text(),
    variant: text(),
    qualityScore: integer('quality_score'),
    lightingOk: boolean('lighting_ok'),
    compositionOk: boolean('composition_ok'),
    rejectReason: text('reject_reason'),
    timesUsed: integer('times_used').notNull().default(0),
    kind: text().notNull().default('photo'),
    processed: boolean().notNull().default(true),
    syncOk: boolean('sync_ok'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_assets_times_used').on(table.timesUsed),
    index('idx_assets_kind_processed').on(table.kind, table.processed),
  ]
);

export const posts = pgTable(
  'posts',
  {
    id: uuid().defaultRandom().primaryKey(),
    platform: text().notNull(),
    format: text().notNull(),
    state: text().notNull(),
    templateId: uuid('template_id').references(() => templates.id),
    assetId: uuid('asset_id').references(() => assets.id),
    caption: text(),
    captionVec: vector('caption_vec', { dimensions: EMBED_DIMENSIONS }),
    renderUrl: text('render_url'),
    coverFrameCandidates: jsonb('cover_frame_candidates'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    externalId: text('external_id'),
    error: text(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_posts_state_scheduled').on(table.state, table.scheduledAt),
    index('idx_posts_platform_state').on(table.platform, table.state),
  ]
);

export const metrics = pgTable('metrics', {
  id: uuid().defaultRandom().primaryKey(),
  postId: uuid('post_id').notNull().references(() => posts.id),
  window: text().notNull(),
  reach: integer(),
  likes: integer(),
  saves: integer(),
  comments: integer(),
  shares: integer(),
  error: text(),
  collectedAt: timestamp('collected_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid().defaultRandom().primaryKey(),
    actor: text().notNull(),
    action: text().notNull(),
    subjectId: text('subject_id'),
    payload: jsonb(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_audit_log_created_at').on(table.createdAt)]
);

export const credentials = pgTable('credentials', {
  id: uuid().defaultRandom().primaryKey(),
  platform: text().notNull().unique(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  meta: jsonb(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const brandConfig = pgTable('brand_config', {
  key: text().primaryKey().default('default'),
  brandName: text('brand_name'),
  tagline: text(),
  primaryColor: text('primary_color'),
  accentColor: text('accent_color'),
  lightColor: text('light_color'),
  darkColor: text('dark_color'),
  mutedColor: text('muted_color'),
  fontHeading: text('font_heading'),
  fontBody: text('font_body'),
  logoUrl: text('logo_url'),
  socialHandle: text('social_handle'),
  showBrandMark: boolean('show_brand_mark').notNull().default(true),
  setupComplete: boolean('setup_complete').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
