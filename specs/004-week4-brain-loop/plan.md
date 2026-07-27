# Plan: Week 4 — Brain, Loop, and Bootstrap

**Branch**: `004-week4-brain-loop` | **Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md)
**Strategy**: Build in dependency order — the P1 chain (caption agent → anti-repeat →
compose_batch) first, since compose_batch is the payoff and can't work without the
other two; P2 (metrics → digest) next, since digest needs metrics data to summarize;
P3 (vision quality gate, BOOTSTRAP) last, matching both the spec's priorities and
docs/socialfte-spec-v2.md §10's explicit "BOOTSTRAP written last."

**Deviation from the original kickoff worth flagging**: the kickoff's Step 1 asked
for `apps/worker/config/litellm.yaml` (a LiteLLM Proxy config file). research.md
Decision 1 found this isn't the right shape for a single in-process worker — no
separate proxy file is created; `agents/base.py` reads the existing
`MODEL_CAPTION`/`MODEL_JUDGEMENT`/`MODEL_VISION`/`MODEL_EMBED` env vars directly and
builds `litellm/openrouter/<model>` strings at runtime instead.

---

## Phase 1: LLM routing foundation (Step 1)

**Goal**: One place every agent gets its model from, config-driven per FR-019.

**Files to create/change**:
- `apps/worker/config.py` — add the env vars in `contracts/env-vars.md`
- `apps/worker/agents/base.py` — `MODEL_MAP` built from `settings.MODEL_*`, a
  `model(name: str) -> str` helper returning `f"litellm/openrouter/{MODEL_MAP[name]}"`,
  and `load_prompt(*files)` concatenating SOUL.md + BRAND.md + AGENTS.md + a named
  `skills/` file from repo root
- `apps/worker/requirements.txt` — add `openai-agents[litellm]`

**Dependencies**: None (foundational)

**Risk**: Low — no business logic, but get this wrong and every downstream agent is
wrong the same way. Verify with a real (free-tier) OpenRouter call before building
anything on top: `MODEL_FREE` exists exactly for this.

**Test**: A dry-run script that instantiates an `Agent` with `model("free")` and
confirms a real round-trip to OpenRouter succeeds, without needing the paid tiers.

---

## Phase 2: Caption agent + humanizer (Step 2)

**Goal**: A caption a human wouldn't need to rewrite before posting.

**Files to create**:
- `apps/worker/agents/composer.py` — `caption_agent` (temperature 0.8, per §2),
  `write_caption(asset, template, brand) -> (caption: str, hashtags: list[str])`,
  `HUMANIZER_BANNED_PHRASES` list, `check_humanizer(caption) -> list[str]` (returns
  violations found, empty list = pass)

**Dependencies**: Phase 1

**Risk**: Medium — the humanizer check (research.md Decision 3) is a static list, so
its failure mode is under-catching, not crashing. Acceptable per Decision 3's
reasoning (start narrow, extend over time) but worth stating: this phase is never
"done," it's a starting point.

**Test**: Unit test with a hand-written caption containing a known banned phrase,
verifying `check_humanizer` catches it; a second test verifying a clean caption
passes.

---

## Phase 3: Vision agent (Step 3)

**Goal**: New asset uploads get tagged and quality-checked without manual entry.

