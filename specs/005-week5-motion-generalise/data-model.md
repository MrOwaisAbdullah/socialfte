# Data Model: Week 5 — Motion, Calendar, and Generalise

**Changes from Week 2–4**: The first `schema.sql` change since Week 2
(research.md Decision 7) — three new columns on `assets`, one new column on
`posts`. No new tables; both existing tables already had room to grow (`assets`
was photo-only, `posts` already carries render/state metadata).

---

## Tables Changed

### 1. assets — now distinguishes photos from video clips

| Column | Type | Usage |
|--------|------|-------|
| kind (**new**) | TEXT NOT NULL DEFAULT `'photo'` | `'photo'` (existing Week 2 rows, unaffected) or `'clip'` (new video uploads this feature introduces) |
| processed (**new**) | BOOLEAN NOT NULL DEFAULT `true` | Existing photo rows default to already-processed (nothing to do); new `'clip'` rows default `false` until `process_footage.py` finishes — this is the field `process_footage.py`'s APScheduler trigger polls on (`kind='clip' AND processed=false`) |
| sync_ok (**new**) | BOOLEAN, nullable | The A/V drift check result from `verify_cut.py` — null until checked, `false` blocks the clip from cover-frame selection (FR-006), `true` allows it to proceed |

**New query pattern** (process_footage's trigger, Phase 3):
```sql
SELECT * FROM assets WHERE kind = 'clip' AND processed = false;
```

---

### 2. posts — gains a place to hold cover-frame candidates

| Column | Type | Usage |
|--------|------|-------|
| cover_frame_candidates (**new**) | JSONB, nullable | Up to 3 `{url, score}` objects, written once by Phase 4's cover-frame selection, read once when the reviewer picks one via the Discord approval card. Follows the same free-form-JSONB-for-feature-metadata convention already established by `credentials.meta` (Week 2) — not a new table, since this is a short, disposable, single-post-scoped list, never queried independently of its post. |

**New query pattern** (writing candidates after scoring, Phase 4):
```sql
UPDATE posts SET cover_frame_candidates = '[{"url": "...", "score": 8}, ...]'::jsonb
WHERE id = :post_id;
```

**Chosen cover**: when the reviewer picks one of the three candidates via
Discord, its URL overwrites `render_url` directly (the composition's own
rendered background is a still image derived from a video clip's frame in this
flow — there is no separate "thumbnail vs. video" field in the current schema,
and introducing one is out of scope for this feature; the clip's actual video
file remains referenced via the `assets` row, not duplicated onto `posts`).

---

## No changes needed

- **templates**: The four new video compositions (`HeroReveal`, `PriceReveal`,
  `FabricDetail`, `SetReveal`) are Remotion-side concepts, not `templates` table
  rows — that table models the six *static* post layouts (Week 2). Video
  composition selection is a parameter to `dispatch_video_render()`
  (`composition_id`), not a database-backed template reference. If a future
  week wants video compositions to participate in the same anti-repeat/template-
  rotation logic as static templates (Week 4), that's a genuine open question
  for later — out of scope here since spec.md's User Story 1 doesn't require it.
- **metrics**, **credentials**, **audit_log**: Unchanged. Every new job this
  feature introduces (`process_footage`, `dispatch_render`) writes to
  `audit_log` following the existing `_write_audit()` pattern from every prior
  week's jobs — no new columns needed there.

## File-based entities (not database rows)

- **`clients/test-client-2/`** (Phase 7): A directory holding an isolated
  `.env.example`, `SOUL.md` stub, and `BRAND.md` stub — not a database concept.
  Its entire purpose is to exist *outside* the real brand's files so BOOTSTRAP's
  `--env` flag (Phase 7) can point at it without any risk of touching the real
  `SOUL.md`/`BRAND.md`/`HEARTBEAT.md` at the repo root.
- **`docs/client-provisioning.md`** (Phase 8) and
  **`docs/github-actions-setup.md`** (Phase 2): Documentation, not data.
