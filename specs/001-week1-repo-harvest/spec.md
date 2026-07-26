# Feature Specification: Week 1 Repo Harvest & Identity Bootstrap

**Feature Branch**: `001-week1-repo-harvest`
**Created**: 2026-07-26
**Status**: Draft
**Input**: User description: "We are in Week 1 of the SocialFTE build. Read docs/repo-harvest.md section 2 (delete list) and section 3 (keep list) before doing anything. Do these steps in order, confirming each is complete before moving to the next: (1) execute the §2 delete list, after first listing Remotion Studio's composition names for review, then show the full `git status` of deleted files; (2) restructure the repo into the §6 target tree — `remotion/` → `packages/remotion/`, the ffmpeg tool layer → `tools/media/`, `yt_upload.py` → `apps/worker/publishers/youtube.py` (unmodified), new empty `apps/dashboard/` and `apps/worker/`, imports fixed and verified by importing `tools.media.cutlib`; (3) fix `requirements.txt` per §5, showing the diff for approval first; (4) hand-write six identity files (SOUL.md, IDENTITY.md, AGENTS.md, HEARTBEAT.md, TOOLS.md, MEMORY.md) to specified structures, word/line limits, and content; (5) run `/brand-setup` manually and wait for BRAND.md, brand.ts, and an approved proof render; (6) turn CLAUDE.md into a symlink (or one-line pointer) to AGENTS.md; (7) run a checkpoint against a fixed checklist, fix any failure, and only then `git commit` the whole migration."

## Clarifications

### Session 2026-07-26

- Q: SOUL.md must open by naming and voicing a specific agent persona ("the agent whose name I gave you"), but no agent name was captured earlier in this session or found anywhere in the repo (`docs/`, memory, or prior PHRs). What is the agent's name? → A: No separate persona name — the agent is referred to as "SocialFTE" (the product name) in both SOUL.md and IDENTITY.md.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Review, then strip, dev-editor-only assets (Priority: P1)

The operator wants the video-editor-specific parts of the fork removed (dev-content
skills, screen-simulation libs, the 37 example shots, dev-only tools, example media) —
but only after seeing exactly what is about to disappear, and with zero risk to the two
asset libraries (`media/library/sfx/`, `media/library/music/`) that are expensive to
rebuild.

**Why this priority**: Nothing else in the migration is safe to do on top of a repo that
still carries the wrong assumptions (one long 16:9 video vs. many short 9:16 posts). It's
also the only irreversible step, so it has to be gated on operator visibility first.

**Independent Test**: Can be fully tested by producing the pre-deletion composition list,
running the delete list alone, and confirming via `git status` that the removed paths
match `docs/repo-harvest.md` §2 exactly, with the SFX/music libraries untouched.

**Acceptance Scenarios**:

1. **Given** the unmodified fork, **When** the operator asks to review the shots before
   deletion, **Then** they receive the full list of Remotion composition names in
   `remotion/src/shots/` before any file under that path is removed.
2. **Given** the reviewed composition list, **When** the §2 delete list is executed,
   **Then** `git status` shows exactly the paths enumerated in §2 as deleted — no more,
   no less — and `media/library/sfx/` and `media/library/music/` are unchanged.
3. **Given** the delete step just ran, **When** the operator asks what was removed,
   **Then** they can see the complete list without needing to inspect the filesystem
   themselves.

---

### User Story 2 - Restructure into the SocialFTE target tree (Priority: P2)

The operator wants the surviving code physically relocated into the target layout from
`docs/repo-harvest.md` §6 (`packages/remotion/`, `tools/media/`,
`apps/worker/publishers/`, empty `apps/dashboard/` and `apps/worker/` placeholders) with
every cross-file import that the move breaks already fixed.