**Files to create**:
- `apps/worker/agents/vision.py` — `vision_agent` (temperature 0.2, per §2),
  `tag_asset(image_url) -> dict` (piece/tier/variant/quality_score),
  `quality_gate(image_url) -> (lighting_ok, composition_ok, reject_reason)`. Per the
  original kickoff, `select_cover_frame(video_url)` is stubbed (signature only,
  `raise NotImplementedError`) — full implementation is Week 5 territory (Remotion/
  video work hasn't started yet).

**Dependencies**: Phase 1

**Risk**: Low — this only writes to `assets` columns that already exist and are
currently unused; nothing downstream depends on it yet except the (already-manual)
Week 2 Assets screen picking up the new metadata.

**Test**: Unit test with a mocked vision-model response verifying `quality_gate`
correctly sets `reject_reason` when `quality_score < 60` (the schema comment's
documented threshold) and leaves it null otherwise.

---

## Phase 4: pgvector anti-repeat gate (Step 4)

**Goal**: A single function compose_batch can call that returns pass/fail with a
reason, per research.md Decision 2's cosine-distance inversion.

**Files to create**:
- `apps/worker/composer/anti_repeat.py` (new module — not an agent, a DB-query gate;
  keeping it out of `agents/` avoids conflating "calls an LLM" with "queries Postgres")
  — `check_template(template_id) -> bool`, `check_asset(asset_id) -> bool`,
  `check_caption(embedding) -> bool`, each reading its window size from the
  `ANTI_REPEAT_*` env vars in `contracts/env-vars.md`

**Dependencies**: Phase 1 (for the embed model, via `agents/base.py`)

**Risk**: Medium — this is the correctness-critical piece per research.md Decision 2;
a backwards comparison silently disables the whole feature without erroring. Write
the unit test for this *before* wiring it into compose_batch.

**Test**: Unit test seeding a known caption embedding, then checking a
near-identical embedding is rejected (`check_caption` returns `False`) and a
dissimilar one is accepted (`True`) — this is the test that would have caught a
distance/similarity inversion immediately.

---

## Phase 5: compose_batch cron (Step 5)

**Goal**: The actual daily payoff — User Story 3.

**Files to create**:
- `apps/worker/jobs/compose_batch.py` — picks an asset (respecting `times_used` +
  Phase 4's asset check), picks a template (respecting Phase 4's template check),
  calls `composer.write_caption`, embeds it and runs Phase 4's caption check
  (retry up to `ANTI_REPEAT_MAX_RETRIES`, per research.md Decision 6), calls
  `RENDER_INTERNAL_URL`'s `/api/internal/render` (existing Week 2 endpoint), writes
  the `posts` row (`state='draft'`, then `'review'` once render succeeds), writes
  `audit_log` for every decision (asset/template/caption chosen, every anti-repeat
  rejection with its reason)

**Dependencies**: Phases 1–4

**Risk**: High — this is the phase that ties everything else together; any bug in
Phases 1–4 surfaces here first. Sequenced after all four specifically so this phase
is integration, not discovery.

**Test**: Integration-style unit test (mocked LLM + mocked render call) verifying a
full run produces a `posts` row with a real caption and `render_url`, and a second
test verifying a forced anti-repeat violation causes a retry rather than a published
duplicate (User Story 2's acceptance scenario 4).

---

## Phase 6: collect_metrics cron (Step 6)

**Goal**: Real numbers in the `metrics` table, per research.md Decisions 4 and 5.

**Files to create**:
- `apps/worker/jobs/collect_metrics.py` — for each published post (both 24h and 7d
  windows): Facebook/Instagram via the batched `?ids=` insights syntax (Decision 4),
  YouTube via `reports.query` (Decision 5, gracefully skipping credentials missing
  `yt-analytics.readonly` — recorded via `credentials.meta`, not a hard failure),
  TikTok skipped entirely (draft-only posts have no API-visible metrics — FR-009)

**Dependencies**: None from this feature (reads already-published posts from Week 3)
— can be built in parallel with Phases 1–5

**Risk**: Medium — platform API research.md flagged as needing implementation-time
re-verification (Facebook Page post metrics specifically weren't deep-verified).
Budget time to re-check via Context7/Tavily when writing this file, the same way
Week 3's Meta/TikTok bugs were only caught by checking live docs.

**Test**: Unit test with mocked HTTP responses verifying a successful post writes a
`metrics` row per window, and a post from an unsupported path (e.g. TikTok
draft-only) is skipped without raising.

---

## Phase 7: Performance dashboard screen (Step 7)

**Goal**: User Story 4 — see numbers without opening each platform.

**Files to create**:
- `apps/dashboard/app/(dashboard)/performance/page.tsx` — reads `metrics` joined to
  `posts`, grouped by platform and window, styled per the existing Queue screen's
  conventions (forest green / gold / Instrument Serif / Archivo — no new design
  system)

**Dependencies**: Phase 6 (needs real rows to render — can be scaffolded in parallel
with placeholder data, but not verifiable end-to-end until Phase 6 lands)

**Risk**: Low — read-only screen, no write path, follows an existing pattern
(Week 3's Queue screen) closely.

**Test**: Not unit-testable in the Python sense; verify manually per this feature's
checkpoint (Phase 11) once real metrics rows exist.

---

## Phase 8: weekly_digest cron (Step 8)

**Goal**: User Story 5 — a written summary, delivered without anyone asking for it.

**Files to create**:
- `apps/worker/jobs/weekly_digest.py` — queries the past 7 days of `metrics` +
  `audit_log`, calls the `judgement` model tier to write prose, appends a dated
  section to `MEMORY.md` (creating it if absent — data-model.md), sends the same
  summary via `notify.discord.send` (existing Week 3 function, reused as-is)

**Dependencies**: Phase 6 (needs metrics data to summarize) and Phase 1 (judgement
model)

**Risk**: Low — read + LLM call + file append + an existing, already-tested notify
function. The only edge case (spec.md: zero posts that week) is a plain conditional,
not a design problem.

**Test**: Unit test verifying a week with no published posts produces a summary that
says so rather than a fabricated one (spec.md's explicit acceptance scenario).

---

## Phase 9: Audit log coverage pass (Step 9)

**Goal**: FR-015 — no automated decision in this feature is unlogged.

**Work**: Not a new file — a review pass over every phase above (composer decisions,
every anti-repeat rejection/retry, every metrics-collection attempt per post, every
digest generation) confirming each writes an `audit_log` row, using the same
`_write_audit()` helper pattern already established in Week 3's job files. Also:
spot-check Week 1–3 code for gaps (per the original kickoff) and note (not
necessarily fix) anything found — this is a documentation/discovery task riding
along with the phase, not a mandate to refactor already-shipped weeks.

**Dependencies**: Phases 2–8 (reviews their output)

**Risk**: Low

**Test**: N/A — verified by code review, not a new automated test (each phase's own
tests already assert its specific audit-log calls where it matters).

---

## Phase 10: BOOTSTRAP wizard (Step 10)

**Goal**: User Story 7 — onboard a second brand with zero code edits (FR-019, SC-006).

**Files to create**:
- `apps/worker/bootstrap/__init__.py`, `apps/worker/bootstrap/cli.py` (the
  `python -m worker bootstrap` entry point), `apps/worker/bootstrap/steps.py` (the
  six steps from §6, each following research.md Decision 7's resumability rule —
  check for existing output before re-prompting)
- `apps/dashboard/app/setup/page.tsx` — the dashboard equivalent, same six steps,
  same underlying resumability checks (reads the same files/DB rows the CLI does —
  research.md's "one flow, two entry points," not two specs)

**Dependencies**: Every other phase — Step 6's "verify and finish" exercises a real
render (Week 2), a real post attempt (Week 3), a real notification (Week 3), and a
real LLM call (Phase 1). This is why it's built last, exactly as
docs/socialfte-spec-v2.md §10 says: "written last, because by now you know exactly
what it needs to produce."

**Risk**: Medium — mostly orchestration of already-built pieces, but the
resumability requirement (spec.md edge case) means every step needs an explicit
"is this already done" check, which is easy to skip under time pressure and only
notice when someone actually kills the process mid-run.

**Test**: An end-to-end test (or documented manual run, since this touches OAuth
flows that don't mock cleanly) against a throwaway config, verifying it can be
interrupted after Step 2 and resumed without re-asking Step 1/2's questions.

---

## Phase 11: Checkpoint (Step 11)

Mirrors spec.md's Success Criteria directly — see spec.md SC-001 through SC-007 for
the full list. Additionally:

- [ ] `python -m pytest apps/worker/tests/` — all tests pass (existing Week 1–3 tests
      plus everything added in Phases 1–10)
- [ ] `git commit -m "week4: brain, loop, bootstrap"`

---

## Dependency Graph

```
Phase 1 (LLM routing)
  ├─→ Phase 2 (caption agent) ─┐
  ├─→ Phase 3 (vision agent)    │
  ├─→ Phase 4 (anti-repeat) ────┼─→ Phase 5 (compose_batch) ─┐
  │                              │                              │
  Phase 6 (collect_metrics, independent) ─┬─→ Phase 7 (Performance screen)
                                            └─→ Phase 8 (weekly_digest, needs Phase 1 too)
                                                              │
Phase 9 (audit log pass) ← reviews Phases 2–8 ────────────────┤
                                                              │
Phase 10 (BOOTSTRAP) ← depends on ALL of the above ──────────┴─→ Phase 11 (Checkpoint)
```

## Critical Path

Phase 1 → Phase 2 → Phase 4 → Phase 5 → Phase 6 → Phase 8 → Phase 10 → Phase 11

## Parallelization Opportunities

- Phase 3 (vision agent) can be built alongside Phase 2 — both only depend on Phase 1
  and don't depend on each other.
- Phase 6 (collect_metrics) has no dependency on Phases 2–5 at all and can start as
  soon as Phase 1 lands, in parallel with the whole caption/anti-repeat/compose_batch
  chain.
- Phase 7 (Performance screen) can be scaffolded with placeholder data before Phase 6
  is fully verified, though it can't be *confirmed* working until real rows exist.

## Testing Strategy

Per Week 3's precedent: unit tests with mocked LLM/HTTP calls for each job/agent
module, plus the platform-API-specific note in Phase 6 to re-verify current
endpoint behavior via Context7/Tavily at implementation time rather than trusting
this plan's research snapshot indefinitely — APIs (as Week 3 proved with Meta/TikTok,
and this plan's own research.md Decision 4 proved again with Meta's May 2026 insights
breaking change) drift faster than a spec document does.

## Rollback Plan

Every new cron job (compose_batch, collect_metrics, weekly_digest) is additive —
none modify or depend on Week 1–3 jobs continuing to run unchanged, and each can be
disabled independently by removing its `scheduler.add_job` call in `main.py` without
affecting the others. BOOTSTRAP is opt-in (only runs if invoked) and never runs
automatically on a schedule, so it carries no rollback risk to the running system.

## Notes

- No `schema.sql` changes this week (data-model.md) — lowest-risk week yet from a
  data-migration standpoint.
- The single highest-risk unknown carried into `/sp.tasks` is Facebook Page
  (non-Instagram) post-insights metric names (research.md's Open Questions) —
  flagging here so it isn't forgotten between planning and implementation.
