# Tasks: Week 4 — Brain, Loop, and Bootstrap

**Input**: Design documents from `/specs/004-week4-brain-loop/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/env-vars.md

**Tests**: Included — matches Week 3's established convention (unit tests per module,
mocked LLM/HTTP calls) rather than the template default of "optional."

**Sandbox note**: No Docker, no live Neon DB, no real `OPENROUTER_API_KEY` in this
environment (same limitation Week 3 documented). Tasks needing those are written to
be verifiable with mocks; live verification is called out explicitly where it can't be
mocked (e.g. BOOTSTRAP's OAuth flows).

**Organization**: Tasks are grouped by user story (spec.md) to enable independent
implementation and testing of each story, in priority order (P1 → P2 → P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: Maps to spec.md's user stories (US1–US7)
- Every task names its exact file path

---

## Phase 1: Setup

- [x] T001 Confirm the working tree is on branch `004-week4-brain-loop` and `git status --short` shows no unrelated uncommitted changes — repo root
- [x] T002 [P] Confirm `OPENROUTER_API_KEY` (or acceptance that only `MODEL_FREE` dry-runs are possible in this environment) and note the limitation, per the Sandbox note above

**Checkpoint**: Environment confirmed; known sandbox limitations recorded up front.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The LLM routing layer every user story in this feature depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T003 Add every new env var from `contracts/env-vars.md` to `apps/worker/config.py`'s `Settings` (OPENROUTER_*, MODEL_*, LLM_*, ANTI_REPEAT_*, COMPOSE_BATCH_CRON, COLLECT_METRICS_CRON, WEEKLY_DIGEST_CRON, MEMORY_MD_PATH)
- [x] T004 [P] Add `openai-agents[litellm]` to `apps/worker/requirements.txt` (research.md Decision 1 — the `litellm` extra is required for the `litellm/` model-string prefix)
- [x] T005 Implement `apps/worker/agents/base.py` — `MODEL_MAP` built from `settings.MODEL_*`, `model(name: str) -> str` returning `f"litellm/openrouter/{MODEL_MAP[name]}"` (research.md Decision 1 — no `litellm.yaml`, no proxy server), `load_prompt(*files)` concatenating SOUL.md + BRAND.md + AGENTS.md + a named `skills/` file from repo root
- [x] T006 Create `apps/worker/tests/test_agents_base.py` — a dry-run test that instantiates an `Agent` with `model("free")` and confirms a real OpenRouter round-trip succeeds (plan.md Phase 1's test; skip/mark expected-fail gracefully if `OPENROUTER_API_KEY` isn't set in the test environment)

**Checkpoint**: Foundation ready — every user story below can now build on `agents/base.py`.

---

## Phase 3: User Story 1 - Automatic caption writing (Priority: P1) 🎯 MVP (1/3)

**Goal**: A caption + hashtags generated automatically per asset+template pairing, in the brand's language, with no AI-sounding phrases.

**Independent Test**: Call `write_caption()` directly for one asset+template pair and confirm the caption is in the brand's language, contains no banned phrases, and needs no hand-editing.

### Tests for User Story 1

- [x] T007 [US1] Write `apps/worker/tests/test_composer.py` — `check_humanizer()` catches a known banned phrase (e.g. "elevate your space") and passes a clean caption

### Implementation for User Story 1

- [x] T008 [US1] Implement `HUMANIZER_BANNED_PHRASES` list and `check_humanizer(caption) -> list[str]` in `apps/worker/agents/composer.py` (research.md Decision 3 — code-level enforcement, not prompt-only)
- [x] T009 [US1] Implement `caption_agent` (temperature 0.8, instructions via `load_prompt("SOUL.md", "BRAND.md", "skills/caption-writer")`) in `apps/worker/agents/composer.py`
- [x] T010 [US1] Implement `write_caption(asset, template, brand) -> (caption, hashtags)` in `apps/worker/agents/composer.py`, regenerating (bounded retries) when `check_humanizer` finds a violation before ever returning a result
- [x] T011 [US1] Handle the caption model being unreachable: log and raise rather than returning a blank/placeholder caption (spec.md US1 acceptance scenario 3) in `apps/worker/agents/composer.py`
- [x] T012 [US1] Write an `audit_log` row for every caption-generation attempt (success, humanizer rejection, or failure) in `apps/worker/agents/composer.py`

**Checkpoint**: User Story 1 is independently testable — `write_caption()` can be called directly with a mocked LLM and verified end-to-end.

---

## Phase 4: User Story 2 - No repetitive posts (Priority: P1) 🎯 MVP (2/3)

**Goal**: A reusable gate that rejects a repeated template (4-post window), asset (10-post window), or near-duplicate caption (30-post window, 0.85 cosine similarity).

**Independent Test**: Seed a duplicate scenario (recently-used template/asset, or a near-identical caption embedding) and confirm the gate rejects it.

### Tests for User Story 2

- [x] T013 [US2] Write `apps/worker/tests/test_anti_repeat.py` — `check_template()` rejects a template used in the last 4 posts and accepts one that isn't
- [x] T014 [US2] Add to `apps/worker/tests/test_anti_repeat.py` — `check_asset()` rejects an asset used in the last 10 posts and accepts one that isn't
- [x] T015 [US2] Add to `apps/worker/tests/test_anti_repeat.py` — `check_caption()` rejects a near-identical embedding (`cosine_distance < 0.15`) and accepts a dissimilar one (research.md Decision 2 — this is the test that catches a distance/similarity inversion immediately if one is introduced)

### Implementation for User Story 2

- [x] T016 [US2] Create `apps/worker/composer/__init__.py` and `apps/worker/composer/anti_repeat.py` with `check_template(template_id) -> bool`, reading `ANTI_REPEAT_TEMPLATE_WINDOW` (data-model.md's template-repetition query)
- [x] T017 [US2] Implement `check_asset(asset_id) -> bool` in `apps/worker/composer/anti_repeat.py`, reading `ANTI_REPEAT_ASSET_WINDOW`
- [x] T018 [US2] Implement `check_caption(embedding) -> bool` in `apps/worker/composer/anti_repeat.py` using `Post.caption_vec.cosine_distance()`, reading `ANTI_REPEAT_CAPTION_WINDOW` and `ANTI_REPEAT_CAPTION_MAX_SIMILARITY` — **must compare as `cosine_distance < (1 - max_similarity)`, never `> max_similarity`** (research.md Decision 2)
- [x] T019 [US2] Write an `audit_log` row for every anti-repeat rejection, including which rule and which candidate was rejected, in `apps/worker/composer/anti_repeat.py`

**Checkpoint**: User Story 2 is independently testable — each `check_*` function can be called directly against seeded `posts`/`assets` rows.

---

## Phase 5: User Story 3 - Fully automatic daily draft queue (Priority: P1) 🎯 MVP (3/3)

**Goal**: `compose_batch` produces real, non-repeating draft posts end-to-end with zero manual input — the payoff User Stories 1 and 2 exist to serve.

**Independent Test**: Run `compose_batch()` once (mocked LLM + mocked render) and confirm new `posts` rows appear in `state='review'` with a real caption and `render_url`.

### Tests for User Story 3

- [x] T020 [US3] Write `apps/worker/tests/test_compose_batch.py` — a full run (mocked `caption_agent`, mocked render call) produces a `posts` row with caption and `render_url` set
- [x] T021 [US3] Add to `apps/worker/tests/test_compose_batch.py` — a forced anti-repeat violation causes a retry (not a published duplicate), capped at `ANTI_REPEAT_MAX_RETRIES` (spec.md US2 acceptance scenario 4)

### Implementation for User Story 3

- [x] T022 [US3] Create `apps/worker/jobs/compose_batch.py` — asset-picking logic respecting `assets.times_used` and `anti_repeat.check_asset`
- [x] T023 [US3] Implement template-picking logic respecting `anti_repeat.check_template` in `apps/worker/jobs/compose_batch.py`
- [x] T024 [US3] Wire `caption_agent.write_caption` → embed the result (`model("embed")`) → `anti_repeat.check_caption`, retrying up to `ANTI_REPEAT_MAX_RETRIES` on rejection, in `apps/worker/jobs/compose_batch.py`
- [x] T025 [US3] Call the existing `RENDER_INTERNAL_URL` `/api/internal/render` endpoint (Week 2) and write the `posts` row (`state='draft'` → `'review'` once render succeeds) in `apps/worker/jobs/compose_batch.py`
- [x] T026 [US3] Handle asset/template exhaustion — produce fewer posts than requested and report the shortfall rather than forcing a repeat (spec.md US3 acceptance scenario 2) in `apps/worker/jobs/compose_batch.py`
- [x] T027 [US3] Write an `audit_log` row for every post composed and every reported shortfall in `apps/worker/jobs/compose_batch.py`
- [x] T028 [US3] Wire `compose_batch` to APScheduler using `settings.COMPOSE_BATCH_CRON` in `apps/worker/main.py`

**Checkpoint**: 🎯 **MVP complete.** User Stories 1+2+3 together deliver the entire "no manual work" outcome standalone — a full day's draft queue with zero manual photo/template/caption selection.

---

## Phase 6: User Story 4 - Performance visibility without checking each app (Priority: P2)

**Goal**: Per-post performance numbers collected automatically and visible in one place.

**Independent Test**: After a post has been "published" (mocked), confirm its numbers land in `metrics` and render on the performance screen.

### Tests for User Story 4

- [x] T029 [US4] Write `apps/worker/tests/test_collect_metrics.py` — a successful post writes a `metrics` row for both the `24h` and `7d` window
- [x] T030 [US4] Add to `apps/worker/tests/test_collect_metrics.py` — a manually-posted/draft-only post (no API-visible metrics) is skipped without raising (FR-009)
- [x] T031 [US4] Add to `apps/worker/tests/test_collect_metrics.py` — a YouTube credential missing `yt-analytics.readonly` is skipped with the reason recorded, without failing the rest of the run (research.md Decision 5)

### Implementation for User Story 4

- [x] T032 [P] [US4] Add `https://www.googleapis.com/auth/yt-analytics.readonly` to `SCOPES` in `apps/worker/publishers/youtube.py` (research.md Decision 5)
- [x] T033 [US4] Create `apps/worker/jobs/collect_metrics.py` — Facebook/Instagram metrics via the batched `?ids=...&fields=insights.metric(reach,saved,shares,total_interactions)` syntax plus direct `like_count`/`comments_count` fields (research.md Decision 4). **Before writing this task's Facebook Page (non-Instagram) path, verify current post-insights metric names via Tavily** — research.md's Open Questions flagged this as not yet deep-verified.
- [x] T034 [US4] Implement the YouTube metrics pull via `reports.query` (`dimensions=video`, `filters=video==<id>`, `metrics=views,likes,comments,shares`, both `24h`/`7d` `startDate`/`endDate` windows) in `apps/worker/jobs/collect_metrics.py`
- [x] T035 [US4] Write `metrics` rows per post per window, isolating per-post failures via the `error` column rather than aborting the run (FR-009) in `apps/worker/jobs/collect_metrics.py`
- [x] T036 [US4] Write an `audit_log` row for every collection attempt per post in `apps/worker/jobs/collect_metrics.py`
- [x] T037 [US4] Wire `collect_metrics` to APScheduler using `settings.COLLECT_METRICS_CRON` in `apps/worker/main.py`
- [x] T038 [P] [US4] Create `apps/dashboard/app/(dashboard)/performance/page.tsx` — read-only screen showing `metrics` joined to `posts`, grouped by platform and window, matching the Queue screen's visual conventions

