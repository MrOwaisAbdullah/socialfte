# Phase 1 Data Model: Week 1 Repo Harvest & Identity Bootstrap

This feature moves and authors files rather than runtime records, so the "entities"
below are structural — each is a set of filesystem paths or a document with fixed
required fields, not a database row. They are still worth modeling explicitly because
`/sp.tasks` needs exact membership lists, not paraphrases of `docs/repo-harvest.md`.

## Entity: DeleteListItem

One row per path removed in Story 1. Source of truth: `docs/repo-harvest.md` §2,
corrected by `research.md` Decisions 2–3.

| Field | Description |
|---|---|
| `path` | Repo-relative path to delete (file or directory) |
| `category` | One of: dev-skill, remotion-lib, remotion-shots, tool, media |
| `protected_children` | Paths under this one that must survive the delete (e.g. `catalog.json` under a library dir) |

Full membership (post-research):

```
.claude/skills/fake-screencast/
.claude/skills/clean-cut/
.claude/skills/suggest-sfx/
remotion/src/lib/browser.tsx
remotion/src/lib/vscode.tsx
remotion/src/lib/screencast.tsx
remotion/src/shots/*                       (all of it — example/ and brand/)
tools/capture_web.py
tools/editor/
tools/transcribe.py
tools/gen_sfx.py
tools/gen_music.py
tools/gen_thumbnail.py
tools/yt_stats.py
media/library/faces/                       (including its README.md)
media/projects/*
videos/                                    (including its README.md)
```

Never delete (must still exist after Story 1): `media/library/sfx/`,
`media/library/music/`, `media/library/catalog.json`.

## Entity: MoveMapping

One row per Story 2 relocation. Source of truth: `docs/repo-harvest.md` §3b/§3c/§6.

| Field | Description |
|---|---|
| `source_path` | Current repo-relative path |
| `dest_path` | Target repo-relative path |
| `content_change` | none \| aspect-ratio-retarget \| strip-branch \| none-yet (explicitly deferred) |

| source_path | dest_path | content_change |
|---|---|---|
| `remotion/` (project root, config, registry gen) | `packages/remotion/` | aspect-ratio-retarget (1920×1080 → 1080×1920 in `remotion.config.ts` and any hardcoded dims in `src/lib/`) |
| `remotion/src/lib/` | `packages/remotion/src/lib/` | none (motion kit kept intact) |
| `remotion/src/shots/` | `packages/remotion/src/compositions/` | none-yet (left empty; new 9:16 compositions are a later week's work, out of scope here) |
| `tools/cutlib.py` | `tools/media/cutlib.py` | none |
| `tools/render_cuts.py` | `tools/media/render_cuts.py` | aspect-ratio-retarget (output target 1080×1920) |
| `tools/verify_cut.py` | `tools/media/verify_cut.py` | none |
| `tools/bake.py` | `tools/media/bake.py` | none |
| `tools/clean_voice.py` | `tools/media/clean_voice.py` | strip-branch (remove the `--method eleven` / ElevenLabs path entirely; keep only `--method rnnoise`) |
| `tools/mix_sfx.py` | `tools/media/mix_sfx.py` | none |
| `tools/mix_music.py` | `tools/media/mix_music.py` | none |
| `tools/models/rnnoise/` | `tools/media/models/rnnoise/` | none |
| `tools/yt_upload.py` | `apps/worker/publishers/youtube.py` | none (explicitly deferred — FR-006) |
| `tools/yt_upload_SETUP.md` | `docs/youtube-oauth.md` | none |

New empty directories (no source): `apps/dashboard/`, `apps/worker/` (with
`apps/worker/publishers/` as the parent of the moved `youtube.py`).

## Entity: RequirementsChange

Governs Story 3. Source of truth: `research.md` Decision 4 (supersedes
`docs/repo-harvest.md` §5's literal text).

| Field | Description |
|---|---|
| `package` | pip package name |
| `action` | remove \| keep \| add |
| `reason` | why, tied back to which tool needs/needed it |

```
remove: requests        (only consumer tools/transcribe.py is deleted)
remove: Pillow          (only consumer tools/gen_thumbnail.py is deleted)
remove: google-genai    (only consumer tools/gen_thumbnail.py is deleted)
keep:   google-api-python-client   (needed by apps/worker/publishers/youtube.py)
keep:   google-auth                 (needed by apps/worker/publishers/youtube.py)
keep:   google-auth-oauthlib        (needed by apps/worker/publishers/youtube.py)
keep:   google-auth-httplib2        (needed by apps/worker/publishers/youtube.py)
add:    faster-whisper
add:    openai-agents
add:    litellm
add:    fastapi
add:    uvicorn[standard]
add:    apscheduler
add:    sqlalchemy
add:    psycopg[binary]
add:    pgvector
add:    boto3
add:    httpx
add:    pydantic-settings
```

## Entity: IdentityFile

One row per Story 4 file. All six live at the repo root.

| `name` | `required_sections` | `limit` | `key_facts_source` |
|---|---|---|---|
| `SOUL.md` | Identity; How I work; What I will not do; Communication style | ≤ 400 words | agent name = "SocialFTE" (Clarifications); Pakistani furniture brand; draft→approve→publish; never publishes unapproved; brand-voice captions |
| `IDENTITY.md` | Product facts (name, version, author, platforms, channels, LLM gateway/models, base-repo attribution) | none stated | spec.md request literal values |
| `AGENTS.md` | Pre-job reads; decision framework; approval boundary; failure protocol; token-refresh rule; anti-repeat rules; audit-log rule | ≤ 600 words | spec.md request literal rules |
| `HEARTBEAT.md` | Cron checklist | ≤ 50 lines | `docs/socialfte-spec-v2.md` §9 |
| `TOOLS.md` | Active platforms; active notification channel; credential fields | all credential fields `[PENDING]` | spec.md request literal values |
| `MEMORY.md` | Top performers; Learnings; Last updated | each section = "None yet." | none (initial state) |

## Entity: CheckpointItem

Governs Story 6. Each item must independently report pass/fail before the single
migration commit (FR-021, FR-022).

| `id` | `check` |
|---|---|
| `tree` | `git status` shows a restructured tree matching the Target Tree (MoveMapping dest_paths all present, DeleteListItem paths all absent except protected children) |
| `imports` | `python -c "import tools.media.cutlib; import tools.media.clean_voice"` exits 0 |
| `identity` | All six `IdentityFile` rows exist on disk |
| `brand_md` | `BRAND.md` exists (written by `/brand-setup`) |
| `brand_ts` | `packages/remotion/src/brand.ts` exists (written by `/brand-setup`) |
| `requirements` | `requirements.txt` reflects the `RequirementsChange` table exactly |
| `commit` | Exactly one commit made, only after every item above passes |
