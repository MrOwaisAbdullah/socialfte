# Implementation Plan: Week 1 Repo Harvest & Identity Bootstrap

**Branch**: `001-week1-repo-harvest` | **Date**: 2026-07-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-week1-repo-harvest/spec.md`

**Note**: This template is filled in by the `/sp.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Strip this fork of `claude-youtube-editor` down to the four reusable layers
(brand contract, Remotion motion kit, ffmpeg tool layer, YouTube upload OAuth flow),
relocate them into the SocialFTE target tree (`packages/remotion/`, `tools/media/`,
`apps/worker/publishers/`), fix the dependency manifest, author the six root identity
files that make up the agent's operating contract, hand off brand regeneration to
`/brand-setup`, collapse `CLAUDE.md` into a pointer at `AGENTS.md`, and gate the whole
migration's single commit on a checkpoint. Phase 0 research found that
`docs/repo-harvest.md`'s generic harvest plan doesn't exactly match this fork's actual
file layout and dependencies in several places (see `research.md`) — this plan follows
the verified actual state, not the doc's literal text, wherever the two disagree.

## Technical Context

**Language/Version**: Python 3.12 (repo's installed interpreter; tools require 3.10+
per existing `requirements.txt` header) for `tools/media/*`; Node.js/TypeScript 5.9 for
`packages/remotion/` (unchanged from the existing `remotion/package.json`); Markdown
for the six identity files and `BRAND.md` — no runtime for those.
**Primary Dependencies**: Existing, kept: `google-api-python-client`, `google-auth`,
`google-auth-oauthlib`, `google-auth-httplib2` (OAuth for the YouTube publisher),
Remotion 4.x + React 18 (unchanged). New, added this feature per
`docs/repo-harvest.md` §5 (see `contracts/requirements.diff`): `faster-whisper`,
`openai-agents`, `litellm`, `fastapi`, `uvicorn[standard]`, `apscheduler`,
`sqlalchemy`, `psycopg[binary]`, `pgvector`, `boto3`, `httpx`, `pydantic-settings`.
Removed (orphaned by Story 1's deletions, see `research.md` Decision 4): `requests`,
`Pillow`, `google-genai`.
**Storage**: N/A for this feature — the new stack's Postgres/pgvector dependency is
added to `requirements.txt` for later weeks (per `docs/socialfte-spec-v2.md` §10, the
database schema itself is Week 2 scope). This feature only moves/deletes files and
authors Markdown.
**Testing**: No unit-test framework change for this feature. Verification is by direct
command execution (`python -c "import ..."`, `git status`, file-existence and
word/line-count checks) as specified in `data-model.md`'s `CheckpointItem` table and
run via `contracts/checkpoint.sh` — this is a repo-restructuring feature, not a
library with its own test suite.
**Target Platform**: Local development environment (WSL2/Linux per this session);
no server/deployment target changes in this feature.
**Project Type**: Single repository restructuring into a multi-root layout
(`apps/`, `packages/`, `tools/`) — see Project Structure below.
**Performance Goals**: N/A — no runtime performance surface is introduced by this
feature (file moves and Markdown authoring only).
**Constraints**: Every stage requires explicit operator confirmation before the next
begins (FR-023); the migration must land as exactly one git commit (FR-022); zero
regression in what the two protected media libraries contain (FR-002).
**Scale/Scope**: Single repository, single operator, one-time migration (not a
recurring or multi-tenant process). Scope is bounded to `docs/repo-harvest.md`'s Week 1
checklist and does not include Weeks 2-5 work (dashboard, worker runtime, brain/loop,
new Remotion compositions).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template — every field is a
`[PLACEHOLDER]`, so no principles have been ratified for this project yet
(`research.md` Decision 6). There is nothing to check compliance against, so this gate
is **not applicable** for this feature. Falling back to `CLAUDE.md`'s stated default
policies instead: smallest viable diff, no unrelated refactors, don't invent
APIs/data/contracts, cite existing code precisely. This plan and its tasks are held to
those defaults.

**Post-Phase-1 re-check**: Still not applicable — Phase 1 design (below) didn't
introduce any new architectural surface a constitution would normally govern (no new
service, no new public API, no new auth boundary). No gate violations to justify in
Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-week1-repo-harvest/
├── plan.md              # This file (/sp.plan command output)
├── research.md          # Phase 0 output — reconciles docs/repo-harvest.md with actual repo state
├── data-model.md         # Phase 1 output — DeleteListItem, MoveMapping, RequirementsChange, IdentityFile, CheckpointItem
├── quickstart.md         # Phase 1 output — manual validation walkthrough per user story
├── contracts/             # Phase 1 output — executable manifests, not REST/GraphQL (see note below)
│   ├── delete-list.sh
│   ├── move-mapping.sh
│   ├── requirements.diff
│   ├── identity-files.md
│   └── checkpoint.sh
└── tasks.md              # Phase 2 output (/sp.tasks command - NOT created by /sp.plan)
```

**Note on "contracts"**: this feature has no API surface — it moves and authors files.
The plan template's Phase 1 "contracts" step is adapted here to mean the exact,
reviewable manifests each destructive or generative step must follow (what gets
deleted, what moves where, what the dependency diff is, what each identity file must
contain, what the checkpoint checks) — the same role an OpenAPI spec plays for a
REST feature: a fixed agreement `/sp.tasks` and `/sp.implement` build against instead
of re-deriving from prose each time.

### Source Code (repository root)

```text
# Option 1: Single project, restructured in place (this feature's actual shape)
socialfte/                            # repo root (this repo)
├── SOUL.md                           # NEW — Story 4
├── IDENTITY.md                       # NEW — Story 4
├── AGENTS.md                         # NEW (from CLAUDE.md content) — Story 4
├── CLAUDE.md                         # -> pointer to AGENTS.md — Story 5
├── BRAND.md                          # NEW (from brand.md, via /brand-setup) — Story 5
├── TOOLS.md                          # NEW — Story 4
├── MEMORY.md                         # NEW — Story 4
├── HEARTBEAT.md                      # NEW — Story 4
├── requirements.txt                  # UPDATED — Story 3
├── .claude/skills/                   # fake-screencast, clean-cut, suggest-sfx removed — Story 1
├── apps/
│   ├── dashboard/                    # NEW, empty this week — Story 2
│   └── worker/
│       └── publishers/
│           └── youtube.py            # from tools/yt_upload.py, unmodified — Story 2
├── packages/
│   └── remotion/                     # from remotion/, 9:16 retarget — Story 2
│       └── src/
│           ├── lib/                  # motion kit, kept; 3 screen-sim files removed — Story 1/2
│           └── compositions/         # replaces src/shots/, empty this week — Story 1/2
├── tools/
│   └── media/                        # from tools/ ffmpeg layer — Story 2
│       ├── cutlib.py
│       ├── render_cuts.py            # import fixed — research.md Decision 7
│       ├── verify_cut.py             # import fixed — research.md Decision 7
│       ├── bake.py
│       ├── clean_voice.py            # ElevenLabs branch removed
│       ├── mix_sfx.py
│       ├── mix_music.py
│       └── models/rnnoise/
├── media/library/{sfx,music}/        # untouched — Story 1
└── docs/youtube-oauth.md             # from tools/yt_upload_SETUP.md — Story 2
```

**Structure Decision**: Option 1 (single project), because this feature restructures
one existing repository in place rather than introducing a frontend/backend split or a
mobile+API split. The `apps/` + `packages/` + `tools/` layout mirrors
`docs/repo-harvest.md` §6 exactly (it is itself already a monorepo-style convention,
just not yet a second "project type" in the plan template's sense — `apps/dashboard/`
and the rest of `apps/worker/` are empty placeholders this week, not implemented
services).

## Complexity Tracking

*No entries — Constitution Check gate is not applicable (no ratified constitution),
so there is nothing to justify here.*