**Checkpoint**: User Story 4 is independently testable and deployable without User Story 5.

---

## Phase 7: User Story 5 - Weekly performance summary, delivered automatically (Priority: P2)

**Goal**: An automatic, written weekly recap delivered to Discord and persisted to `MEMORY.md`.

**Independent Test**: Trigger `weekly_digest()` and confirm a summary is both sent to Discord and appended to `MEMORY.md`.

### Tests for User Story 5

- [x] T039 [US5] Write `apps/worker/tests/test_weekly_digest.py` — a week with published posts produces a summary sent via `notify.discord.send` and appended to `MEMORY.md`
- [x] T040 [US5] Add to `apps/worker/tests/test_weekly_digest.py` — a week with zero published posts reports the absence of activity rather than fabricating a summary (spec.md US5 acceptance scenario 2)

### Implementation for User Story 5

- [x] T041 [US5] Create `apps/worker/jobs/weekly_digest.py` — query the past 7 days of `metrics` + `audit_log` (posts published per platform, top performer, repeated failures)
- [x] T042 [US5] Call the `judgement` model tier to write the prose summary in `apps/worker/jobs/weekly_digest.py`
- [x] T043 [US5] Append a dated `## Week of YYYY-MM-DD` section to `MEMORY.md` (create if absent, per `settings.MEMORY_MD_PATH`) in `apps/worker/jobs/weekly_digest.py`
- [x] T044 [US5] Send the same summary via the existing `notify.discord.send` (Week 3, reused as-is) in `apps/worker/jobs/weekly_digest.py`
- [x] T045 [US5] Write an `audit_log` row for every digest generation in `apps/worker/jobs/weekly_digest.py`
- [x] T046 [US5] Wire `weekly_digest` to APScheduler using `settings.WEEKLY_DIGEST_CRON` in `apps/worker/main.py`