**Why this priority**: Every later step (dependency fixes, identity files referencing
tool paths, future weeks' builds) assumes the new tree exists and imports cleanly. A
half-moved tree blocks everything downstream.

**Independent Test**: Can be fully tested by running the post-move import check (e.g.
`python -c "import tools.media.cutlib; import tools.media.clean_voice"`) and getting a
clean exit with no `ModuleNotFoundError` or broken relative import.

**Acceptance Scenarios**:

1. **Given** the stripped repo, **When** the restructuring runs, **Then** `remotion/`
   exists only at `packages/remotion/`, the ffmpeg tools exist only under `tools/media/`,
   and `apps/worker/publishers/youtube.py` exists with unmodified logic.
2. **Given** the restructured tree, **When** any moved Python module is imported,
   **Then** the import succeeds with no error caused by the move.
3. **Given** the restructured tree, **When** the operator lists the repo root,
   **Then** empty `apps/dashboard/` and `apps/worker/` directories exist as placeholders
   for later weeks.

---

### User Story 3 - Align dependencies with the agent stack (Priority: P3)

The operator wants `requirements.txt` to drop the single-purpose transcription/voice
libraries the new stack no longer needs and add the agent/worker stack it does need —
but only after reviewing the exact diff, since an unreviewed dependency change is a
common source of silent breakage.

**Why this priority**: Later weeks (worker, dashboard, brain/loop) depend on packages
this step introduces; getting it wrong is cheap to fix now and expensive once code is
written against it.

**Independent Test**: Can be fully tested by presenting the diff and confirming the
operator's approval was recorded before the file changes on disk.

**Acceptance Scenarios**:

1. **Given** the current `requirements.txt`, **When** the fix is proposed, **Then** the
   operator sees a diff limited to exactly the removals and additions in
   `docs/repo-harvest.md` §5, with no unrelated dependency churn.
2. **Given** the proposed diff, **When** the operator has not yet confirmed it,
   **Then** `requirements.txt` remains unchanged on disk.
3. **Given** the proposed diff, **When** the operator confirms, **Then** the packages
   still required by kept tools (ffmpeg-python, numpy, pillow,
   google-api-python-client, google-auth-oauthlib, onnxruntime) are still present.

---

### User Story 4 - Establish the agent's operating identity (Priority: P4)

The operator wants six root-level files that together define who the agent is and how
it behaves, so that every future automated run — and every human reading the repo cold —
can answer "what is this agent allowed to do" from a fixed, small set of files.

**Why this priority**: These files are read by the agent on every job (per
`AGENTS.md`'s own "before every job" rule) and are the main artifact of Week 1's
"identity + library" goal from `docs/socialfte-spec-v2.md` §10. They depend on Stories
1–3 being done (paths and stack referenced inside them must already be correct) but not
on Story 5 or 6.

**Independent Test**: Can be fully tested by checking each of the six files exists, and
that each stays inside its own structural constraint (SOUL.md's four sections and
400-word cap, AGENTS.md's seven rules and 600-word cap, HEARTBEAT.md's 50-line cap
matching the cron schedule, TOOLS.md's [PENDING] credential markers, MEMORY.md's three
empty sections).

**Acceptance Scenarios**:

1. **Given** the agent is identified as "SocialFTE" and the platform/channel facts,
   **When** SOUL.md is written, **Then** it has exactly the sections Identity / How I
   work / What I will not do / Communication style, states the agent never publishes
   without human approval, and is under 400 words.
2. **Given** the same facts, **When** IDENTITY.md is written, **Then** it records
   product name, version, author, supported platforms (TikTok marked draft-only until
   audited), each notification channel's current on/off state, the LLM gateway and
   models, and the base-repo attribution.
3. **Given** the decision rules supplied, **When** AGENTS.md is written, **Then** it
   covers pre-job reads, the draft→render→review→approved→publish framework, the
   human-approval boundary, the failure protocol, the token-refresh rule, the
   anti-repeat rules, and the audit-log rule, all under 600 words.
4. **Given** `docs/socialfte-spec-v2.md` §9, **When** HEARTBEAT.md is written, **Then**
   its checklist matches that cron schedule and stays under 50 lines.
5. **Given** the active platforms/channels supplied, **When** TOOLS.md is written,
   **Then** every credential field is marked `[PENDING]` rather than filled with a
   guessed value.
6. **Given** no prior performance history, **When** MEMORY.md is written, **Then** its
   three sections (Top performers, Learnings, Last updated) each read "None yet."

---

### User Story 5 - Regenerate the brand contract and de-duplicate the constitution (Priority: P5)

The operator wants the visual brand contract (`BRAND.md` + Remotion `brand.ts`/`fonts.ts`)
regenerated for the new client through the existing `/brand-setup` skill rather than
hand-authored, and wants `CLAUDE.md` to stop being a second copy of the operating
constitution that can silently drift from `AGENTS.md`.

**Why this priority**: `/brand-setup` already knows how to interview, verify fonts and
palette contrast, and render a proof card — reproducing that by hand risks an
uncalibrated or unreadable brand. This step is deliberately last among the file-writing
stories because both halves (brand files, CLAUDE.md) depend on AGENTS.md already
existing.

**Independent Test**: Can be fully tested by checking that `BRAND.md`,
`packages/remotion/src/brand.ts`, and a rendered proof card all exist and were produced
by `/brand-setup`, and that `CLAUDE.md` contains no content that isn't also in
`AGENTS.md`.

**Acceptance Scenarios**:

1. **Given** AGENTS.md exists, **When** the operator is told to run `/brand-setup`,
   **Then** no further migration step proceeds until the operator confirms `BRAND.md`,
   `brand.ts`, and a proof render all exist and are approved.
2. **Given** the approved brand files, **When** `CLAUDE.md` is updated, **Then** it is
   either a symlink to `AGENTS.md` or a one-line pointer file, and never carries
   independent operating rules again.

---

### User Story 6 - Gate the migration commit on a passing checkpoint (Priority: P6)

The operator wants a single, explicit checkpoint run before anything from this
migration is committed, so that `master` never ends up holding a repo that is
half-stripped, half-restructured, or missing an identity file.

**Why this priority**: This is the final safety net across all prior stories — it has no
independent value on its own, but it is what prevents a partially-done migration from
looking "done" in git history.

**Independent Test**: Can be fully tested by running the checkpoint checklist against
the current tree at any point and confirming the commit is refused (or not yet made)
while any item is failing.

**Acceptance Scenarios**:

1. **Given** the migration in any state, **When** the checkpoint is run, **Then** every
   item (clean restructured tree, working imports, all six identity files present,
   BRAND.md and brand.ts present, requirements.txt updated) is reported pass/fail
   individually.
2. **Given** one or more checkpoint items failing, **When** the operator asks to
   commit, **Then** the commit does not happen until the failing items are fixed and
   re-checked.
3. **Given** every checkpoint item passing, **When** the commit is made, **Then** it is
   the single commit for this migration (not several partial commits) and the working
   tree is clean immediately after.

---

### Edge Cases

- What happens if Remotion Studio cannot open a display in the current environment
  (e.g., a headless/WSL sandbox)? The composition-name review (Story 1) must still be
  satisfiable through an equivalent static listing (e.g., the generated shot registry
  or the exported composition names in each shot file) — "open Studio" is the preferred
  path, not the only acceptance path.
- What happens if uncommitted local changes exist before the delete step runs? They
  must surface to the operator before anything is deleted or moved, not be silently
  discarded alongside the intended removals.
- What happens if a moved tool's import breaks in a way not anticipated by
  `docs/repo-harvest.md` (the doc itself warns "at least one import will break")? The
  restructuring story is not done until every moved module imports cleanly, regardless
  of whether the specific breakage was pre-listed.
- What happens if the requirements diff would remove a package a kept tool still
  needs? The diff must be corrected before it is presented for approval, not applied
  and fixed afterward.
- What happens if the OS does not support symlinks for `CLAUDE.md`? It falls back to a
  one-line `<!-- See AGENTS.md -->` pointer file rather than a duplicated copy of
  `AGENTS.md`'s content.
- Resolved: the agent has no persona name distinct from the product — SOUL.md and
  IDENTITY.md both refer to it as "SocialFTE" (see Clarifications).
- What happens if `/brand-setup` is run but the operator doesn't approve the proof
  render? Stories 6 (checkpoint) and the CLAUDE.md/BRAND.md acceptance criteria remain
  unmet, and no later step should treat brand setup as complete.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The migration process MUST surface the full list of Remotion composition
  names under `remotion/src/shots/` to the operator before any file under that path is
  deleted.
- **FR-002**: The delete step MUST remove only the paths enumerated in
  `docs/repo-harvest.md` §2 (dev-content skills, screen-simulation libs, the example
  shots, the listed dev-only tools, and the listed example media) and MUST leave
  `media/library/sfx/` and `media/library/music/` untouched.
- **FR-003**: After deletion, the process MUST produce a complete, reviewable listing of
  every path removed (e.g., full `git status`).
- **FR-004**: The restructuring step MUST relocate `remotion/` to `packages/remotion/`
  and retarget aspect-ratio-dependent references from 1920×1080 to 1080×1920, while
  keeping `src/lib/` (the motion kit) intact.
- **FR-005**: The restructuring step MUST relocate the ffmpeg tool layer (`cutlib`,
  `render_cuts`, `verify_cut`, `bake`, `clean_voice`, `mix_sfx`, `mix_music`, RNNoise
  models) into `tools/media/`, and `clean_voice`'s ElevenLabs branch MUST be removed,
  keeping only the local RNNoise path.
- **FR-006**: The restructuring step MUST relocate `tools/yt_upload.py` to
  `apps/worker/publishers/youtube.py` without changing its logic at this stage.
- **FR-007**: The restructuring step MUST create empty `apps/dashboard/` and
  `apps/worker/` directories as placeholders for later weeks.
- **FR-008**: Every import broken by FR-004–FR-006's moves MUST be fixed, and the fix
  MUST be verified by successfully importing the moved modules (e.g.
  `tools.media.cutlib`, `tools.media.clean_voice`) with zero errors.
- **FR-009**: The dependency-fix step MUST present the `requirements.txt` diff (per
  `docs/repo-harvest.md` §5) to the operator and MUST NOT apply it until the operator
  explicitly confirms.
- **FR-010**: The dependency-fix step MUST retain every package still required by kept
  tools (`ffmpeg-python`, `numpy`, `pillow`, `google-api-python-client`,
  `google-auth-oauthlib`, `onnxruntime`) even while removing `assemblyai` and
  `elevenlabs` and adding the new agent/worker packages.
- **FR-011**: The identity-file step MUST author `SOUL.md` at the repo root, identifying
  the agent as "SocialFTE," with exactly the sections Identity, How I work, What I will
  not do, and Communication style, under 400 words, stating that the agent drafts,
  waits for human approval, and never publishes unapproved content, in a direct
  non-AI-sounding voice.
- **FR-012**: The identity-file step MUST author `IDENTITY.md` at the repo root with the
  supplied product facts: name, version, author, supported platforms (TikTok marked
  draft-only-until-audited), each notification channel's stated on/off state, LLM
  gateway and models, and base-repo attribution.
- **FR-013**: The identity-file step MUST author `AGENTS.md` at the repo root, under 600
  words, covering: what the agent reads before every job (SOUL, BRAND, HEARTBEAT); the
  draft→render→review→approved→publish decision framework; that everything except
  story-format reposts requires human approval; the failure protocol (state = failed,
  immediate channel notification); the token-refresh rule (never publish if
  `credentials.expires_at < now + 7 days`); the anti-repeat rules (no template repeat
  within 4 posts, no asset repeat within 10, caption cosine similarity < 0.85 against
  the last 30); and the no-exceptions audit-log rule.
- **FR-014**: The identity-file step MUST author `HEARTBEAT.md` at the repo root as a
  cron checklist under 50 lines, matching the schedule in `docs/socialfte-spec-v2.md`
  §9.
- **FR-015**: The identity-file step MUST author `TOOLS.md` at the repo root stubbing
  the active platforms and notification channel, with every credential field marked
  `[PENDING]` for the future BOOTSTRAP step to fill in.
- **FR-016**: The identity-file step MUST author `MEMORY.md` at the repo root with the
  sections Top performers, Learnings, and Last updated, each reading "None yet."
- **FR-017**: `SOUL.md` and the name-bearing part of `IDENTITY.md` MUST identify the
  agent as "SocialFTE" (no separate persona name), consistent across both files.
- **FR-018**: The brand step MUST delegate brand-file generation (`BRAND.md`,
  `packages/remotion/src/brand.ts`, `fonts.ts`) to the `/brand-setup` skill rather than
  authoring those files directly.
- **FR-019**: The migration MUST treat brand-file approval as a gate: no step after it
  MUST proceed until the operator confirms `BRAND.md`, `brand.ts`, and a proof render
  all exist and are acceptable.
- **FR-020**: The migration MUST convert `CLAUDE.md` into a non-authoritative pointer to
  `AGENTS.md` — a symlink where the operating system supports it, otherwise a one-line
  `<!-- See AGENTS.md -->` file — and MUST NOT leave independent operating-constitution
  content in `CLAUDE.md`.
- **FR-021**: The migration MUST run every item of the operator's checkpoint checklist
  (restructured tree matches the target layout, moved modules import cleanly, all six
  identity files exist, `BRAND.md` and `brand.ts` exist, `requirements.txt` is updated)
  and report each item's pass/fail status individually.
- **FR-022**: The migration MUST fix any failing checkpoint item before it is reported
  as passing, and MUST NOT create the migration's `git commit` while any checkpoint
  item is failing.
- **FR-023**: The migration MUST execute as seven sequential stages (delete, restructure,
  dependency fix, identity files, brand setup, CLAUDE.md conversion, checkpoint) with
  an explicit operator confirmation between each stage, and MUST NOT batch multiple
  stages into a single unconfirmed action.

### Key Entities

- **Delete List**: the exact set of paths from `docs/repo-harvest.md` §2 that must be
  removed — dev-content skills, screen-simulation libraries, example shots, dev-only
  tools, and example media — excluding the SFX/music libraries, which are explicitly
  protected.
- **Target Tree**: the destination directory layout from `docs/repo-harvest.md` §6
  (`apps/dashboard/`, `apps/worker/publishers/`, `packages/remotion/`, `tools/media/`,
  plus the six root identity files) that the restructuring step must converge on.
- **Identity File Set**: the six root-level markdown files (SOUL, IDENTITY, AGENTS,
  HEARTBEAT, TOOLS, MEMORY) that together form the contract the agent reads before
  every job; each has its own audience, structure, and length constraint.
- **Checkpoint**: the fixed checklist gating the migration's single `git commit` —
  every item must read as passing before the commit is allowed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The operator can review the pre-deletion composition list and complete the
  delete stage without needing to recover any file that should have been kept.
- **SC-002**: 100% of Python modules moved during restructuring import successfully on
  the first post-move check, with zero import errors.
- **SC-003**: All six identity files exist and each stays within its specified
  word/line limit, such that a new reader can determine what the agent does and does
  not do from SOUL.md and AGENTS.md alone, without consulting any other file.
- **SC-004**: The `requirements.txt` change set contains exactly the removals and
  additions specified for this migration, with zero unrelated dependency drift.
- **SC-005**: After the migration, `CLAUDE.md` and `AGENTS.md` never disagree, because
  `CLAUDE.md` carries no independent content of its own.
- **SC-006**: The migration reaches exactly one git commit, made only after every
  checkpoint item is reported passing.

## Assumptions

- Remotion Studio may not have a display available in this environment; per FR-001 and
  the Edge Cases, a static listing of composition names is an acceptable substitute for
  visually opening Studio.
- The platform, notification-channel, LLM-gateway, and model facts given in this
  request are treated as final for IDENTITY.md and TOOLS.md; the agent's name for
  SOUL.md is "SocialFTE" — no separate persona name (see Clarifications).
- `docs/socialfte-spec-v2.md` §9 is authoritative for HEARTBEAT.md's cron schedule.
- This specification covers only the Week 1 scope described in
  `docs/repo-harvest.md` and `docs/socialfte-spec-v2.md` §10 ("identity + library"); it
  does not cover Weeks 2–5 (dashboard, worker, brain/loop, motion compositions).
- Writing this specification does not itself delete, move, or commit anything — the
  seven stages described here are executed under a subsequent planning/implementation
  pass, each still gated by the operator confirmations required by FR-023.
