# Plan: Week 5 — Motion, Calendar, and Generalise

**Branch**: `005-week5-motion-generalise` | **Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md)
**Strategy**: Motion capability first (US1 → US2 → US3, in that dependency order —
a clip has nothing to verify or pick a cover from until compositions/rendering
exist), then the independent Calendar improvement (US4), then generalise last
(US5 → US6 → US7), matching both the spec's own priorities and
docs/repo-harvest.md's framing of "generalise" as the final step once everything
else is real.

**Deviation from the literal kickoff worth flagging**: Step 2 asked for
`--props='{props}'` (a raw JSON string interpolated directly into the render
command). research.md Decision 4 found this is a documented GitHub Actions
script-injection anti-pattern and that Remotion's own official example writes
the input to a file first. Building the safer, equally-supported file-based
version instead — same inputs, same outcome, no shell-injection surface.

---

## Phase 1: Remotion 9:16 compositions (Step 1 → US1)

**Goal**: Four working compositions, verified in Remotion Studio, that read
`brand.ts`/`fonts.ts` with zero hardcoded hex values.

**Files to create**:
- `packages/remotion/src/compositions/HeroReveal.tsx`
- `packages/remotion/src/compositions/PriceReveal.tsx`
- `packages/remotion/src/compositions/FabricDetail.tsx`
- `packages/remotion/src/compositions/SetReveal.tsx`

**Dependencies**: None — `src/compositions/`'s registry, `brand.ts`/`fonts.ts`,
and `lib/kit`'s shared primitives all already exist (Week 1).

**Risk**: Low — `BrandProof.tsx` is a working, verified example of the exact
contract (`compositionConfig` + component reading brand tokens) to copy from.
The only new technique is `<Img src={imageUrl}>` for a runtime/remote image
(research.md Decision 2) instead of a bundled static asset.

**Test**: `npm run studio` (per the kickoff) — all four render without errors at
1080×1920. Not a `pytest`/Python test; this is a manual visual verification step,
consistent with how `BrandProof.tsx` itself is verified (per `/brand-setup`'s own
"Prove it" stage).

---

## Phase 2: GitHub Actions render dispatch + worker callback (Step 2 → US1)

**Goal**: A finished video composition can be turned into an actual MP4 in R2 and
routed back into the review queue without a human running anything by hand.

**Files to create**:
- `.github/workflows/render-video.yml` — `workflow_dispatch` inputs
  (`composition_id`, `props`, `output_key`); writes `props` to a JSON file first
  (research.md Decision 4), renders, uploads to R2 via `aws s3 cp` with
  `--endpoint-url`/`region=auto` (research.md Decision 5), then `curl`s
  `CALLBACK_URL` with `{output_key, status}`