**Checkpoint**: User Stories 4+5 together deliver full performance visibility, independent of User Stories 6/7.

---

## Phase 8: User Story 6 - Photo library quality gate (Priority: P3)

**Goal**: New asset uploads auto-tagged and quality-screened without manual entry.

**Independent Test**: Process a newly uploaded photo and confirm it's tagged (piece/tier/variant/quality_score) and flagged if it fails the quality check.

**⚠️ Scope note discovered during task generation**: spec.md and plan.md assumed this
plugs into "the existing Week 2 Assets upload flow" (docs/socialfte-spec-v2.md §10
promised an Assets screen alongside Templates). That screen was never actually built —
there is no asset-upload route or page anywhere in `apps/dashboard`, only
`apps/worker/mcp/asset_mcp.py`'s one-line Week 3 stub. Without *some* ingestion path,
this story has nothing to process and its Independent Test ("upload a photo") is
literally not runnable end-to-end. T048 below adds the minimal missing piece
(a single internal upload endpoint, matching the existing `/api/internal/render`
pattern) rather than silently assuming it exists or silently expanding this into a
full Assets *screen* (browsing/editing/deleting) — that larger screen is still a
separate, not-yet-scoped gap worth flagging back to the user, not something to build
unasked as a side effect of this task.

### Tests for User Story 6

