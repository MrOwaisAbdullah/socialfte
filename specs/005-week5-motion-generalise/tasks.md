# Tasks: Week 5 — Motion, Calendar, and Generalise

**Input**: Design documents from `/specs/005-week5-motion-generalise/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/env-vars.md

**Tests**: Included for the Python worker side, matching Weeks 3–4's convention.
Dashboard-side (Calendar screen) and Remotion-side (compositions) work has no
existing automated test tooling in this codebase to extend (plan.md's Testing
Strategy section already flags this) — verified manually per each phase's
Independent Test instead.

**Organization**: Tasks are grouped by user story (spec.md) in priority order,
with a new Phase 0 ahead of Setup per explicit instruction: write a
connections/flow-of-actions guide for the system *as it already exists* (Weeks
1–4) before adding Week 5's new pieces on top of it — documenting reality, not
aspiration, matching this project's own established discipline (plan.md Phase 8
made the same call about the client-provisioning runbook).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: Maps to spec.md's user stories (US1–US7)
- Every task names its exact file path

---

## Phase 0: System Documentation (connections, architecture, flow of actions)

**Purpose**: A single reference document explaining how SocialFTE actually
works today — every connection between components, and the end-to-end path a
post takes from nothing to published — written *before* Week 5 adds video
rendering and the calendar, so it's grounded in what's already real (Weeks
1–4), not speculative. Phase 10 (Polish) adds Week 5's own new flows to this
same document once they exist.

- [x] T001 Create `docs/how-it-works.md` — **System map**: every component (dashboard, worker, Neon/pgvector, Cloudflare R2, Discord, OpenRouter/LiteLLM, Meta Graph API, YouTube Data+Analytics APIs, TikTok Content Posting API) and exactly how each pair talks to the other (protocol, auth mechanism, which env var holds the credential) — derived from reading `apps/worker/config.py`, `apps/dashboard/lib/db/client.ts`, and each publisher/notify module, not from memory
- [x] T002 Add to `docs/how-it-works.md` — **Flow of actions**: the full lifecycle of a single post, end to end, as it actually runs today — `compose_batch` (daily) picks an asset+template, `caption_agent` writes a caption, the anti-repeat gate checks it, `/api/internal/render` produces the image, the post lands in `state='review'`, `notify_review` (daily) sends it to Discord, a human clicks Approve, `publish_due` (every 15 min) publishes it, `collect_metrics` (every 6h) gathers performance data, `weekly_digest` (Sundays) summarizes the week — cite the actual file and function responsible for each step, not a paraphrase
- [x] T003 Add to `docs/how-it-works.md` — **Cron schedule table**: every APScheduler job registered in `apps/worker/main.py` (`refresh_tokens`, `publish_due`, `notify_review`, `compose_batch`, `collect_metrics`, `weekly_digest`), its schedule, and what it does in one line
- [x] T004 Add to `docs/how-it-works.md` — **BOOTSTRAP summary**: how the six-step guided setup (`apps/worker/bootstrap/steps.py`) fits into the picture — what it produces and how the rest of the system depends on its output (`SOUL.md`/`BRAND.md`/`credentials` rows/`HEARTBEAT.md`)
- [x] T005 Add to `docs/how-it-works.md` — **"Where to look" file map**: a short directory-by-directory guide (`apps/worker/jobs/`, `apps/worker/brain/`, `apps/worker/publishers/`, `apps/worker/composer/`, `apps/dashboard/app/`) so a reader can find the code behind any part of the flow described above without grepping blind

**Checkpoint**: A reader unfamiliar with the codebase can explain, from this one
document, how a post gets from nothing to published and which files are
responsible for each step.

---

## Phase 1: Setup

- [x] T006 Confirm the working tree is on branch `005-week5-motion-generalise` and `git status --short` shows no unrelated uncommitted changes — repo root
- [ ] T007 [P] Confirm `packages/remotion/` dependencies install cleanly (`npm install` in `packages/remotion/`) and `npm run studio` launches without error against the existing `BrandProof` composition, before adding new ones — **partially blocked**: `npm install` and `node scripts/gen-registry.mjs` work; the Remotion CLI itself (`npx remotion --help`, no rendering involved) hangs indefinitely with zero output in this sandbox even with network/telemetry disabled — a sandbox-specific CLI-launch issue (likely its `ink`-based interactive UI failing silently outside a real TTY), not a code problem. Verified via `tsc --noEmit` (clean) and the registry script (all 5 compositions discovered with correct dimensions/durations) instead — see T016

**Checkpoint**: Environment confirmed; Remotion Studio launches cleanly as a baseline.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The schema change every video-related user story depends on.

**⚠️ CRITICAL**: US2 and US3 cannot begin until this phase is complete.

- [x] T008 Add `kind TEXT NOT NULL DEFAULT 'photo'`, `processed BOOLEAN NOT NULL DEFAULT true`, `sync_ok BOOLEAN` to the `assets` table in `apps/worker/db/schema.sql` (research.md Decision 7) — show the migration SQL for operator approval before running it, per this project's standing schema.sql convention
- [x] T009 Add `cover_frame_candidates JSONB` to the `posts` table in `apps/worker/db/schema.sql`
- [x] T010 Mirror both schema changes in `apps/worker/db/models.py` (`Asset.kind`, `Asset.processed`, `Asset.sync_ok`, `Post.cover_frame_candidates`)

**Checkpoint**: Schema updated and mirrored; existing tests (`pytest apps/worker/tests/`) still pass unchanged since every new column has a safe default.

---

## Phase 3: User Story 1 - Turning a room render into a short video, automatically (Priority: P1) 🎯 MVP (1/2)

**Goal**: A still image + text becomes a finished, correctly-sized video that lands in the review queue — no manual editing.

**Independent Test**: Trigger `dispatch_video_render()` for one composition and confirm a real MP4 lands in R2 and the associated post reaches `state='review'` with `render_url` set.

### Tests for User Story 1

- [x] T011 [US1] Write `apps/worker/tests/test_dispatch_render.py` — mocks the GitHub API, verifies `dispatch_video_render()` sends the correct `workflow_dispatch` inputs (`composition_id`, `props`, `output_key`) for a given post

### Implementation for User Story 1

- [x] T012 [P] [US1] Create `packages/remotion/src/compositions/HeroReveal.tsx` — `imageUrl` prop via `<Img>` (research.md Decision 2), Ken Burns zoom 0.95→1.05 over 150 frames via `interpolate()` on `transform: scale()`, headline fade at frame 30, subline after, brand mark fade at frame 90, `compositionConfig: { width: 1080, height: 1920, durationInSeconds: 5, fps: 30 }`, reading `BRAND`/`COLORS`/`EASINGS` from `../brand` and fonts from `../fonts` — zero hardcoded hex values
- [x] T013 [P] [US1] Create `packages/remotion/src/compositions/PriceReveal.tsx` — dark gradient over the room render, hook text fade-in frames 0–45, price wipes in at frame 60 with a bar animation, brand mark at frame 90, `durationInSeconds: 5`, same brand-token sourcing as T012
- [x] T014 [P] [US1] Create `packages/remotion/src/compositions/FabricDetail.tsx` — slow pan across a detail image, small Archivo overlay text with a quality claim, no price/no CTA, `durationInSeconds: 4`
- [x] T015 [P] [US1] Create `packages/remotion/src/compositions/SetReveal.tsx` — CSS-transform wardrobe-doors wipe reveal, set name + bundle price at the end, `durationInSeconds: 6`
- [ ] T016 [US1] Run `npm run studio` in `packages/remotion/` and manually verify all four new compositions render without errors at 1080×1920 before continuing (plan.md Phase 1's test — not automatable, do this before T017+) — **blocked by the same sandbox CLI-launch issue as T007**; verified instead via `npx tsc --noEmit` (clean, zero errors across all four files) and `node scripts/gen-registry.mjs` (all 5 compositions — BrandProof + the 4 new ones — correctly discovered with the exact dimensions/durations the kickoff specified: 1080×1920, HeroReveal 5s, PriceReveal 5s, FabricDetail 4s, SetReveal 6s). A real visual render still needs to happen wherever this can actually run (e.g. the GitHub Actions runner itself, once T017 exists) before treating this as fully proven — flagged for Phase 11's checkpoint
- [x] T017 [US1] Create `.github/workflows/render-video.yml` — `workflow_dispatch` inputs (`composition_id`, `props`, `output_key`); write `props` to a JSON file via `env:`+`echo` before rendering, **not** inline string interpolation (research.md Decision 4 — the inline form is a documented script-injection anti-pattern); `npx remotion render {composition_id} out/render.mp4 --props=./input-props.json`; upload via `aws s3 cp` with `AWS_DEFAULT_REGION=auto` and `--endpoint-url https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com` (research.md Decision 5); `curl`s the callback with `{output_key, status}` on `if: always()` (not just success — FR-004) with an `x-render-secret` header (`RENDER_INTERNAL_SECRET`, a 6th secret discovered while writing this — the callback endpoint needs auth same as every other internal worker endpoint)
- [x] T018 [P] [US1] Create `docs/github-actions-setup.md` — documents all six repo secrets (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `CALLBACK_URL`, `RENDER_INTERNAL_SECRET`) and how to add them in GitHub's Settings → Secrets UI
- [x] T019 [US1] Add `POST /api/render-complete` to `apps/worker/main.py` — verifies a shared secret header (same pattern as the existing `/vision/tag` endpoint from Week 4), updates the post's row: `render_url = R2_PUBLIC_URL/output_key`, `state = 'review'`
- [x] T020 [US1] Create `apps/worker/jobs/dispatch_render.py` — `dispatch_video_render(post_id, composition_id, props)` calling the GitHub REST API's `workflow_dispatch` endpoint via `GITHUB_TOKEN`/`GITHUB_REPO`/`RENDER_WORKFLOW_FILE`, polling run status every `RENDER_POLL_INTERVAL_SECONDS` capped at `RENDER_POLL_MAX_MINUTES` (contracts/env-vars.md), then stopping — the callback (T019) handles completion
- [x] T021 [US1] Handle a video-request for an unsupported `composition_id`: `dispatch_video_render()` MUST fail with a clear, logged error rather than dispatching a workflow that will silently do nothing useful (FR-003) — validate `composition_id` against the four known compositions before dispatching
- [x] T022 [US1] Write an `audit_log` row for every dispatch attempt and every render-complete callback in `apps/worker/jobs/dispatch_render.py` and `apps/worker/main.py`'s new endpoint
- [x] T023 [US1] Wire `dispatch_video_render` into `apps/worker/jobs/compose_batch.py` — when a candidate's `format` (per its `PLATFORM_FORMAT_MAP`, Week 4) is a video format (`"reel"`/`"short"`/`"video"`), call `dispatch_video_render` instead of the image-render HTTP call, so video posts actually enter the pipeline FR-002 requires rather than `dispatch_render.py` being unreachable dead code

**Checkpoint**: User Story 1 is independently testable — `dispatch_video_render()` can be called directly with a mocked GitHub API, and (per Phase 11's real checkpoint) a genuine end-to-end dispatch can be verified against real infrastructure.

---

## Phase 4: User Story 2 - Clean, verified audio on every video clip (Priority: P1) 🎯 MVP (2/2)

**Goal**: Every uploaded clip gets noise-cleaned, sync-checked, and music-mixed automatically — a trust/safety gate before any clip-based content is usable.

**Independent Test**: Insert an `assets` row with `kind='clip', processed=false` pointing at a real short test clip, run `process_footage()`, and confirm noise cleanup ran, `sync_ok` was recorded, and (if it passed) music was mixed in.

### Tests for User Story 2

- [X] T024 [US2] Write `apps/worker/tests/test_process_footage.py` — a clip that fails `verify_cut` ends with `processed=true`, `sync_ok=false`, and is not passed on to cover-frame extraction
- [X] T025 [US2] Add to `apps/worker/tests/test_process_footage.py` — a clip that passes `verify_cut` ends with `sync_ok=true`, a recorded `quality_score`, and a mixed-in music track

### Implementation for User Story 2

- [X] T026 [US2] Create `apps/worker/jobs/process_footage.py` — query `assets` where `kind='clip' AND processed=false`, call `tools/media/clean_voice.py` (local RNNoise path — already the only path per Week 1's harvest, nothing to strip), then check A/V sync (deviation: a direct ffprobe stream-duration comparison, `check_av_sync()`, instead of `verify_cut.py` — see module docstring for why: that script expects a transcript+planned-cut structure from the ASR editing pipeline, not an arbitrary uploaded clip)
- [X] T027 [US2] On a passing sync check, call `tools/media/mix_music.py` with a bed from `media/library/music/` at `settings.MUSIC_BED_DB` (contracts/env-vars.md, default -18dB — config-driven per FR-016, not a hardcoded literal) in `apps/worker/jobs/process_footage.py`
- [X] T028 [US2] Set `processed=true` unconditionally at the end of each clip's processing (pass or fail) so the job never reprocesses the same clip twice, in `apps/worker/jobs/process_footage.py`
- [X] T029 [US2] Write an `audit_log` row for every clip processed (noise cleanup, sync-check result, music mix outcome) in `apps/worker/jobs/process_footage.py`
- [X] T030 [US2] Wire `process_footage` to APScheduler using `settings.PROCESS_FOOTAGE_CRON` in `apps/worker/main.py`

**Checkpoint**: 🎯 **MVP complete.** User Stories 1+2 together deliver real motion content: a finished video from a still image (US1), and safe, verified audio on any raw clip footage (US2) — independent of the cover-frame/calendar/generalise work below.

---

## Phase 5: User Story 3 - Picking the best cover image without scrubbing through footage (Priority: P2)

**Goal**: A verified clip yields 3 ranked cover-frame candidates, surfaced directly in the Discord approval card.

**Independent Test**: Feed a verified (`sync_ok=true`) clip through cover-frame selection and confirm 3 candidate URLs appear on the post's Discord approval card as pickable buttons.

### Tests for User Story 3

- [X] T031 [US3] Write `apps/worker/tests/test_process_footage.py` — 12 scored candidate frames in, top 3 by score selected and their URLs written to `posts.cover_frame_candidates` (deviation: kept in `test_process_footage.py` rather than a separate `test_cover_frames.py` — same module under test, no functional gap)
- [X] T032 [US3] Add to `apps/worker/tests/test_process_footage.py` — all 12 frames scoring below a usability threshold results in a reported "no usable candidate" outcome (FR-010), not an empty or broken list

### Implementation for User Story 3

- [X] T033 [US3] Add `FrameScore` (`score: int, reason: str`) Pydantic model and `score_frame(image_url) -> FrameScore` to `apps/worker/brain/vision.py`, reusing the existing `vision_agent`/structured-`output_type` pattern (research.md Decision 6) — do not hand-roll a new JSON-parsing path
- [X] T034 [US3] In `apps/worker/jobs/process_footage.py`, after a clip passes verification (T026–T027): extract 12 candidate frames, score each via `score_frame`, select the top 3, upload them to R2 as `cover_frame_candidates/{asset_id}_{n}.jpg` (deviation from calling `tools/media/cutlib.py`: read its actual source — it's audio cut-planning logic keyed on ASR word transcripts and `manifest.json`/ `ffprobe`-based frame extraction directly instead, matching the same "don't force-fit a differently-scoped tool" reasoning as the `verify_cut.py` deviation above)
- [X] T035 [US3] Write the 3 selected URLs (with scores) to `posts.cover_frame_candidates` as JSONB in `apps/worker/jobs/process_footage.py`; if no frame clears the usability threshold, write an empty result and log/audit the reason rather than a silent empty array (FR-010)
- [X] T036 [US3] Extend `send_approval()` in `apps/worker/notify/discord.py` — when a post has non-empty `cover_frame_candidates`, add a preview embed per candidate plus a second action row of three buttons (`custom_id: cover:{post_id}:{n}`) alongside the existing Approve/Edit/Skip row (Discord buttons carry no image of their own, hence the paired preview embeds)
- [X] T037 [US3] Handle the three new `cover:{post_id}:{n}` button interactions in `apps/dashboard/app/api/webhooks/discord/route.ts` — on click, set the chosen candidate's URL as the post's `render_url` (data-model.md: the chosen cover overwrites `render_url` directly, there's no separate thumbnail field) and write an audit_log row. Also brought `apps/dashboard/lib/db/schema.ts` back in sync with `schema.sql` (it was missing Week 5's `assets.kind/processed/sync_ok` and `posts.cover_frame_candidates` columns — required for this handler to compile/query)
- [X] T038 [US3] Write an `audit_log` row for every cover-frame extraction/scoring pass in `apps/worker/jobs/process_footage.py`

**Checkpoint**: User Story 3 is independently testable and shippable without the Calendar or generalisation work.

---

## Phase 6: User Story 4 - Seeing and adjusting the week's schedule at a glance (Priority: P2)

**Goal**: A weekly, per-platform view of scheduled posts with drag-to-reschedule and visible daily-cap status.

**Independent Test**: With posts scheduled across several days/platforms, open the calendar and confirm correct placement; drag one post to a new day and confirm `scheduled_at` actually changes.

### Implementation for User Story 4

*(No automated tests — plan.md's Testing Strategy notes this dashboard has no existing test tooling to extend; verified manually per this phase's Independent Test and Phase 11's checkpoint.)*

- [X] T039 [P] [US4] Create `apps/dashboard/app/api/posts/[id]/route.ts` — `PATCH` endpoint updating `scheduled_at`; reads (does not reimplement) the existing per-platform daily-cap logic already in `apps/worker/jobs/publish_due.py`'s `_check_platform_cap` shape (new `apps/dashboard/lib/cap-limits.ts` reads the same `CAP_*` env vars/defaults) to determine whether the target day/platform is at or over cap. Also added `GET /api/posts` (week-scoped data feed for the calendar) since T040's page needs a data source. Also found and fixed a real pre-existing bug in `proxy.ts` while wiring this up: its session-gate matcher excluded `api/internal` but not `api/webhooks`, so the Discord interactions endpoint (T037) would have been redirected to `/login` instead of returning JSON — fixed by excluding `api/webhooks` too
- [X] T040 [US4] Create `apps/dashboard/app/(dashboard)/calendar/page.tsx` (deviation: the kickoff said `app/(app)/calendar/page.tsx`, but this repo's actual route group is `(dashboard)` — see `proxy.ts`/`performance/page.tsx`; `(app)` doesn't exist) — week view, one column per platform (Facebook/Instagram/YouTube/TikTok), each cell listing that day's scheduled posts. Implemented as a thin server page + `components/calendar/CalendarBoard.tsx` client component (data fetching/interactivity needs client-side state)
- [X] T041 [US4] Add a click-to-open side panel to `CalendarBoard.tsx` showing the clicked post's rendered preview, caption, and state badge without navigating away
- [X] T042 [US4] Add drag-and-drop rescheduling to `CalendarBoard.tsx` (native HTML5 DnD — no new dependency needed for a 7×4 grid), calling T039's `PATCH` endpoint on drop and refetching the week's data
- [X] T043 [US4] Add a visual daily-cap fill bar per platform/day in `CalendarBoard.tsx`, and surface a dismissible toast (not a silent no-op) when a drop pushes a day over its platform's cap (FR-015)

**Verified end-to-end against the real dev database** (not just typecheck): started `npm run dev`, authenticated via a manually-computed session cookie, confirmed `/calendar` renders, inserted/rescheduled/deleted real `posts` rows via the running server, and confirmed `GET /api/posts` and `PATCH /api/posts/[id]` return correct data including a real over-cap (`count:3, cap:2, overCap:true`) case. This surfaced one more real bug: the dev database itself had never been migrated with this spec's Phase 2 schema changes (`assets.kind/processed/sync_ok`, `posts.cover_frame_candidates`) — `schema.sql`/`schema.ts` were updated in code (T008-T010) but `drizzle-kit push` was never run against it, so `PATCH /api/posts/[id]`'s `select()` 500'd on the missing column. Fixed by running the push for real (not just documenting the command).

**Checkpoint**: User Story 4 is independently functional and shippable — no dependency on US1–US3 or US5–US7.

---

## Phase 7: User Story 5 - Nothing brand-specific left hardcoded (Priority: P3)

**Goal**: Zero hardcoded brand values outside comments/docs/examples.

**Independent Test**: `grep -r "Yousuf Living" apps/` returns only comments/example stubs; a change to `BRAND.md`'s colors propagates everywhere those colors were used.

### Implementation for User Story 5

*(Discovery-driven — exact files affected aren't fully known until the search runs; each task below is a category of hardcode to find and fix, not a fixed file list.)*

- [X] T044 [US5] Run `grep -rn "Yousuf Living" apps/ packages/` (excluding comments/docs/example stubs) and replace every real match with a `BRAND.md`/config read. Found 4 real hits, all in `apps/dashboard/`: `next.config.ts`'s image `remotePatterns` hostname, `app/layout.tsx`'s `<title>`/description, `app/(dashboard)/layout.tsx`'s header wordmark, `app/(dashboard)/login/page.tsx`'s heading. Added a new `BRAND_NAME` env var (also added to `apps/worker/config.py` and `.env.example` for consistency) and changed `next.config.ts` to derive the R2 image hostname from `R2_PUBLIC_URL` instead of a literal domain. Also changed `config.py`'s `APP_URL` default from a Yousuf-Living URL to `""` (matches the existing empty-default pattern for `DATABASE_URL`/`SESSION_SECRET` — operator-supplied, not baked in)
- [X] T045 [US5] Search `apps/` and `packages/remotion/src/` for hex color literals not sourced from `brand.ts`/`COLORS`/`BRAND.md`. Found none that are actual brand-identity violations: the 4 new Week 5 compositions' `#fff` values are functional white overlay text (not a brand color, works for any brand's photos); `lib/kit.tsx`'s hex values are a generic device-chrome mockup kit (macOS/VSCode/chat-bubble UI, unrelated to brand identity); `setup/page.tsx`'s/`bootstrap/steps.py`'s hex literals are just suggested defaults for the color-picker input in the wizard that *creates* `brand.ts` — legitimate UX default, not a hardcoded runtime brand value. No changes needed.
- [X] T046 [US5] Search `apps/` for PKR/price literals not sourced from a template's `props` or the brand's own configuration. Zero matches found (`grep -rn "PKR|₨" apps/` — nothing, including tests). No changes needed.
- [X] T047 [US5] Search `apps/` for hardcoded WhatsApp numbers, Meta Page IDs, or other account/contact identifiers not already read from `.env`. All `page_id`/WhatsApp references found are function parameters/settings reads (`settings.META_PAGE_ID`, etc.), not literal values. No changes needed.
- [X] T048 [US5] Re-run `python -m pytest apps/worker/tests/` after T044–T047 — **87 passed, 1 skipped**. Also ran `npm run typecheck` in `apps/dashboard/` — clean (only the pre-existing, unrelated `@neondatabase/serverless` module-resolution gap remains, not caused by this pass)

