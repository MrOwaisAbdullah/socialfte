---
id: 0002
title: Week 1 repo harvest plan
stage: plan
date: 2026-07-26
surface: agent
model: claude-sonnet-5
feature: 001-week1-repo-harvest
branch: 001-week1-repo-harvest
user: owais_abdullah
command: /sp.plan
labels: ["repo-harvest", "socialfte", "week1", "migration", "planning"]
links:
  spec: specs/001-week1-repo-harvest/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/001-week1-repo-harvest/plan.md
 - specs/001-week1-repo-harvest/research.md
 - specs/001-week1-repo-harvest/data-model.md
 - specs/001-week1-repo-harvest/quickstart.md
 - specs/001-week1-repo-harvest/contracts/delete-list.sh
 - specs/001-week1-repo-harvest/contracts/move-mapping.sh
 - specs/001-week1-repo-harvest/contracts/requirements.diff
 - specs/001-week1-repo-harvest/contracts/identity-files.md
 - specs/001-week1-repo-harvest/contracts/checkpoint.sh
 - CLAUDE.md
tests:
 - none (planning stage; no code executed against the target tree)
---

## Prompt

/sp.plan (no additional arguments — run the implementation planning workflow against
the existing spec at specs/001-week1-repo-harvest/spec.md)

## Response snapshot

Ran `.specify/scripts/bash/setup-plan.sh --json` to get FEATURE_SPEC/IMPL_PLAN/
SPECS_DIR/BRANCH, then read the copied plan template and the project constitution
(still the unfilled placeholder template — no principles ratified yet, so the
Constitution Check gate is treated as not-applicable for this feature, falling back to
CLAUDE.md's default engineering policies).

Before writing anything, cross-checked `docs/repo-harvest.md`'s harvest plan against
the actual current repo state (requirements.txt contents, remotion/src/lib/ file
names, tools/*.py imports, media/ directory contents) and found seven concrete
discrepancies worth resolving up front rather than letting `/sp.tasks` inherit them:
(1) Remotion Studio composition review can be done headlessly via
`gen-registry.mjs`'s manifest; (2) the three "screen-simulation" deletes in §2 are
files (`browser.tsx`, `vscode.tsx`, `screencast.tsx`), not directories as the doc's
`rm -rf` commands assume; (3) `videos/` and `media/library/faces/` both contain a
README.md, not literally empty; (4) the real current `requirements.txt` has none of
§5's named removals (`assemblyai`/`elevenlabs` were never pip packages — those
services were called via raw `requests`/`curl`) and does have three packages
(`requests`, `Pillow`, `google-genai`) that become orphaned once their only consumers
are deleted, none of which the doc's diff mentions; (5) `media/library/catalog.json`
(top-level) is also implicitly protected alongside the two sub-catalogs; (6) no
ratified constitution exists; (7) `render_cuts.py`/`verify_cut.py`'s bare
`from cutlib import ...` is the specific import `docs/repo-harvest.md` §8 warns will
break — identified precisely (needs to become a package-qualified import) instead of
left as "discover it later."

Wrote `research.md` (7 decisions, each with rationale and rejected alternatives),
`data-model.md` (five structural entities — DeleteListItem, MoveMapping,
RequirementsChange, IdentityFile, CheckpointItem — with exact membership tables
corrected per the research findings), `contracts/` (delete-list.sh, move-mapping.sh,
requirements.diff, identity-files.md, checkpoint.sh — executable/reviewable manifests
standing in for this ops feature's lack of a REST/GraphQL surface), `quickstart.md`
(a manual validation walkthrough per user story, for confirming `/sp.implement`'s
result independently rather than trusting its own summary), and filled `plan.md`
(Technical Context, Constitution Check, Project Structure with the Option-1
single-project structure matching `docs/repo-harvest.md` §6, Complexity Tracking left
empty since the constitution gate doesn't apply).

Ran `update-agent-context.sh claude`, which appended `## Active Technologies` /
`## Recent Changes` sections to CLAUDE.md — its line-based parser mangled the prose
Technical Context fields into garbled entries (grabbed only the first comma-clause of
each field), so manually cleaned up the appended section afterward rather than leaving
broken text in a file every future agent run reads.

## Outcome

- ✅ Impact: Phase 0/1 planning artifacts complete for the Week 1 migration; the
  7 doc-vs-reality discrepancies are now resolved decisions instead of latent bugs
  `/sp.tasks` or `/sp.implement` would otherwise have hit mid-execution (e.g. a no-op
  `rm -rf` that looks like it succeeded, or an import-fix task that checks the wrong
  files).
- 🧪 Tests: none — planning stage. `contracts/checkpoint.sh` and `quickstart.md` define
  the verification commands `/sp.implement` and a human reviewer will actually run
  later.
- 📁 Files: plan.md, research.md, data-model.md, quickstart.md, contracts/*.{sh,md,diff}
  (all new, under specs/001-week1-repo-harvest/); CLAUDE.md (Active
  Technologies/Recent Changes sections appended, then manually cleaned up).
- 🔁 Next prompts: `/sp.tasks` to turn contracts/data-model into a dependency-ordered
  tasks.md, then `/sp.implement` to actually run the gated 7-stage migration.
- 🧠 Reflection: writing Technical Context as full prose sentences (for human
  readability) broke `update-agent-context.sh`'s naive single-line field parser;
  next time, keep each Technical Context field to one short line and put the
  reasoning in Summary/research.md instead, so the auto-append doesn't need a manual
  fixup pass.

## Evaluation notes (flywheel)

- Failure modes observed: `update-agent-context.sh`'s field extraction assumes short,
  single-clause Technical Context values; verbose fields produced garbled
  Active-Technologies/Recent-Changes entries in CLAUDE.md that required a manual
  cleanup edit immediately after running the script.
- Graders run and results (PASS/FAIL): none formal; verified by direct file reads
  (repo tree, requirements.txt, tool imports) rather than an automated grader, since
  the goal was reconciling documentation against ground truth.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): write Technical Context fields as short
  single-line values going forward, with detail pushed to Summary/research.md, to
  avoid the same auto-append garbling on the next `/sp.plan` run.