- `docs/github-actions-setup.md` — documents the five required repo secrets
  (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET`,
  `CALLBACK_URL`) and how to add them
- `apps/worker/main.py` — add `POST /api/render-complete` (updates the `posts`
  row: `render_url = R2_PUBLIC_URL/output_key`, `state = 'review'`), following
  the same `x-render-secret`/`x-internal-secret` auth pattern already used by
  `/vision/tag` (Week 4)
- `apps/worker/jobs/dispatch_render.py` — `dispatch_video_render(post_id,
  composition_id, props)`, calls the GitHub REST API's `workflow_dispatch`
  endpoint via `GITHUB_TOKEN`, polls run status every 30s capped at 15 minutes
  (research.md's Open Questions flags this cap as unverified against a real
  render's actual duration — revisit once one has been timed)

**Dependencies**: Phase 1 (needs a real `composition_id` to dispatch)

**Risk**: High — this is the first time this project's CI has talked to R2, and
the first time the worker exposes a webhook-style callback endpoint for an
external (GitHub-hosted) caller rather than an internal one. Budget real
verification time here specifically, not just at plan time.

**Test**: Unit test for `dispatch_render.py` with a mocked GitHub API verifying
the correct inputs are sent (per the kickoff). The end-to-end GitHub Actions →
R2 → callback path itself is not unit-testable — it's part of Phase 9's
checkpoint (a real dispatched render, verified manually).

---

## Phase 3: Audio processing pipeline (Step 3 → US2)

**Goal**: Every uploaded video clip gets noise-cleaned, sync-checked, and
music-mixed automatically before it's usable — the trust/safety gate on any
clip-based content.

**Files to create/change**:
- `apps/worker/db/schema.sql` — add `assets.kind` (`'photo' | 'clip'`,
  default `'photo'`), `assets.processed` (boolean, default `true`),
  `assets.sync_ok` (nullable boolean) (research.md Decision 7 — first schema
  change since Week 2)
- `apps/worker/db/models.py` — mirror the same three columns
- `apps/worker/jobs/process_footage.py` — APScheduler-triggered job polling for
  `assets` where `kind='clip' AND processed=false`; calls
  `tools/media/clean_voice.py` (local RNNoise path only — already true per
  Week 1's harvest, no ElevenLabs branch exists to remove), `tools/media/
  verify_cut.py` (A/V drift), and on pass, `tools/media/mix_music.py` (a bed
  from `media/library/music/` at -18dB under the voice); writes `sync_ok` and
  `quality_score`; sets `processed=true` regardless of pass/fail so the job
  never reprocesses the same clip twice

**Dependencies**: None from Phases 1–2 — this can be built in parallel with the
whole video-composition/render-dispatch chain.

**Risk**: Medium — `clean_voice.py`/`verify_cut.py`/`mix_music.py` already exist
and work (Week 1 harvest); the new part is wiring them into an APScheduler job
and DB state, not the audio processing itself.

**Test**: Unit tests with a real short test clip (or mocked subprocess calls to
the media tools) verifying: a clip that fails `verify_cut` is marked
`processed=true`, `sync_ok=false`, and never reaches Phase 4; a clip that passes
gets `sync_ok=true` and a `quality_score`.

---

## Phase 4: Cover-frame selection (Step 4 → US3)

**Goal**: A verified clip gets 3 ranked cover-image candidates surfaced directly
in the Discord approval card — no scrubbing footage by hand.

**Files to create/change**:
- `apps/worker/brain/vision.py` — add `score_frame(image_url) -> FrameScore`
  (new Pydantic `output_type`: `score: int, reason: str`), reusing the existing
  `vision_agent`/structured-output pattern (research.md Decision 6) rather than
  a new hand-rolled JSON-parsing path
- `apps/worker/jobs/process_footage.py` — after audio processing passes, call
  `tools/media/cutlib.py` to extract 12 candidate frames, score each via
  `score_frame`, upload the top 3 to R2 as
  `cover_frame_candidates/{post_id}_{n}.jpg`, write the 3 URLs to
  `posts.cover_frame_candidates` (new JSONB column, research.md Decision 7)
- `apps/worker/notify/discord.py` — extend `send_approval()` (Week 3) to
  include "Pick a cover frame:" with three image buttons when
  `cover_frame_candidates` is non-empty, alongside the existing Approve/Edit/Skip
  row
- `apps/dashboard/app/api/webhooks/discord/route.ts` — handle the three new
  button `custom_id`s (`cover:{post_id}:{n}`), writing the chosen URL to a new
  `posts.render_url`-adjacent field (or overwriting the post's cover reference —
  exact field TBD in data-model.md)

**Dependencies**: Phase 3 (only verified, `sync_ok=true` clips get cover-frame
candidates — FR-008 explicitly requires "a verified video clip")

**Risk**: Low — leans entirely on already-built pieces (Week 4's vision agent
pattern, Week 3's Discord approval card and webhook). The genuinely new part
(extracting 12 frames via `cutlib.py`) is a thin wrapper around an
already-working tool.

**Test**: Unit test verifying: 12 frames in → top 3 by score selected and
uploaded; all 12 frames scoring below a usability threshold → reported as "no
usable candidate" (FR-010) rather than silently returning an empty/broken list.

---

## Phase 5: Calendar screen (Step 5 → US4)

**Goal**: See the whole week's schedule by platform, drag to reschedule, daily
cap visible at a glance — independent of every other Week 5 capability.

**Files to create**:
- `apps/dashboard/app/(app)/calendar/page.tsx` — week view, one column per
  platform, click-to-open side panel (preview/caption/state), drag-and-drop
  reschedule
- `apps/dashboard/app/api/posts/[id]/route.ts` — `PATCH` endpoint updating
  `scheduled_at`, reusing the existing per-platform daily cap logic already in
  `apps/worker/jobs/publish_due.py`'s `_check_platform_cap` (surfaced read-only
  here, not reimplemented — the calendar visualizes the same limit, per
  spec.md's Assumptions, it doesn't introduce a second cap concept)

**Dependencies**: None — reads/writes `posts` rows that already exist from
every prior week's work.

**Risk**: Medium — drag-and-drop UI is new territory for this dashboard (every
prior screen, per Weeks 2–4, has been read-mostly or single-click). Concurrent-
edit handling (spec.md's edge case: two people dragging the same post at once)
needs a real last-write-wins or optimistic-lock decision at task time.

**Test**: Not unit-testable in the Python sense; verify manually per Phase 9's
checkpoint. A dashboard-side test (if the project's test tooling extends to
TypeScript) could cover the PATCH endpoint's cap-check response, but no such
tooling exists yet in this codebase (Weeks 2–4 have zero dashboard-side tests) —
noting this as a gap, not silently assuming coverage.

---

## Phase 6: Generalise — strip every brand-specific hardcode (Step 6 → US5)

**Goal**: Zero hardcoded brand values (colors, prices, name, account IDs)
anywhere in the codebase outside comments/docs/examples.

**Work**: Not new files — a full-codebase search-and-replace pass:
`grep -rn "Yousuf Living"`, hex colors not sourced from `brand.ts`/`BRAND.md`,
PKR price literals, WhatsApp/page/account IDs not already in `.env`. Replace
each with a config/BRAND.md read. This phase touches many existing files across
`apps/dashboard`, `apps/worker`, and `packages/remotion` — scope is discovery-
driven, not predetermined by this plan.

**Dependencies**: Conceptually independent, but practically best done *after*
Phases 1–5 add their own new code, so this pass only has to run once over the
final file set rather than twice.

**Risk**: Medium — the risk isn't technical difficulty, it's completeness. A
missed hardcode is exactly what Phase 7's second-client simulation exists to
catch.

**Test**: `grep -r "Yousuf Living" apps/` returns only comments/example stubs
(per the kickoff's own checkpoint item) — a real, scriptable check, not a
judgment call.

---

## Phase 7: Second client simulation (Step 7 → US6)

**Goal**: Prove Phase 6 actually worked — a second, isolated brand can run
BOOTSTRAP without touching the first brand's files.

**Files to create**:
- `clients/test-client-2/.env.example`, `clients/test-client-2/SOUL.md` (stub),
  `clients/test-client-2/BRAND.md` (stub)
- `apps/worker/bootstrap/cli.py` — add an `--env=<path>` flag so BOOTSTRAP can
  target an arbitrary env file/output directory instead of always the repo root
  (Week 4's BOOTSTRAP wrote directly to `REPO`-relative paths with no
  parameterization — this phase is what makes a second, isolated target
  possible at all)

**Dependencies**: Phase 6 (there's no point proving isolation before the
hardcodes are actually gone) and Week 4's BOOTSTRAP wizard (extends it, doesn't
replace it)

**Risk**: Medium — Week 4's `bootstrap/steps.py` currently hardcodes `REPO`
(the actual repo root) as where every step writes its output
(`SOUL.md`/`BRAND.md`/etc). Making that target configurable per this phase's
`--env` flag is a real code change to Week 4's module, not just a new test.

**Test**: `python -m worker bootstrap --env=clients/test-client-2/.env`
completes cleanly (per the kickoff's checkpoint), and a diff/mtime check on
every Yousuf-Living-identity file (`SOUL.md`, `BRAND.md`, `IDENTITY.md`,
`HEARTBEAT.md` at the real repo root) confirms none were touched during that run.

---

## Phase 8: Provisioning runbook (Step 8 → US7)

**Goal**: A real, followable document for onboarding an actual paying client.

**Files to create**: `docs/client-provisioning.md` — Dokploy service, Neon
project/schema, R2 bucket, BOOTSTRAP wizard run, dashboard/Discord handover;
time estimate per step; every per-client env var; every secret to rotate.

**Dependencies**: Phases 6–7 (documents a now-real, now-proven process — writing
this first would describe an aspiration, not a fact)

**Risk**: Low — pure documentation, no code.

**Test**: Manual review against the actual product (per the kickoff's
checkpoint) — no automated test applies to a runbook's completeness.

---

## Phase 9: Final checkpoint (Step 9)

Mirrors spec.md's Success Criteria (SC-001–SC-007) plus the kickoff's explicit
checklist. Additionally:

- [ ] `npm run studio` — all four compositions render at 1080×1920
- [ ] A real dispatched render lands in R2 and the callback updates the post
- [ ] Cover-frame candidates appear in a real Discord approval card
- [ ] Calendar drag-reschedule works and respects/flags the daily cap
- [ ] `grep -r "Yousuf Living" apps/` — comments/examples only
- [ ] `python -m worker bootstrap --env=clients/test-client-2/.env` completes
      cleanly, verified not to touch the real brand's files
- [ ] `docs/client-provisioning.md` exists and is complete
- [ ] `python -m pytest apps/worker/tests/` — all tests still pass
- [ ] `git tag v0.1.0`
- [ ] `git commit -m "week5: motion, calendar, generalise — v0.1.0"`

---

## Dependency Graph

```
Phase 1 (compositions) ──→ Phase 2 (render dispatch + callback)
                                          │
Phase 3 (audio processing, independent) ─┴─→ Phase 4 (cover-frame selection)

Phase 5 (calendar, fully independent)

Phase 6 (de-hardcode) ──→ Phase 7 (second-client proof) ──→ Phase 8 (runbook)
                                                                      │
Phase 9 (checkpoint) ← depends on ALL of the above ──────────────────┘
```

## Critical Path

Phase 1 → Phase 2 → Phase 6 → Phase 7 → Phase 8 → Phase 9
(Phase 2's callback path and Phase 6's de-hardcode pass are the two slowest/
highest-uncertainty phases; everything else can run in parallel around them.)

## Parallelization Opportunities

- Phase 3 (audio) has no dependency on Phases 1–2 and can start immediately.
- Phase 5 (calendar) is independent of every other phase and can run any time.
- Phase 4 depends only on Phase 3, not on Phase 2's render pipeline — cover-frame
  selection and video rendering are parallel tracks that both feed the review
  queue, not a single serial chain.

## Testing Strategy

Python-side (worker) changes get unit tests per Week 3/4's established
convention (mocked subprocess/HTTP/GitHub-API calls). Dashboard-side changes
(Calendar screen, the render-complete callback's dashboard-facing surface, if
any) have no existing test tooling in this codebase to extend — flagged here
rather than silently assumed covered. The two genuinely new external
integrations (GitHub Actions↔R2, GitHub REST API dispatch/poll) get their
correctness proven at the Phase 9 checkpoint via one real end-to-end run, not
purely through mocks — mocks can't catch an R2 endpoint URL or auth header
being subtly wrong, which is exactly the class of bug Weeks 3–4 kept finding
that unit tests alone missed.

## Rollback Plan

Phases 1–5 are additive (new compositions, a new workflow file, a new job, a
new screen) and don't modify any existing publishing/approval behavior — each
can be disabled independently (don't dispatch renders, don't schedule
`process_footage`, don't link to `/calendar`) without affecting Weeks 1–4.
Phase 6's de-hardcode pass is the only phase that touches existing, working
code broadly — do it as its own commit, separate from Phases 1–5, so a
regression there is easy to isolate and revert without losing the week's new
capabilities.

## Notes

- One schema change this week (research.md Decision 7) — `assets.kind`,
  `assets.processed`, `assets.sync_ok`, plus `posts.cover_frame_candidates`
  (JSONB). Show the migration SQL for operator approval before running it
  against any real database, per this project's standing schema.sql convention.
- The single highest-uncertainty item carried into `/sp.tasks` is Phase 2's
  GitHub Actions ↔ R2 ↔ worker-callback round trip — it's the one thing this
  plan's research verified via docs but has not seen actually run.