- [x] T047 [US6] Write `apps/worker/tests/test_vision.py` — `quality_gate()` sets `reject_reason` when `quality_score < 60` and leaves it null otherwise (the schema's documented threshold)

### Implementation for User Story 6

- [x] T048 [US6] Create `apps/dashboard/app/api/internal/assets/upload/route.ts` — the minimal missing ingestion path: verify `RENDER_INTERNAL_SECRET` (matching `/api/internal/render`'s existing auth pattern), accept an image upload, store it via the existing `apps/dashboard/lib/r2.ts` `uploadBuffer`, insert an `assets` row with `quality_score`/`lighting_ok`/`composition_ok`/`piece`/`tier`/`variant` left null, and call the worker's tagging endpoint (or queue it) so T049/T050 below have something to run against

- [x] T049 [US6] Implement `vision_agent` (temperature 0.2, instructions via `load_prompt("skills/asset-tagging")`) in `apps/worker/agents/vision.py`
- [x] T050 [US6] Implement `tag_asset(image_url) -> dict` (piece/tier/variant/quality_score) in `apps/worker/agents/vision.py`
- [x] T051 [US6] Implement `quality_gate(image_url) -> (lighting_ok, composition_ok, reject_reason)` in `apps/worker/agents/vision.py`
- [x] T052 [US6] Stub `select_cover_frame(video_url)` — signature only, `raise NotImplementedError` (Week 5 territory, per the original kickoff) in `apps/worker/agents/vision.py`
- [x] T053 [US6] Wire `tag_asset` + `quality_gate` into T048's upload endpoint so every new asset is processed automatically on upload, with a manual-entry fallback if either agent call fails (don't block the upload itself on a vision-model outage)
- [x] T054 [US6] Write an `audit_log` row for every asset tagged/quality-checked

**Checkpoint**: User Story 6 is independently testable and shippable without User Story 7.

---

## Phase 9: User Story 7 - Guided setup for a new brand (Priority: P3)

**Goal**: A resumable, guided setup flow (CLI + dashboard) that a second brand can use to fully onboard with zero code edits — built last, since its final step exercises every other Week 4 (and Week 2/3) feature.

**Independent Test**: Run the flow against a fresh/empty config to completion; separately, kill it mid-flow and confirm resuming doesn't re-ask already-answered steps.

### Tests for User Story 7

- [x] T055 [US7] Write `apps/worker/tests/test_bootstrap.py` — interrupting after Step 2 and resuming does not re-prompt Step 1 or Step 2's questions (research.md Decision 7)
- [x] T056 [US7] Add to `apps/worker/tests/test_bootstrap.py` — the verify-and-finish step reports each check (render, per-platform test post, notification, LLM call) individually rather than a single pass/fail (spec.md US7 acceptance scenario 2)

### Implementation for User Story 7

- [x] T057 [US7] Create `apps/worker/bootstrap/__init__.py` and `apps/worker/bootstrap/steps.py` — Step 1 (agent identity → `SOUL.md`, `IDENTITY.md`)
- [x] T058 [US7] Implement Step 2 (brand → `BRAND.md` + regenerates `packages/remotion/src/brand.ts`/`fonts.ts` by invoking the existing `/brand-setup` skill) in `apps/worker/bootstrap/steps.py`
- [x] T059 [US7] Implement Step 3 (platforms → runs each platform's existing OAuth flow, writes to `credentials`) in `apps/worker/bootstrap/steps.py`
- [x] T060 [US7] Implement Step 4 (notification channel → walks the chosen channel's setup, sends and confirms a real test message) in `apps/worker/bootstrap/steps.py`
- [x] T061 [US7] Implement Step 5 (cadence → `HEARTBEAT.md`) in `apps/worker/bootstrap/steps.py`
- [x] T062 [US7] Implement Step 6 (verify-and-finish: real render, real private/draft test post per connected platform, real notification, real LLM call via `model("free")` or a paid tier — each result reported individually; deletes `BOOTSTRAP.md` only if all required checks pass) in `apps/worker/bootstrap/steps.py`
- [x] T063 [US7] Add a per-step resumability check (skip re-prompting when that step's output already exists, per data-model.md's per-step markers) to every step in `apps/worker/bootstrap/steps.py`
- [x] T064 [US7] Create `apps/worker/bootstrap/cli.py` — the `python -m worker bootstrap` entry point
- [x] T065 [P] [US7] Create `apps/dashboard/app/setup/page.tsx` — the dashboard equivalent walking the same six steps against the same underlying state
- [x] T066 [US7] Ensure both entry points refuse to run "first-time setup" once `BOOTSTRAP.md` no longer exists (FR-018) in `apps/worker/bootstrap/cli.py` and `apps/dashboard/app/setup/page.tsx`
- [x] T067 [US7] Audit `apps/worker/bootstrap/` and `apps/dashboard/app/setup/` for any brand-specific hardcoded value (FR-019) — everything must come from collected config, not a constant

**Checkpoint**: All seven user stories are now independently functional. A second brand can be onboarded using only this flow (SC-006).

---

## Phase 10: Polish & Cross-Cutting Concerns

- [x] T068 [P] Review Phases 3–9 (composer, anti-repeat, compose_batch, collect_metrics, weekly_digest, vision, bootstrap) confirming every automated decision writes an `audit_log` row (FR-015) — fix any gap found
- [x] T069 [P] Spot-check Week 1–3 code for audit-log gaps per plan.md Phase 9 — note findings; fix only if trivial, otherwise document for a future pass
- [x] T070 Add every new env var from `contracts/env-vars.md` to `.env.example`

---

## Phase 11: Checkpoint

- [x] T071 Run `python -m pytest apps/worker/tests/` — all tests pass (existing Week 1–3 tests plus everything from Phases 2–9)
- [x] T072 Manually verify spec.md's SC-001 through SC-007 against the implemented behavior (most are exercised by the unit tests above; SC-004/SC-006 need a manual look at the Performance screen and a BOOTSTRAP dry run respectively)
- [ ] T073 Git commit: `git commit -m "week4: brain, loop, bootstrap"`

**Checkpoint**: All tests pass; all success criteria verified; code committed.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS every user story (all agents read `agents/base.py`)
- **User Stories (Phase 3–9)**: All depend on Phase 2. Within the P1 group, sequence matters for a working system even though each story is independently *testable*: US1 (caption) and US2 (anti-repeat) have no dependency on each other and can be built in parallel, but US3 (compose_batch) calls into both, so it comes after.
- **Polish (Phase 10)**: Depends on Phases 3–9 existing (it reviews them)
- **Checkpoint (Phase 11)**: Depends on everything

### User Story Dependencies

- **US1 (P1)**: Depends only on Phase 2. Independent of US2.
- **US2 (P1)**: Depends only on Phase 2. Independent of US1.
- **US3 (P1)**: Depends on US1 (`write_caption`) and US2 (`check_*`) — this is the integration point, not a discovery phase.
- **US4 (P2)**: Depends only on Phase 2 (reads already-published Week 3 posts) — can be built in parallel with the entire US1→US2→US3 chain.
- **US5 (P2)**: Depends on US4 (needs `metrics` data to summarize) and Phase 2 (judgement model).
- **US6 (P3)**: Depends only on Phase 2. Independent of every other story.
- **US7 (P3)**: Depends on ALL other stories — its verify-and-finish step exercises every one of them, plus Week 2/3's render and publish paths. Built last per docs/socialfte-spec-v2.md §10.

### Within Each User Story

- Tests before implementation (TDD, per this project's established Week 3 convention)
- Agent/gate/job logic before scheduler wiring
- Story complete (including its scheduler wiring, where applicable) before moving to the next priority

### Parallel Opportunities

- T003–T006 (Phase 2): T004 (`requirements.txt`) is parallel with T003 (`config.py`); T005/T006 are sequential (each depends on the previous).
- US1 (Phase 3) and US2 (Phase 4) can be developed in parallel by two people/agents — neither's files overlap and neither depends on the other.
- US4 (Phase 6) can be developed in parallel with the entire US1→US2→US3 chain (Phases 3–5) — no shared files, no dependency either direction.
- US6 (Phase 8) can be developed in parallel with any other story — it only touches `agents/vision.py` and the Week 2 upload flow.
- Within US4: T032 (YouTube scope, `publishers/youtube.py`) is parallel with T033 (`collect_metrics.py`); T038 (dashboard screen) is parallel with the whole worker-side implementation (different app entirely).
- Within US7: T065 (dashboard `/setup` page) is parallel with the CLI-side steps (T057–T064) until T066, which touches both.

---

## Parallel Example: User Story 1 + User Story 2 together

```bash
# Two independent stories, zero shared files — safe to run as two parallel workstreams
# once Phase 2 (Foundational) is complete:

Track A (US1 — apps/worker/agents/composer.py):
  T007 → T008 → T009 → T010 → T011 → T012

Track B (US2 — apps/worker/composer/anti_repeat.py):
  T013 → T014 → T015 → T016 → T017 → T018 → T019

# US3 (compose_batch.py) cannot start until BOTH tracks reach their checkpoint.
```

---

## Implementation Strategy

### MVP First (User Stories 1+2+3 only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational — blocks everything)
2. Complete Phase 3 (US1) and Phase 4 (US2), in parallel if staffed
3. Complete Phase 5 (US3) — this is the actual MVP payoff
4. **STOP and VALIDATE**: run `compose_batch` against a mocked LLM/render and confirm a real, non-repeating draft post is produced end-to-end
5. This alone delivers spec.md's SC-001 and SC-002 — deployable as a standalone increment

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 + US2 → US3 (MVP: zero-manual-work draft queue) → validate → deploy
3. US4 → US5 (performance visibility + weekly digest) → validate → deploy
4. US6 (asset quality gate) → validate → deploy
5. US7 (BOOTSTRAP) → validate against a throwaway config → deploy

### Parallel Team Strategy

1. Team completes Setup + Foundational together (short — 4 tasks)
2. Once Foundational is done:
   - Developer/Agent A: US1 → then joins US3 once US2 is also ready
   - Developer/Agent B: US2 → then joins US3
   - Developer/Agent C: US4 (fully independent) → then US5
   - Developer/Agent D: US6 (fully independent)
3. US7 starts only once A/B/C/D's stories are all done — it depends on all of them

---

## Notes

- [P] tasks touch different files with no dependency on an incomplete task in the same phase — verified per-task above, not applied by default.
- Every implementation file that a story builds incrementally (e.g. `composer.py`,
  `anti_repeat.py`, `compose_batch.py`) has its tasks listed sequentially on purpose —
  marking same-file tasks `[P]` would just create merge conflicts, not real parallelism.
- research.md's "Open questions" (Facebook Page post-metric names, current OpenRouter
  model slugs, exact `openai-agents`/`litellm` version pins) are called out inline on
  the specific tasks they affect (T033, T009) rather than left to be rediscovered.
- Commit after each user story's checkpoint, not after every individual task.
