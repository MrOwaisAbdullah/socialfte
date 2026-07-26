---
id: 0003
title: Week 1 repo harvest tasks
stage: tasks
date: 2026-07-26
surface: agent
model: claude-sonnet-5
feature: 001-week1-repo-harvest
branch: 001-week1-repo-harvest
user: owais_abdullah
command: /sp.tasks
labels: ["repo-harvest", "socialfte", "week1", "migration", "tasks"]
links:
  spec: specs/001-week1-repo-harvest/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/001-week1-repo-harvest/tasks.md
tests:
 - none (task-generation stage; no code executed)
---

## Prompt

/sp.tasks (no additional arguments — generate tasks.md from the existing spec.md,
plan.md, research.md, data-model.md, contracts/, and quickstart.md at
specs/001-week1-repo-harvest/)

## Response snapshot

Ran `.specify/scripts/bash/check-prerequisites.sh --json`, confirmed
`research.md`/`data-model.md`/`contracts/`/`quickstart.md` are all present alongside
the required `plan.md`/`spec.md`. Generated `tasks.md` with 32 tasks (T001–T032)
across 9 phases: Setup (2 tasks — environment/clean-tree check, making contract
scripts executable), Foundational (2 tasks — the FR-001 composition-review gate that
must clear before any deletion), then one phase per spec.md user story in priority
order (US1 strip: 3 tasks; US2 restructure: 7 tasks including the two import fixes
from research.md Decision 7; US3 dependencies: 3 tasks; US4 identity files: 7 tasks,
one per file plus a validation task; US5 brand+CLAUDE.md: 4 tasks; US6 checkpoint+
commit: 3 tasks), and a 1-task Polish phase running quickstart.md end-to-end.

The key structural decision: explicitly broke from the tasks-template's default
assumption that user-story phases can run in parallel. This feature's spec.md already
documents real physical dependencies between its 6 stories (you can't restructure
paths that haven't been stripped, can't author identity files referencing paths that
don't exist yet, can't hand off to `/brand-setup` before AGENTS.md exists), and FR-023
explicitly forbids batching stages — so the Dependencies section states plainly that
this feature is sequential end-to-end, with parallelism only available *within* a
story (US2's four independent file fixes, US4's six independent identity files).
Also reframed the template's "Implementation Strategy / MVP First" section, since
FR-022 means there's no partial-credit deployment here — everything lands as exactly
one commit only after Story 6's checkpoint passes, made by `contracts/checkpoint.sh`
itself as its last action, not by a separate task.

Every task cites its exact file path(s) and the FR(s)/research.md decision it
satisfies, per the checklist format rules (checkbox, ID, optional [P], Story label for
story-phase tasks only, file path in the description).

## Outcome

- ✅ Impact: The Week 1 migration now has an executable, dependency-ordered task list
  that `/sp.implement` (or a human) can follow directly — every destructive step
  (delete-list.sh, move-mapping.sh) is a single named task gated by the phase before
  it, and the single-commit requirement is enforced by tying the commit to
  `checkpoint.sh` rather than to any individual task.
- 🧪 Tests: none — no test-first requirement was specified for this feature; the
  verification tasks (T007, T013, T017, T024, T028, T029) run direct commands
  (imports, `git status`, `wc`, content greps) instead.
- 📁 Files: specs/001-week1-repo-harvest/tasks.md (new).
- 🔁 Next prompts: `/sp.implement` to actually execute the 32 tasks in order (with the
  operator confirmations FR-023 requires between phases), or `/sp.analyze` first for a
  cross-artifact consistency pass across spec.md/plan.md/tasks.md.
- 🧠 Reflection: the tasks-template's default phase-dependency language ("user stories
  can proceed in parallel") doesn't fit every feature — an ops/migration feature with
  a single-commit gate needed that language overridden explicitly rather than left in
  place to mislead whoever runs `/sp.implement` next.

## Evaluation notes (flywheel)

- Failure modes observed: none this stage — the main risk avoided was leaving the
  template's parallel-stories assumption unchallenged, which would have implied US2
  through US6 could start before US1 finished (physically impossible here) or that
  partial commits were acceptable (contradicts FR-022).
- Graders run and results (PASS/FAIL): manual format check — every task line verified
  against the required `- [ ] [TaskID] [P?] [Story?] Description with file path`
  shape; all 32 tasks conform.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): none pending; ready for `/sp.implement`.
