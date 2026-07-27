# Environment Variables & Secrets: Week 5 — Motion, Calendar, and Generalise

## New worker env vars (`apps/worker/config.py`)

| Variable | Default | Used by |
|---|---|---|
| `GITHUB_TOKEN` | `""` | `dispatch_render.py` — authenticates the `workflow_dispatch` REST call and the run-status polling |
| `GITHUB_REPO` | `""` (e.g. `owner/socialfte`) | `dispatch_render.py` — which repo to dispatch the render workflow in |
| `RENDER_WORKFLOW_FILE` | `"render-video.yml"` | `dispatch_render.py` — the workflow filename to dispatch |
| `RENDER_POLL_INTERVAL_SECONDS` | `30` | `dispatch_render.py` |
| `RENDER_POLL_MAX_MINUTES` | `15` | `dispatch_render.py` — see research.md's Open Questions: unverified against a real render's actual duration |
| `PROCESS_FOOTAGE_CRON` | `"*/15 * * * *"` | `apps/worker/main.py` — APScheduler trigger for `process_footage.py`, checking for unprocessed clips every 15 minutes |
| `MUSIC_BED_DB` | `-18` | `process_footage.py` — the music-under-voice level from the kickoff (§3), config-driven per FR-016 rather than a literal in code |

## New GitHub repository secrets (NOT worker env vars — set in GitHub, not `.env`)

Documented in full in `docs/github-actions-setup.md` (Phase 2 deliverable);
summarized here for the env-vars contract's completeness:

| Secret | Purpose |
|---|---|
| `R2_ACCESS_KEY_ID` | R2 credential for `aws s3 cp` from the render workflow |
| `R2_SECRET_ACCESS_KEY` | R2 credential (secret half) |
| `R2_ACCOUNT_ID` | Builds the R2 endpoint URL: `https://{account_id}.r2.cloudflarestorage.com` (research.md Decision 5) |
| `R2_BUCKET` | Destination bucket for the rendered MP4 |
| `CALLBACK_URL` | The worker's public `POST /api/render-complete` URL — the GitHub Actions runner has no access to the worker's internal Docker network, so this must be a reachable public (or tunneled) address |
| `RENDER_INTERNAL_SECRET` | Sent as the `x-render-secret` header on the callback — the same shared secret the worker already uses for its other internal endpoints, verifying the callback actually came from this workflow and not an arbitrary caller |

**Note**: `R2_ACCOUNT_ID`, `R2_BUCKET`, and `RENDER_INTERNAL_SECRET` already
exist as worker env vars (`apps/worker/config.py`, Weeks 2–3) — these are
separate copies as GitHub repo secrets because a GitHub-hosted runner cannot
read the worker's `.env` file. Keep all three in sync when rotating credentials
(also called out in `docs/client-provisioning.md`, Phase 8).

## New BOOTSTRAP flag (not an env var — a CLI flag)

| Flag | Purpose |
|---|---|
| `--env=<path>` | `python -m worker bootstrap --env=<path>` — points BOOTSTRAP at an arbitrary env file/output root instead of always the real repo root (Phase 7, required for the second-client simulation to be isolated at all) |
