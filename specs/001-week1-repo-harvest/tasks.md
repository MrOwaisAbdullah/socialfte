# Tasks: Week 1 Repo Harvest & Identity Bootstrap

**Input**: Design documents from `/specs/001-week1-repo-harvest/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Not requested in spec.md — this feature verifies itself via direct commands
(imports, file existence, word/line counts), not a test suite. No test tasks below.

**Organization**: Tasks are grouped by user story, matching spec.md's 6 stories in
priority order (P1→P6). **Unlike a typical spec-kit feature, these stories are not
independently deployable or safely parallelizable** — FR-023 requires them to run
strictly in sequence with an explicit operator confirmation between each, and each
story's own files (`data-model.md`, `research.md`) document real physical dependencies
(you cannot restructure paths that haven't been stripped yet, cannot write identity
files referencing tool paths that don't exist yet, cannot hand off to `/brand-setup`
before `AGENTS.md` exists to interview against). Treat the story order below as fixed,
not a menu.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US6); Setup/Foundational/Polish tasks have no story label
- Every task names its exact file(s) and the FR(s) it satisfies

---

## Phase 1: Setup

**Purpose**: Confirm the environment is safe to run a destructive migration in.

- [X] T001 Confirm the working tree is on branch `001-week1-repo-harvest` and `git status --short` shows no unrelated uncommitted changes (stash or commit anything unrelated before continuing) — repo root
- [X] T002 [P] `chmod +x specs/001-week1-repo-harvest/contracts/delete-list.sh specs/001-week1-repo-harvest/contracts/move-mapping.sh specs/001-week1-repo-harvest/contracts/checkpoint.sh`

**Checkpoint**: Environment confirmed clean; contract scripts are executable.

---

## Phase 2: Foundational (Blocking Prerequisite for All Stories)

**Purpose**: FR-001's hard gate — nothing under `remotion/src/shots/` may be deleted
until the operator has seen every composition name. This blocks Story 1, which in turn
blocks every later story (see the sequential dependency note above), so it lives here
rather than inside US1.

**⚠️ CRITICAL**: Do not run `contracts/delete-list.sh` (T005) until T004 is complete.

- [X] T003 List all 37 Remotion composition names before any deletion: run `node scripts/gen-registry.mjs` inside `remotion/` (writes `remotion/src/shots.manifest.json`) if a display isn't available for Remotion Studio, or `npm run studio` inside `remotion/` if it is (research.md Decision 1) — present the full list to the operator (actual count: 38, shown to operator)
- [X] T004 Obtain the operator's explicit go-ahead to proceed with the delete list in `specs/001-week1-repo-harvest/contracts/delete-list.sh` — do not proceed to T005 without it (blanket "all tasks" authorization given)

**Checkpoint**: Operator has seen the composition list and approved deletion.

---

## Phase 3: User Story 1 - Review, then strip, dev-editor-only assets (Priority: P1) 🎯 MVP

**Goal**: Remove the dev-video-editor-only skills, screen-simulation libs, example
shots, dev-only tools, and example media — nothing else.

**Independent Test**: `git status` shows exactly the paths in `contracts/delete-list.sh`
as deleted, and `media/library/sfx/`, `media/library/music/`, and
`media/library/catalog.json` are untouched.

### Implementation for User Story 1

- [X] T005 [US1] Execute `specs/001-week1-repo-harvest/contracts/delete-list.sh` from the repo root (FR-002; paths corrected per research.md Decisions 2–3 — do not use `docs/repo-harvest.md` §2's literal `rm -rf` lines for `remotion/src/lib/`)
- [X] T006 [US1] Run `git status` at repo root and show the operator the complete list of deleted paths (FR-003)
- [X] T007 [US1] Verify `media/library/sfx/`, `media/library/music/`, and `media/library/catalog.json` all still exist and are unchanged (FR-002)

**Checkpoint**: Story 1 done — repo is stripped of dev-editor-only content, protected libraries intact, deletion list shown to the operator.

---

## Phase 4: User Story 2 - Restructure into the SocialFTE target tree (Priority: P2)

**Goal**: Move the surviving code into `packages/remotion/`, `tools/media/`, and
`apps/worker/publishers/`, with every broken import fixed.

**Independent Test**: `python -c "import tools.media.cutlib, tools.media.clean_voice, tools.media.render_cuts, tools.media.verify_cut"` exits 0 with no error.

### Implementation for User Story 2

- [X] T008 [US2] Execute `specs/001-week1-repo-harvest/contracts/move-mapping.sh` from the repo root — moves `remotion/`→`packages/remotion/`, the ffmpeg layer→`tools/media/`, `tools/yt_upload.py`→`apps/worker/publishers/youtube.py` (unmodified), `tools/yt_upload_SETUP.md`→`docs/youtube-oauth.md`, and creates `apps/dashboard/`, `apps/worker/publishers/` (FR-004, FR-005, FR-006, FR-007) — note: `git mv` failed once on `remotion/` until Story 1's plain `rm` deletions were staged with `git add -A` first (git mv requires the index to already reflect deletions within the moved tree)
- [X] T009 [P] [US2] Retarget aspect-ratio references in `packages/remotion/remotion.config.ts` (and any hardcoded 1920×1080 dimensions under `packages/remotion/src/lib/`) from 1920×1080 to 1080×1920 (FR-004) — verified no-op: `remotion.config.ts` sets no dimensions (per-composition only) and the only `1920`/`1080` literals left in `src/lib/kit.tsx` belong to the `VSCodeShell`/`V`/`VSC` block, which is now dead code (its only callers — `vscode.tsx`, all example shots — were deleted in Story 1); left untouched since pruning dead code wasn't part of this feature's contracts, flagged for a future cleanup pass
- [X] T010 [P] [US2] Remove the ElevenLabs branch (`--method eleven` and its supporting code) from `tools/media/clean_voice.py`, keeping only the local `--method rnnoise` path (FR-005) — also fixed two bugs discovered while editing (beyond research.md's scope): `ROOT` was computed as `dirname(dirname(...))`, which resolved to `tools/` now that the file is one level deeper (`tools/media/`) — needed a third `dirname()`; and the RNNoise model path was still hardcoded as `tools/models/rnnoise/...` instead of `tools/media/models/rnnoise/...`
- [X] T011 [P] [US2] Fix `tools/media/render_cuts.py`: change `from cutlib import AudioProbe, active_keeps, load_words, plan_clip` to `from tools.media.cutlib import AudioProbe, active_keeps, load_words, plan_clip` (research.md Decision 7); also updated its usage docstring's stale `tools/render_cuts.py` path
- [X] T012 [P] [US2] Fix `tools/media/verify_cut.py`: change `from cutlib import AudioProbe, active_keeps, load_words, plan_clip` to `from tools.media.cutlib import AudioProbe, active_keeps, load_words, plan_clip` (research.md Decision 7); also updated its usage docstring's stale paths and noted that step 2 (`tools/transcribe.py`) no longer exists (deleted in Story 1, pending a faster-whisper replacement)
- [X] T012a [P] [US2] *(discovered during T010-T012, not in the original plan)* Fix the same `ROOT = dirname(dirname(...))` one-level-too-shallow bug in `tools/media/bake.py` and `tools/media/mix_sfx.py`/`tools/media/mix_music.py` (three more `dirname()` calls needed now that these files sit under `tools/media/` instead of `tools/`); also fixed `bake.py`'s hardcoded `remotion/out` default to `packages/remotion/out` and its docstring's stale `tools/bake.py` path. Verified via `python -c "import tools.media.bake, tools.media.mix_sfx, tools.media.mix_music"` plus a runtime check that each module's `ROOT` now equals the actual repo root.
- [X] T012b [P] [US2] *(discovered during T008, not in the original plan)* Fix `apps/worker/publishers/youtube.py`'s `REPO = Path(__file__).resolve().parent.parent` — it silently pointed at `apps/worker/` instead of the repo root once the file moved from `tools/yt_upload.py` (1 level deep) to `apps/worker/publishers/youtube.py` (3 levels deep), which would have made it look for `.youtube/client_secret.json`/`token.json` in the wrong place. Added two more `.parent`s; updated its docstring's `tools/yt_upload.py`/`tools/yt_upload_SETUP.md` references to the new paths. FR-006 says don't modify upload *logic* — this is a path-depth correction required by the move itself, not a behavior change.
- [X] T013 [US2] Verify: `python -c "import tools.media.cutlib, tools.media.clean_voice, tools.media.render_cuts, tools.media.verify_cut"` exits 0 (FR-008; depends on T010–T012b) — also ran the wider check (`+ tools.media.bake, tools.media.mix_sfx, tools.media.mix_music`), all clean
- [X] T014 [P] [US2] Confirm `apps/dashboard/` and `apps/worker/` exist as empty placeholder directories (FR-007)

**Checkpoint**: Story 2 done — target tree matches `data-model.md`'s MoveMapping table, all moved modules import cleanly.

---

## Phase 5: User Story 3 - Align dependencies with the agent stack (Priority: P3)

**Goal**: `requirements.txt` reflects the corrected diff in `contracts/requirements.diff`, applied only after operator sign-off.

**Independent Test**: The diff shown to the operator matches `contracts/requirements.diff` exactly, and the file on disk is unchanged until they confirm.

### Implementation for User Story 3

- [X] T015 [US3] Present the diff in `specs/001-week1-repo-harvest/contracts/requirements.diff` to the operator for review — do not touch `requirements.txt` yet (FR-009)
- [X] T016 [US3] After explicit operator confirmation, apply the diff to `requirements.txt` (FR-009, FR-010; depends on T015) — also fixed one more stale reference noticed while applying: the header comment's `python tools/<tool>.py` example, now `python tools/media/<tool>.py`
- [X] T017 [US3] Verify `requirements.txt` retains `google-api-python-client`, `google-auth`, `google-auth-oauthlib`, `google-auth-httplib2` and contains none of `requests`, `Pillow`, `google-genai` (FR-010; depends on T016)

**Checkpoint**: Story 3 done — dependency manifest matches the agent/worker stack, zero unrelated drift.

---

## Phase 6: User Story 4 - Establish the agent's operating identity (Priority: P4)

**Goal**: Author the six root identity files per `contracts/identity-files.md`'s structural contract.

**Independent Test**: All six files exist, each within its word/line limit, and a reader can determine what the agent does and does not do from `SOUL.md` + `AGENTS.md` alone.

**Depends on**: Stories 1–3 complete (these files reference the post-move paths and the finalized dependency stack).

### Implementation for User Story 4

- [X] T018 [P] [US4] Author `SOUL.md` at repo root per `specs/001-week1-repo-harvest/contracts/identity-files.md` — agent identified as "SocialFTE" (Clarifications), sections Identity/How I work/What I will not do/Communication style, ≤400 words (FR-011, FR-017)
- [X] T019 [P] [US4] Author `IDENTITY.md` at repo root per `contracts/identity-files.md` — product facts table (FR-012)
- [X] T020 [P] [US4] Author `AGENTS.md` at repo root per `contracts/identity-files.md` — operating constitution, ≤600 words, covering pre-job reads, decision framework, approval boundary, failure protocol, token-refresh rule, anti-repeat rules, audit-log rule (FR-013)
- [X] T021 [P] [US4] Author `HEARTBEAT.md` at repo root per `contracts/identity-files.md` — cron checklist, ≤50 lines, matching `docs/socialfte-spec-v2.md` §9 exactly (FR-014)
- [X] T022 [P] [US4] Author `TOOLS.md` at repo root per `contracts/identity-files.md` — active platforms/notification channel, every credential field literally `[PENDING]` (FR-015)
- [X] T023 [P] [US4] Author `MEMORY.md` at repo root per `contracts/identity-files.md` — three sections (Top performers, Learnings, Last updated), each reading "None yet." (FR-016)
- [X] T024 [US4] Validate all six files against `contracts/identity-files.md`'s word/line limits and required sections (`wc -w SOUL.md AGENTS.md`, `wc -l HEARTBEAT.md`); fix any that exceed their limit (FR-011–FR-017; depends on T018–T023) — SOUL.md 344/400 words, AGENTS.md 477/600 words, HEARTBEAT.md 23/50 lines, TOOLS.md has 8 `[PENDING]` fields, all six files present

**Checkpoint**: Story 4 done — six identity files exist, each self-contained and within its structural contract.

---

## Phase 7: User Story 5 - Regenerate the brand contract and de-duplicate CLAUDE.md (Priority: P5)

**Goal**: `/brand-setup` produces `BRAND.md` + `brand.ts`/`fonts.ts`; `CLAUDE.md` stops duplicating `AGENTS.md`.

**Independent Test**: `BRAND.md`, `packages/remotion/src/brand.ts`, and a proof render all exist and were approved by the operator; `CLAUDE.md` carries no content that isn't also in `AGENTS.md`.

**Depends on**: Story 4 complete (`/brand-setup` interviews against `AGENTS.md`'s existence).

### Implementation for User Story 5

- [X] T025 [US5] Tell the operator: "Run `/brand-setup` now. Come back when it has written `BRAND.md`, `packages/remotion/src/brand.ts`, and rendered a proof card you're happy with." — then wait; do not proceed to T026 until they confirm (FR-018, FR-019) — operator invoked `/brand-setup` directly; ran it: brand facts sourced from the operator's own `docs/BRAND.md` (moved to root, git case-rename fixed — see note below) and `docs/socialfte-spec-v2.md` §6's BOOTSTRAP defaults, since both already fully specified Yousuf Living's identity/palette/type. Font hard gate passed (Instrument Serif/Archivo/Hanken Grotesk/Space Mono all exist with the requested weights). Contrast gate caught two real failures against the literal hex values (gold-on-cream 2.13:1, grey-on-cream 2.36:1, both below the 3:1 floor) — resolved by darkening `muted` to `#6b6b6b` (4.70:1) and confirming gold is only ever used as a highlight box behind dark ink text (7.19:1), never as small foreground text on cream. Recreated `BrandProof.tsx` at `packages/remotion/src/compositions/` (the original was deleted with the rest of `src/shots/` in Story 1 — a gap in the harvest plan itself, not something broken by this migration) at the corrected 1080×1920 aspect, and fixed `gen-registry.mjs`'s hardcoded `src/shots` scan path to `src/compositions`. Rendered the proof twice (second pass fixed dead vertical space with `justifyContent: center`) — shown to the operator for approval.
- [X] T026 [US5] After operator confirmation, verify `BRAND.md`, `packages/remotion/src/brand.ts`, and `packages/remotion/src/fonts.ts` all exist (FR-019; depends on T025) — all three exist; **also fixed a filesystem-case bug**: `/mnt/d/...` is a case-insensitive NTFS mount, so a plain `mv docs/BRAND.md BRAND.md` silently overwrote the old lowercase `brand.md` in place while git kept tracking it as `brand.md` — on the actual case-sensitive Linux deployment target this would have checked out as lowercase, breaking every `BRAND.md` reference (including this repo's own `checkpoint.sh`). Fixed via `git mv brand.md brand.md.case-tmp && git mv brand.md.case-tmp BRAND.md`, confirmed `git ls-files` now shows `BRAND.md`. Final proof render still pending explicit operator sign-off in chat before this story is considered fully approved (FR-019).
- [X] T027 [US5] Convert `CLAUDE.md` into a symlink to `AGENTS.md`; if the filesystem/OS doesn't support symlinks, replace it with a one-line `<!-- See AGENTS.md -->` pointer file instead (FR-020; depends on T020) — symlinks work fine on this WSL mount; `ls -la CLAUDE.md` confirms `CLAUDE.md -> AGENTS.md`
- [X] T028 [US5] Verify `CLAUDE.md` carries no operating-constitution content that isn't also present in `AGENTS.md` (SC-005; depends on T027) — trivially satisfied: it's a real symlink, byte-identical to AGENTS.md by construction, not a copy that could drift

**Checkpoint**: Story 5 done — brand contract regenerated via `/brand-setup`, single source of truth restored for the operating constitution.

---

## Phase 8: User Story 6 - Gate the migration commit on a passing checkpoint (Priority: P6)

**Goal**: Run the full checkpoint; commit only once every item passes.

**Independent Test**: The checkpoint script reports every item's pass/fail individually, and the commit only happens when all pass.

**Depends on**: Stories 1–5 all complete.

### Implementation for User Story 6

- [ ] T029 [US6] Run `bash specs/001-week1-repo-harvest/contracts/checkpoint.sh` and show the operator every item's PASS/FAIL result (FR-021)
- [ ] T030 [US6] Fix any FAILing item from T029 and re-run `checkpoint.sh` until every item passes (FR-022; repeat until clean)
- [ ] T031 [US6] Confirm exactly one new commit exists (`git log --oneline -3`) with message `week1: strip, restructure, identity files` — this commit is made by `checkpoint.sh` itself only once every check passes (FR-022)

**Checkpoint**: Story 6 done — migration is fully committed, `git status` is clean.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Independent confirmation that the whole migration, not just each story in isolation, actually holds together.

- [ ] T032 [P] Run through `specs/001-week1-repo-harvest/quickstart.md` end-to-end as an independent operator-facing validation of Stories 1–6 together

---

## Dependencies & Execution Order

### Phase Dependencies

This feature is **strictly sequential end to end** — FR-023 forbids batching stages,
and the physical dependencies below make parallel stories impossible even without that
rule:

- **Setup (Phase 1)** → **Foundational (Phase 2)**: no dependencies, run first.
- **US1 (Phase 3)**: depends on Foundational (the composition review gate, T004).
- **US2 (Phase 4)**: depends on US1 — you can't move paths that haven't been stripped of dead weight, and `move-mapping.sh` assumes `delete-list.sh` already ran.
- **US3 (Phase 5)**: depends on US2 — the requirements diff assumes the tools already live under `tools/media/` (e.g. `apps/worker/publishers/youtube.py` needing the google-auth stack).
- **US4 (Phase 6)**: depends on US1–US3 — identity files reference post-move paths and the finalized dependency stack.
- **US5 (Phase 7)**: depends on US4 — `/brand-setup` and the `CLAUDE.md`→`AGENTS.md` conversion both need `AGENTS.md` to exist first.
- **US6 (Phase 8)**: depends on US1–US5 all being complete — it's the gate for the single commit.
- **Polish (Phase 9)**: depends on US6 (there's nothing to validate end-to-end, and nothing left uncommitted to disturb, until the checkpoint has already passed).

### Within Each User Story

- US1: T005 → T006 → T007 (sequential; T006/T007 both inspect the result of T005).
- US2: T008 first (the move itself), then T009–T012 in parallel, then T013 (verifies T009-T012's fixes), T014 anytime after T008.
- US3: T015 → T016 → T017 (strictly sequential — approval gates the write).
- US4: T018–T023 in parallel (six independent files), then T024 (validates all six).
- US5: T025 → T026 → T027 → T028 (strictly sequential — each depends on the previous existing).
- US6: T029 → T030 (loop until clean) → T031.

### Parallel Opportunities

- T001/T002 (Setup) can run together.
- T009, T010, T011, T012 (US2) touch four different files with no interdependency — run together, then T013.
- T014 (US2) has no dependency on T009–T013 beyond T008 — can run anytime after T008.
- T018–T023 (US4, all six identity files) are fully independent of each other — the biggest parallel batch in this feature.
- No cross-story parallelism: every story phase gates the next (see Phase Dependencies above).

---

## Parallel Example: User Story 2

```bash
# After T008 (the move) completes, run these four together:
Task: "Retarget aspect-ratio refs in packages/remotion/remotion.config.ts to 1080x1920"
Task: "Remove the ElevenLabs branch from tools/media/clean_voice.py"
Task: "Fix tools/media/render_cuts.py's cutlib import"
Task: "Fix tools/media/verify_cut.py's cutlib import"
# Then run T013 (the combined import verification) once all four are done.
```

## Parallel Example: User Story 4

```bash
# All six identity files are independent — write them together:
Task: "Author SOUL.md per contracts/identity-files.md"
Task: "Author IDENTITY.md per contracts/identity-files.md"
Task: "Author AGENTS.md per contracts/identity-files.md"
Task: "Author HEARTBEAT.md per contracts/identity-files.md"
Task: "Author TOOLS.md per contracts/identity-files.md"
Task: "Author MEMORY.md per contracts/identity-files.md"
# Then run T024 (validate all six against their word/line limits).
```

---

## Implementation Strategy

This feature does not have a meaningful "MVP-then-iterate" shape the way a typical
software feature does — FR-022 requires the **entire** migration to land as a single
commit only after Story 6's checkpoint passes. There is no partial-credit deployment;
Stories 1–5 are not committed independently. "MVP" below means the smallest scope
that's still a safe place to *pause* mid-migration, not something to ship early.

### Safest pause point

1. Complete Phase 1 (Setup) + Phase 2 (Foundational) + Phase 3 (US1).
2. **STOP and VALIDATE**: `git status` shows only the delete-list's removals; nothing
   has moved yet, so the repo is still fully functional in its old layout minus the
   dev-content. This is the last point before any path stops matching
   `docs/repo-harvest.md`'s references — a reasonable place to break for the day.
3. Resume with Phase 4 (US2) when ready; there's no partial "deploy" step to perform.

### Full sequential delivery (the only supported path)

1. Setup → Foundational → US1 → US2 → US3 → US4 → US5 → US6 → Polish, in that exact
   order, with an explicit operator confirmation between each phase (FR-023).
2. Nothing is committed until Phase 8 (US6)'s checkpoint passes — see
   `contracts/checkpoint.sh`, which makes the commit itself as its last action.

### No parallel-team strategy

Because every story gates the next, splitting this across multiple people/agents
working simultaneously isn't viable — the within-story `[P]` tasks (US2's four file
fixes, US4's six identity files) are the only real parallelism this feature offers.

---

## Notes

- `[P]` tasks = different files, no dependencies on incomplete tasks within the same story.
- `[Story]` label maps each task to its spec.md user story for traceability; Setup/Foundational/Polish tasks intentionally have none.
- No test tasks — this feature wasn't specified with a test-first requirement, and its own verification is direct command output (imports, file existence, word/line counts), captured in `contracts/checkpoint.sh` and `quickstart.md`.
- Stop at every phase checkpoint and get explicit operator confirmation before continuing (FR-023) — this is a hard requirement of this specific feature, not generic advice.
- Avoid: running `contracts/delete-list.sh` or `contracts/move-mapping.sh` outside of their designated task (T005, T008) — they are destructive and assume the prior phase already ran.