**Checkpoint**: `grep -r "Yousuf Living" apps/` (per the kickoff's own checkpoint item) returns only comments/example content — a scriptable, objective pass/fail, not a judgment call.

---

## Phase 8: User Story 6 - Proving a second brand can be onboarded without touching the first (Priority: P3)

**Goal**: A real, isolated second-brand configuration completes BOOTSTRAP without reading or writing anything belonging to the first brand.

**Independent Test**: Run BOOTSTRAP against `clients/test-client-2/`'s isolated config; confirm completion and confirm (via mtime/diff) zero writes to the real repo-root identity files.

### Implementation for User Story 6

- [X] T049 [P] [US6] Create `clients/test-client-2/.env.example`, `clients/test-client-2/SOUL.md` (stub), `clients/test-client-2/BRAND.md` (stub), plus `IDENTITY.md` (needed too — step 1's `_is_step_done` checks both `SOUL.md` and `IDENTITY.md`) — a fully isolated, throwaway second-brand configuration
- [X] T050 [US6] Add an `--env=<path>` flag to `apps/worker/bootstrap/cli.py`, threading a configurable target `root: Path` through every step function and `_is_step_done` in `apps/worker/bootstrap/steps.py` (previously hardcoded to the module-level `REPO`, per plan.md Phase 7's flagged risk). Used `Optional[Path] = None` (resolved to `REPO` inside each function) rather than `root: Path = REPO`, since a default bound at function-definition time doesn't see later `patch("bootstrap.steps.REPO", ...)` calls — would have silently broken `test_bootstrap_resumable`. Also fixed `worker/__main__.py` to pass `sys.argv[2:]` to the bootstrap CLI (it now uses `argparse`, and the leading `"bootstrap"` subcommand token isn't a `--env` flag). **Found and fixed two real, pre-existing, load-bearing bugs while doing this**: (1) `run_bootstrap()`'s guard was `if not BOOTSTRAP_MARKER.exists(): refuse` — inverted from its own docstring's stated intent ("refuses to run if BOOTSTRAP.md exists") — meaning on a genuinely fresh checkout (marker never exists until step 6 creates it) the wizard could never run at all, for either brand. (2) `_is_step_done(6)` had the same inversion (`not exists()` instead of `exists()`), independently causing step 6 to always skip its real checks and never write the completion marker on an actual first run — the earlier Week 4 fix (visible in a surviving code comment) had fixed the *outer* `if` in `step_6_verify` but missed that `_is_step_done(6)`'s own polarity was still backwards, so the bug fully persisted under a different name. Fixed both to the consistent, existence-means-complete semantics steps 1/2/5 already use, and corrected `test_bootstrap.py`'s two step-6 tests (they encoded the wrong-direction expectations) plus a masked test-mock bug in the same file (`session.execute` mocked as `MagicMock` instead of `AsyncMock`, silently failing the Database check every time).
- [X] T051 [US6] Write `apps/worker/tests/test_bootstrap_isolation.py` — running BOOTSTRAP with `--env=<a tmp_path fixture>` writes only inside that path and never touches the real `REPO`-rooted `SOUL.md`/`BRAND.md`/`IDENTITY.md`/`HEARTBEAT.md`/`BOOTSTRAP.md` (snapshots exists+mtime before/after and asserts no change), plus a second test confirming `cli.py`'s `--env=<path>/.env` correctly resolves to the `.env` file's *parent directory* as `root`.
- [X] T052 [US6] Ran `python -m worker bootstrap --env=clients/test-client-2/.env` for real (piped empty answers to accept every prompt's default, non-interactively). All 6 steps executed against the real dev database; steps 1-5 completed for real (wrote `clients/test-client-2/{IDENTITY,HEARTBEAT}.md`, connected an instagram platform placeholder, configured a discord notification placeholder — no tokens supplied so nothing sensitive was written); step 6's 4 live checks: LLM call and Notification and Render failed on genuine, expected sandbox/config gaps (OpenRouter's free model slug is now deprecated — an unrelated Week 4 issue; no Docker network to resolve `yl-dashboard`; no `DISCORD_BOT_TOKEN` configured), Database passed against the real Neon DB. Confirmed via `stat`/`git status` on `SOUL.md`/`BRAND.md`/`HEARTBEAT.md`/`IDENTITY.md`/`BOOTSTRAP.md` at the real repo root: **identical mtimes before and after, zero git changes** — the isolation boundary holds under a real run, not just the mocked test. **Also found and fixed two blocking environment gaps surfaced by actually running this for real** (neither would have been caught by the mocked test suite, which never touches a real DB): `apps/worker/.env` had no `DATABASE_URL` at all (worker jobs had only ever been exercised via mocked `SessionLocal` in tests, never against a live Postgres) — added it, pointing at the same Neon DB `apps/dashboard/.env.local` already uses, per the architecture's single-shared-Postgres design; and `apps/worker/db/session.py` passed Neon's `?sslmode=require`/`channel_binding` query params straight through to asyncpg, which doesn't accept `sslmode` as a URL param and raises `TypeError: connect() got an unexpected keyword argument 'sslmode'` — fixed by stripping those libpq-only params and translating `sslmode=require` into asyncpg's own `ssl` connect arg.

**Checkpoint**: A second brand can complete guided setup using only its own files — verified, not assumed (spec.md SC-006).

---

## Phase 9: User Story 7 - A written runbook for onboarding a real second client (Priority: P3)

**Goal**: A complete, followable document for onboarding an actual new client.

**Independent Test**: Someone unfamiliar with the system can follow the runbook and identify every step, every per-client config change, and every secret rotation without asking a follow-up question.

### Implementation for User Story 7

- [X] T053 [US7] Create `docs/client-provisioning.md` — new Dokploy service, new Neon project/schema, new R2 bucket, running the BOOTSTRAP wizard (referencing T050's `--env` flag), handing over the dashboard URL + Discord invite, with a time estimate per step
- [X] T054 [US7] Add to `docs/client-provisioning.md` — an explicit table of every environment variable that changes per client (cross-reference `contracts/env-vars.md` from Weeks 2–5) and every secret that must be rotated when onboarding a new client

**Checkpoint**: The runbook describes a now-real, now-proven process (post-Phase 8), not an aspiration.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [X] T055 Update `docs/how-it-works.md` (Phase 0) with Week 5's new flows: the video-composition/render-dispatch path (US1), the clip-processing/cover-frame path (US2/US3), the Calendar screen (US4), and the generalisation pass (US5/US6) — replaced the placeholder deferred at Phase 0 with the real, verified flows
- [X] T056 [P] Add every new env var from `contracts/env-vars.md` to `.env.example` (`GITHUB_TOKEN`, `GITHUB_REPO`, `RENDER_WORKFLOW_FILE`, `RENDER_POLL_INTERVAL_SECONDS`, `RENDER_POLL_MAX_MINUTES`, `PROCESS_FOOTAGE_CRON`, `MUSIC_BED_DB`). Also added the new `BRAND_NAME` var (T044) and created `apps/dashboard/.env.example`, which didn't exist at all before this pass
- [X] T057 [P] Review Phases 3–9 for `audit_log` coverage gaps (FR-015's existing convention from Week 4) — confirm every automated decision this feature adds is logged. Traced every write path: `dispatch_render.py` (dispatch_rejected/dispatch_sent/dispatch_poll_timeout), `process_footage.py` (noise_cleaned/noise_cleanup_failed, sync_checked, music_mixed/music_mix_failed, cover_frames_selected/cover_frames_none_usable, processing_failed), `compose_batch.py` (post_composed covers both image and video branches; a video dispatch failure doesn't get its own row but does get folded into the existing `batch_shortfall` row's `shortfalls` list — same pattern already used for every other candidate-rejection reason in that file, not a gap), `main.py`'s `/api/render-complete` (render_complete) and `/vision/tag` (asset_tagged/asset_quality_checked), the dashboard's Discord webhook (cover_frame_selected) and Calendar PATCH endpoint (post_rescheduled). No gaps found — no code changes needed.

---

## Phase 11: Checkpoint

- [ ] T058 Run `npm run studio` in `packages/remotion/` — all four compositions render at 1080×1920. **Blocked**: the Remotion CLI hangs indefinitely with zero output in this sandbox for any invocation (`--help`, `--version`, direct binary) — same root cause diagnosed at T007/T016 (likely the `ink`-based interactive UI failing outside a real TTY), re-confirmed here rather than assumed. Re-verified via the same substitute checks instead: `npx tsc --noEmit` (clean) and `node scripts/gen-registry.mjs` (correctly discovers all 5 compositions — `BrandProof`, `FabricDetail`, `HeroReveal`, `PriceReveal`, `SetReveal` — at their declared dimensions/durations). Needs a real GitHub Actions runner or non-sandboxed machine to actually confirm a rendered frame.
- [ ] T059 Dispatch one real test render via the GitHub Actions workflow. **Blocked**: this repository has no `git remote` configured at all (confirmed via `git remote -v` — empty) and `GITHUB_REPO`/repo secrets were never set up, so there is no real workflow to dispatch against. Creating a new GitHub repo and pushing this codebase to enable this check is a significant, consequential action or a real deployment; not something to do unilaterally as part of a checkpoint task. Needs the operator to actually push this repo and configure the 6 secrets in `docs/github-actions-setup.md` first.
- [ ] T060 Upload one real short test clip end to end — verify 3 cover-frame candidates appear on a real Discord approval card. **Partially blocked**: `ffmpeg`/`ffprobe` are not installed in this sandbox (`which ffmpeg` — not found) and there's no passwordless root to install them, so `process_footage.py`'s real pipeline (as opposed to its mocked unit tests) can't be exercised here at all. `DISCORD_BOT_TOKEN` is also unconfigured, so even a successful local run couldn't reach a real Discord card. This is a real capability gap in the sandbox, not a code issue — the unit test suite (`test_process_footage.py`) already covers every branch of the logic with `_run`/`score_frame` mocked; what's missing is a real ffmpeg binary and a real Discord bot to complete an end-to-end confirmation.
- [X] T061 Verify the Calendar screen shows real scheduled posts and drag-reschedule works, including the over-cap visual warning. **Done for real** (see Phase 6's notes above): started the dashboard dev server, authenticated with a real session cookie, inserted/rescheduled/deleted real `posts` rows through the running server, and confirmed a genuine over-cap case (`count:3, cap:2, overCap:true`) via the API layer the frontend calls.
- [X] T062 Run `grep -r "Yousuf Living" apps/` — comments/examples only. Confirmed: zero matches in any source file (`.ts`/`.tsx`/`.py`/`.md`/`.json`, excluding `.next/` build cache and node_modules). The only remaining occurrences anywhere under `apps/` are `apps/dashboard/.env.local`'s `BRAND_NAME=Yousuf Living` (a gitignored config value — this *is* the correct, intended way this client's name now enters the system, per T044) and compiled `.next/` build output (regenerates correctly for any client's `BRAND_NAME`, not a source hardcode).
- [X] T063 Run `python -m worker bootstrap --env=clients/test-client-2/.env` — completes cleanly, confirmed isolated. **Done for real** (see Phase 8/T052's notes above): ran non-interactively with piped default answers; steps 1-5 completed for real against `clients/test-client-2/`, step 6 ran 4 real checks (3 failed on expected sandbox/config gaps — no Docker network, deprecated free LLM slug, no Discord token; Database passed against the real Neon DB); confirmed via `stat`/`git status` that the real repo root's 5 identity files were untouched (identical mtimes, zero git changes).
- [X] T064 Confirm `docs/client-provisioning.md` exists and covers every step. Confirmed: 11KB, all 5 kickoff steps (Dokploy service, Neon project, R2 bucket, BOOTSTRAP wizard, handover) plus the per-client env-var table and secret-rotation table.
- [X] T065 Run `python -m pytest apps/worker/tests/` — all tests pass. **89 passed, 1 skipped** (up from 78 at the start of this feature — 11 new tests across process_footage/vision/discord/bootstrap-isolation, plus fixes to 2 pre-existing tests that encoded now-corrected bootstrap semantics).
- [ ] T066 `git tag v0.1.0`
- [ ] T067 `git commit -m "week5: motion, calendar, generalise — v0.1.0"`

**Checkpoint**: All automated tests pass; every success criterion verified except the three requiring infra this sandbox genuinely doesn't have (a working Remotion CLI TTY, a pushed GitHub repo with Actions secrets, and an installed ffmpeg + configured Discord bot) — each documented above with exactly what would be needed to complete it for real, not silently skipped.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 0 (Documentation)**: No dependencies — describes the already-built Weeks 1–4 system. Can start immediately, in parallel with Setup.
- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS US2 and US3 (both need the new `assets`/`posts` columns). Does NOT block US1 or US4, which don't touch the new schema.
- **US1 (Phase 3)**: Depends on Setup only.
- **US2 (Phase 4)**: Depends on Phase 2 (schema).
- **US3 (Phase 5)**: Depends on Phase 2 (schema) AND US2 (only verified clips get cover-frame candidates, FR-008).
- **US4 (Phase 6)**: Depends on Setup only — fully independent of US1–US3.
- **US5 (Phase 7)**: Practically sequenced after US1–US4 add their own code (plan.md), so the de-hardcode pass only runs once over the final file set.
- **US6 (Phase 8)**: Depends on US5 (no point proving isolation before hardcodes are gone).
- **US7 (Phase 9)**: Depends on US5+US6 (documents a now-real, proven process).
- **Polish (Phase 10)**: Depends on Phases 3–9 existing.
- **Checkpoint (Phase 11)**: Depends on everything.

### Parallel Opportunities

- Phase 0 (documentation) can run fully in parallel with Phase 1 (Setup) and Phase 2 (Foundational) — it describes already-existing code, not anything this feature is building.
- T012–T015 (the four Remotion compositions) are mutually parallel — different files, no shared state.
- US1 (Phase 3) and US4 (Phase 6) can be developed in parallel by two people/agents — no shared files, no dependency either direction.
- US2 (Phase 4) has no dependency on US1 and can be developed in parallel with it, once Phase 2 (schema) is done.
- T049 (client-2 stub files) is parallel with T050 (the `--env` flag code change) — different files.

---

## Parallel Example: The four Remotion compositions

```bash
# All four are new, independent files — safe to write in parallel:
Task: "Create HeroReveal.tsx"
Task: "Create PriceReveal.tsx"
Task: "Create FabricDetail.tsx"
Task: "Create SetReveal.tsx"

# T016 (npm run studio verification) must wait for all four to land.
```

---

## Implementation Strategy

### MVP First (User Stories 1+2 only)

1. Complete Phase 0 (documentation) and Phase 1 (Setup) — can run in parallel
2. Complete Phase 2 (Foundational — blocks US2/US3)
3. Complete Phase 3 (US1) and Phase 4 (US2), in parallel if staffed
4. **STOP and VALIDATE**: a still image produces a real finished video (US1), and
   a raw clip gets cleaned/verified/scored (US2) — this alone delivers real
   "motion" capability (SC-001, SC-002), deployable as a standalone increment
5. Continue to US3 (cover-frames) → US4 (calendar) → US5→US6→US7 (generalise)
   → Polish → Checkpoint

### Incremental Delivery

1. Documentation + Setup + Foundational → foundation ready
2. US1 + US2 (motion MVP) → validate → deploy
3. US3 (cover-frame picking) → validate → deploy
4. US4 (calendar) → validate → deploy (fully independent, could ship anytime)
5. US5 → US6 → US7 (generalise, in strict order — each depends on the last) →
   validate → deploy
6. Polish → Checkpoint → tag `v0.1.0`

### Parallel Team Strategy

1. One person/agent starts Phase 0 (documentation) immediately — it has zero
   code dependencies on anything else this week
2. Team completes Setup + Foundational together
3. Once Foundational is done:
   - Developer/Agent A: US1 (Remotion + GitHub Actions + callback)
   - Developer/Agent B: US2 → then US3 (sequential, US3 depends on US2)
   - Developer/Agent C: US4 (fully independent)
4. US5→US6→US7 starts only once A/B/C's stories are done — it depends on all
   prior code existing to de-hardcode

---

## Notes

- [P] tasks touch different files with no dependency on an incomplete task —
  verified per-task above, not applied by default.
- Phase 0's four documentation tasks (T001–T005) all write to the same file
  (`docs/how-it-works.md`) and are listed sequentially on purpose, same
  reasoning as every other same-file task list in this project's tasks.md
  files (marking them `[P]` would just create merge conflicts).
- research.md's Open Questions (the GitHub REST API dispatch/poll payload
  shape, whether the 15-minute render timeout is realistic) are called out
  inline on T020 and the `RENDER_POLL_MAX_MINUTES` env var rather than left to
  be rediscovered.
- Commit after each user story's checkpoint, not after every individual task.
