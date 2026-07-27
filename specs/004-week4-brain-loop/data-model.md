# Data Model: Week 4 — Brain, Loop, and Bootstrap

**Changes from Week 2/3**: None to `schema.sql` — Week 4 reuses the existing 6-table
schema unmodified. `assets` already has `quality_score`/`lighting_ok`/`composition_ok`/
`reject_reason` (Week 2, unused until now), and `metrics` already has the `window`/
`error` shape this feature needs. The new "entities" this feature introduces
(weekly summaries, brand configuration, repetition history) are either files on disk
or derived queries over existing tables, not new tables.

---

## Tables Used

### 1. assets — now actually populated by the vision agent (User Story 6)

| Column | Type | Usage |
|--------|------|-------|
| quality_score | INTEGER | Set by vision_agent's quality-gate pass, 0–100 |
| lighting_ok | BOOLEAN | Set by vision_agent |
| composition_ok | BOOLEAN | Set by vision_agent |
| reject_reason | TEXT | Set when quality_score < 60 (schema comment already documents this threshold) — asset is still inserted (spec.md edge case: flagged, not discarded), just marked |
| piece / tier / variant | TEXT | Set by vision_agent's tagging pass |
| times_used | INTEGER | Read by the anti-repeat gate (User Story 2) — "no asset repeat within 10 posts" |

**New query pattern** (asset-repetition check, User Story 2):
```sql
SELECT asset_id FROM posts
ORDER BY created_at DESC
LIMIT 10;
-- exclude any asset_id present in this result when picking the next asset
```

---

### 2. posts — the anti-repeat gate's primary lookback target

| Column | Type | Usage |
|--------|------|-------|
| template_id | UUID | Read for the 4-post template-repetition check |
| asset_id | UUID | Read for the 10-post asset-repetition check |
| caption_vec | vector(1536) | Read for the 30-post, 0.85-cosine-similarity caption check |
| state | TEXT | compose_batch writes new rows starting at `draft`, transitioning to `review` once render succeeds (per AGENTS.md's lifecycle — unchanged from Week 2/3) |

**New query patterns**:
```sql
-- Template-repetition check (last 4 posts)
SELECT template_id FROM posts ORDER BY created_at DESC LIMIT 4;

-- Caption-similarity check (last 30 posts) — see research.md Decision 2:
-- cosine_distance = 1 - cosine_similarity, so ">0.85 similar" is "distance < 0.15"
SELECT id FROM posts
WHERE id IN (SELECT id FROM posts ORDER BY created_at DESC LIMIT 30)
  AND caption_vec IS NOT NULL
  AND caption_vec.cosine_distance(:new_embedding) < 0.15;
-- (expressed via SQLAlchemy's cosine_distance() column method, not raw <=>, to match
-- the existing pattern in apps/worker/db/models.py)
```

---

### 3. metrics — filled in for the first time (was schema-only since Week 2)

| Column | Type | Usage |
|--------|------|-------|
| post_id | UUID | FK to the published post being measured |
| window | TEXT | `'24h'` or `'7d'` — collect_metrics runs both windows per post |
| reach/likes/saves/comments/shares | INTEGER | Pulled from the platform's insights API (research.md Decision 4/5); any field the platform doesn't report for a given post stays NULL, not 0 |
| error | TEXT | Set instead of crashing when a single post's collection fails (partial-failure isolation, per FR-009 and the existing schema comment) |

**New query pattern** (weekly_digest's summary source, User Story 5):
```sql
SELECT p.platform, p.format, m.window, m.reach, m.likes, m.saves, m.comments, m.shares
FROM metrics m
JOIN posts p ON p.id = m.post_id
WHERE m.collected_at >= now() - interval '7 days';
```

---

### 4. credentials — read by BOOTSTRAP, and by collect_metrics for scope awareness

| Column | Type | Usage |
|--------|------|-------|
| platform | TEXT | BOOTSTRAP's platform step (User Story 7) writes one row per connected platform via the existing OAuth flows (Week 3) |
| meta | JSONB | Where a per-credential note like "missing yt-analytics.readonly scope" (research.md Decision 5) can be recorded if a YouTube token predates this feature, so collect_metrics can skip it cleanly instead of failing loudly every 6 hours |

No column changes — `meta` is already a free-form JSONB column from Week 2.

---

## File-based entities (not database rows)

Several things this feature manages are files, not tables — consistent with how
Week 1 already treats `SOUL.md`/`BRAND.md`/`AGENTS.md`/`HEARTBEAT.md`.

### MEMORY.md (new)

The durable, human-readable history FR-012 requires for weekly summaries. Appended
to, never overwritten — one dated `## Week of YYYY-MM-DD` heading per run, holding
the judgement-model's prose summary. Created on first run if absent.

### BOOTSTRAP.md (existing convention, now load-bearing)

Its **presence** is the "first-time setup available" flag (FR-018): BOOTSTRAP runs
only while this file exists, and the wizard deletes it on successful completion
(docs/socialfte-spec-v2.md §6). This means "has BOOTSTRAP already run" requires no
new state anywhere — file-exists is the whole check.

### Per-step BOOTSTRAP progress (resumability, research.md Decision 7)

No new tracking file — each step's own output *is* its progress marker:
- Step 1 (identity) done ⟺ `SOUL.md` and `IDENTITY.md` exist and are non-empty
- Step 2 (brand) done ⟺ `BRAND.md` exists and `packages/remotion/src/brand.ts` has
  been regenerated (already how `/brand-setup` signals completion today)
- Step 3 (platforms) done ⟺ at least one row exists in `credentials`
- Step 4 (notification) done ⟺ `NOTIFY_CHANNEL` is set and a test message was sent
  (recorded via `audit_log`, actor=`bootstrap`, action=`notify_test_sent`)
- Step 5 (cadence) done ⟺ `HEARTBEAT.md` exists
- Step 6 (verify) is never "done" in a persisted sense — it re-runs its checks every
  time it's reached, since it's meant to validate current state, not remember a past
  pass

---

## No new entities requiring a `data-model.md` table section

- **Draft post** (spec.md Key Entity) = an existing `posts` row in `state='draft'`.
  Nothing new.
- **Repetition history** (spec.md Key Entity) = the query patterns above over
  `posts`/`assets`. Not a stored table — recomputed fresh on every compose_batch run
  from a rolling window, per spec.md's own description ("a rolling window, not a
  permanent ban list").
