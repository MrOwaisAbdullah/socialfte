# Phase 1 Data Model: Week 2 Schema, Dashboard & Render Pipeline

Six entities, derived per `research.md` Decision 1. Every table uses a UUID
primary key (`gen_random_uuid()`, Decision 2). The literal DDL implementing this
model is `contracts/schema.sql`.

## Entity: Asset

A reusable image/clip available to compose into posts, tagged by the vision agent
(a later week's work) and tracked for reuse cadence.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `r2_key` | text, not null | object storage key for the source image/clip |
| `piece` | text | e.g. "bed", "wardrobe" — from vision tagging |
| `tier` | text | which pricing tier this asset represents |
| `variant` | text | fabric/finish variant |
| `quality_score` | integer | 0–100, from vision tagging |
| `lighting_ok` | boolean | |
| `composition_ok` | boolean | |
| `reject_reason` | text, nullable | set when `quality_score < 60` |
| `times_used` | integer, not null, default 0 | drives the `NO_ASSET_REPEAT_WITHIN` rule — **indexed** |
| `created_at` | timestamptz, default now() | |

## Entity: Template

One of the six named post layouts (Story 4). Deliberately minimal — "has this
template repeated recently" is answered by querying `posts.template_id` history,
not a counter on this table.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `slug` | text, unique, not null | `hero` \| `price-card` \| `set-breakdown` \| `quote` \| `before-after` \| `carousel-slide` |
| `display_name` | text | human-readable label for the dashboard UI |
| `created_at` | timestamptz, default now() | |

## Entity: Post

The record that moves through the `AGENTS.md` lifecycle
(`draft → render → review → approved → publish`, plus `failed`).

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `platform` | text, not null | facebook \| instagram \| youtube_shorts \| tiktok |
| `format` | text, not null | image \| reel \| story \| carousel \| short |
| `state` | text, not null | draft \| render \| review \| approved \| published \| failed — **indexed** with `scheduled_at` and with `platform` |
| `template_id` | UUID, FK → `templates.id` | |
| `asset_id` | UUID, FK → `assets.id` | |
| `caption` | text | |
| `caption_vec` | `vector(:embed_dim)` | dimension parameterized from `EMBED_DIMENSIONS`, not hardcoded (FR-002) — drives `CAPTION_SIMILARITY_THRESHOLD` |
| `render_url` | text | set once Story 5's render route succeeds |
| `scheduled_at` | timestamptz | drives `publish_due` |
| `published_at` | timestamptz, nullable | |
| `external_id` | text, nullable | the platform's own id for this post, once published |
| `error` | text, nullable | set when `state = 'failed'` |
| `created_at` | timestamptz, default now() | |
| `updated_at` | timestamptz, default now() | |

**Indexes**: `(state, scheduled_at)` — the `publish_due` query; `(platform, state)`
— the per-platform daily cap check.

## Entity: Metric

A performance snapshot for a published Post at a specific time window.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `post_id` | UUID, FK → `posts.id`, not null | |
| `window` | text, not null | `24h` \| `7d` |
| `reach` | integer, nullable | |
| `likes` | integer, nullable | |
| `saves` | integer, nullable | |
| `comments` | integer, nullable | |
| `shares` | integer, nullable | |
| `error` | text, nullable | set instead of crashing when a platform API errors mid-collection |
| `collected_at` | timestamptz, default now() | |

## Entity: AuditLogEntry

An immutable record of one action (`AGENTS.md`'s no-exceptions audit rule).

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `actor` | text, not null | which job/agent/operator performed the action |
| `action` | text, not null | e.g. `post.published`, `credential.refreshed` |
| `subject_id` | text, nullable | the affected row's id, kept as text since subjects vary in kind (not all have a UUID row, e.g. a platform name) |
| `payload` | jsonb, nullable | action-specific detail |
| `created_at` | timestamptz, default now() | **indexed** — the weekly-digest query |

## Entity: Credential

A stored platform access token and its refresh state (`AGENTS.md`'s token-refresh
rule).

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `platform` | text, unique, not null | facebook \| instagram \| youtube_shorts \| tiktok |
| `access_token` | text, nullable | |
| `refresh_token` | text, nullable | |
| `expires_at` | timestamptz, nullable | drives `credentials.expires_at < now() + 7 days` |
| `meta` | jsonb, nullable | e.g. YouTube's `.youtube/token.json` shape, Meta page id |
| `updated_at` | timestamptz, default now() | |

## Relationships

```
templates (1) ──< posts (many)      via posts.template_id
assets    (1) ──< posts (many)      via posts.asset_id
posts     (1) ──< metrics (many)    via metrics.post_id
```

`audit_log` and `credentials` have no foreign keys to the other tables — audit
entries reference arbitrary subjects by id-as-text, and credentials are keyed by
platform name, not by any other table's row.
