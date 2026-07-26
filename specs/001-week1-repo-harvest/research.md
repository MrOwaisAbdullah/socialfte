# Phase 0 Research: Week 1 Repo Harvest & Identity Bootstrap

**Input**: `spec.md`, `docs/repo-harvest.md`, `docs/socialfte-spec-v2.md` §9/§10, and the
actual current state of this fork's tree (`remotion/`, `tools/`, `media/`,
`requirements.txt`).

This feature has no unresolved `NEEDS CLARIFICATION` markers from Technical Context —
the open questions instead come from `docs/repo-harvest.md` describing a *generic*
harvest plan that assumes a slightly different starting tree than this fork actually
has. Each finding below reconciles the doc against the real repo so `/sp.tasks` can
generate tasks against ground truth, not the doc's assumptions.

## Decision 1 — Composition-name review without a live Remotion Studio session

- **Decision**: List composition names by reading each shot's `compositionConfig` id
  (or running `node scripts/gen-registry.mjs` inside `remotion/`, which writes
  `src/shots.manifest.json` with every composition's metadata) instead of requiring an
  interactive Remotion Studio GUI session.
- **Rationale**: `remotion/scripts/gen-registry.mjs` already parses every `*.tsx` under
  `src/shots/` for its `compositionConfig` block and produces a manifest — this is the
  same data Studio would show, and it works headlessly (no display required), which
  matters in a WSL/sandboxed execution environment.
- **Alternatives considered**: Requiring a real `npm run studio` session — rejected as
  the sole path because it needs a browser/display Remotion can serve to, which may not
  exist wherever `/sp.implement` actually runs; kept as the *preferred* path when a
  display is available (FR-001 accepts either).

## Decision 2 — `remotion/src/lib/` delete targets are files, not directories

- **Decision**: The three "screen-simulation" lib deletions from
  `docs/repo-harvest.md` §2 (`rm -rf remotion/src/lib/browser-frame`,
  `.../vscode-shell`, `.../screencast`) map to single files in this fork, not
  subdirectories: `remotion/src/lib/browser.tsx`, `remotion/src/lib/vscode.tsx`, and
  `remotion/src/lib/screencast.tsx`. There is no `browser-frame/` or `vscode-shell/`
  directory in this tree.
- **Rationale**: Verified directly (`find remotion/src/lib`) — only four files exist:
  `browser.tsx`, `kit.tsx`, `screencast.tsx`, `vscode.tsx`. Running the doc's literal
  `rm -rf` commands would silently no-op (no error, nothing deleted) and leave the
  screen-simulation code in place, which defeats the purpose of the strip-down.
- **Alternatives considered**: Running the doc's commands as-written and treating a
  no-op as acceptable — rejected; a silent no-op is worse than an explicit path
  mismatch because it looks like the step succeeded.

## Decision 3 — `videos/` and `media/library/faces/` are not literally empty

- **Decision**: Delete `videos/` and `media/library/faces/` in full, including the
  `README.md` each currently contains.
- **Rationale**: `docs/repo-harvest.md` describes `videos/` as "empty anyway," but it
  holds a `README.md`. The deletion's *intent* — this fork produces short vertical
  posts, not long-form video projects, so the long-form output directory and the
  talking-head face-reference directory don't apply — still holds regardless of the
  doc's inaccurate description of current contents.
- **Alternatives considered**: Preserving the READMEs since they weren't explicitly
  named — rejected; keeping stray READMEs from a deleted directory's purpose would
  leave dead documentation with nothing left to document.

## Decision 4 — `requirements.txt` diff must be computed from the actual current file, not assumed

- **Decision**: The actual current `requirements.txt` is: `requests`, `Pillow`,
  `google-genai`, `google-api-python-client`, `google-auth`, `google-auth-oauthlib`,
  `google-auth-httplib2`. None of `docs/repo-harvest.md` §5's named removals
  (`assemblyai`, `elevenlabs`) exist as literal lines in this file — those services are
  called via raw `requests`/`curl`, not dedicated SDKs. The corrected diff for this fork:
  - **Remove**: `requests` (only consumer was `tools/transcribe.py`, which is on the
    §2 delete list), `Pillow` (only consumer was `tools/gen_thumbnail.py`, also
    deleted), `google-genai` (same file, deleted).
  - **Keep unconditionally**: `google-api-python-client`, `google-auth`,
    `google-auth-oauthlib`, `google-auth-httplib2` — all four are needed by
    `tools/yt_upload.py` → `apps/worker/publishers/youtube.py` (verified via its lazy
    imports: `google.auth.transport.requests`, `google.oauth2.credentials`,
    `google_auth_oauthlib.flow`, `googleapiclient.discovery/errors/http`).
  - **Do not add** `ffmpeg-python`, `numpy`, or `onnxruntime` despite §5's "keep"
    comment listing them — none of the kept ffmpeg-layer tools (`cutlib`,
    `render_cuts`, `verify_cut`, `bake`, `mix_sfx`, `mix_music`) import them; all of
    them shell out to the `ffmpeg`/`ffprobe` binaries via `subprocess`. RNNoise
    denoising in `clean_voice.py` runs through ffmpeg's native `arnndn` filter with the
    `.rnnn` model files in `tools/models/rnnoise/` — no Python ML runtime is involved.
  - **Add** (from §5, verified as genuinely new for the agent/worker stack):
    `faster-whisper`, `openai-agents`, `litellm`, `fastapi`, `uvicorn[standard]`,
    `apscheduler`, `sqlalchemy`, `psycopg[binary]`, `pgvector`, `boto3`, `httpx`,
    `pydantic-settings`.
- **Rationale**: `docs/repo-harvest.md` §5's diff was written generically against an
  assumed baseline (its own comment block even says "keep: ffmpeg-python, numpy,
  pillow, ..." as if they were already present) rather than this fork's actual file.
  Applying its diff literally would try to remove lines that don't exist and would
  leave three now-orphaned packages (`requests`, `Pillow`, `google-genai`) installed
  for no reason.
- **Alternatives considered**: Applying §5's diff text verbatim and accepting the
  drift — rejected; it directly contradicts spec FR-010 (retain what kept tools need)
  and SC-004 (zero unrelated dependency drift) by leaving unused packages in place.

## Decision 5 — `media/library/catalog.json` is protected alongside the sub-catalogs

- **Decision**: In addition to `media/library/sfx/catalog.json` and
  `media/library/music/catalog.json` (explicitly protected by `docs/repo-harvest.md`
  §2's "do not delete" note), also protect the top-level `media/library/catalog.json`.
- **Rationale**: Verified it exists and sits at the same protected root
  (`media/library/`) as the two libraries the doc explicitly calls out; nothing in §2's
  delete list touches `media/library/` directly (only `media/library/faces/` and
  `media/projects/*` are targeted), so this file falls outside the delete list by the
  doc's own boundary — this decision just makes that explicit so a future `rm -rf
  media/library/*`-style shortcut doesn't sweep it up by accident.
- **Alternatives considered**: None — this is a boundary clarification, not a
  trade-off.

## Decision 6 — Constitution gate: no project constitution ratified yet

- **Decision**: `.specify/memory/constitution.md` is still the unfilled template
  (every field is a `[PLACEHOLDER]`). Treat the Constitution Check gate as
  **not applicable / non-blocking** for this feature, and fall back to the default
  engineering discipline already stated in the project's `CLAUDE.md` ("Default
  policies": smallest viable diff, no unrelated refactors, cite existing code
  precisely, don't invent APIs/data).
- **Rationale**: There is nothing ratified to check compliance against. Blocking this
  plan on a constitution that doesn't exist yet would stall Week 1 for a governance
  step nobody has asked for.
- **Alternatives considered**: Blocking until `/sp.constitution` is run — rejected as
  disproportionate for a repo-restructuring feature with no runtime architecture
  decisions of the kind a constitution usually governs; can revisit once the project
  has enough history to ratify real principles.

## Decision 7 — The specific import that breaks after the `tools/media/` move

- **Decision**: `tools/render_cuts.py` and `tools/verify_cut.py` each do a bare sibling
  import — `from cutlib import AudioProbe, active_keeps, load_words, plan_clip` — which
  only resolves when the file is run directly as a script (Python adds the script's own
  directory to `sys.path`). Once these files are imported as part of the `tools.media`
  package (as FR-008's verification step does), that bare import fails. Fix both to
  `from tools.media.cutlib import ...` (or a package-relative `from .cutlib import
  ...`, consistent with however `tools/__init__.py` / `tools/media/__init__.py` end up
  structured).
- **Rationale**: Verified via direct inspection of both files' import lines.
  `cutlib.py` itself only imports stdlib (`array`, `json`, `math`, `wave`,
  `pathlib`), and `clean_voice.py`, `bake.py`, `mix_sfx.py`, `mix_music.py` don't
  import `cutlib` at all — so this is the one break `docs/repo-harvest.md` §8 warns
  about ("moving them into `tools/media/` will break at least one import"), now
  identified precisely instead of left as a discover-it-later problem.
- **Alternatives considered**: Leaving both tools runnable only as standalone scripts
  (never importable as a package) — rejected; FR-008's own verification command
  requires `tools.media.*` to be import-safe, and `apps/worker` will need to import
  these as a package in later weeks, not shell out to them as scripts.

## Summary of resolved unknowns

| # | Topic | Resolution |
|---|---|---|
| 1 | Composition review without Studio | Use `gen-registry.mjs` manifest / per-file `compositionConfig` id as the static-listing fallback |
| 2 | `remotion/src/lib/` delete paths | Files (`browser.tsx`, `vscode.tsx`, `screencast.tsx`), not directories |
| 3 | "Empty" delete targets | Delete `videos/` and `media/library/faces/` in full, including their READMEs |
| 4 | `requirements.txt` diff | Recomputed from the actual current file (see Decision 4) — supersedes §5's literal text |
| 5 | Extra protected file | `media/library/catalog.json` is also protected, not just the two sub-catalogs |
| 6 | Constitution gate | Not applicable — no ratified constitution exists yet |
| 7 | The import that breaks | `render_cuts.py` and `verify_cut.py`'s bare `from cutlib import ...` must become a package-qualified import |
