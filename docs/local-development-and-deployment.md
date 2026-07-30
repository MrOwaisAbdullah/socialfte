# Local Development & Deployment

How to run SocialFTE on your own machine, and how it actually gets deployed. Written from
what's real in this repo today (`infra/`, `.github/workflows/`, both apps' actual startup
commands) — not from the original spec's aspirations. For onboarding a **new client** onto
an already-running deployment, see `docs/client-provisioning.md` instead; this document is
about running/deploying the product itself.

## 1. Prerequisites

- **Node.js 22+** (dashboard) and **Python 3.12+** (worker)
- **ffmpeg + ffprobe on `PATH`** — required by `apps/worker/jobs/process_footage.py` and
  every script in `tools/media/`. Not bundled; install via your OS package manager
  (`apt install ffmpeg`, `brew install ffmpeg`) or a static build if you don't have root.
- A **Neon Postgres** database with the `vector` extension enabled
- A **Cloudflare R2** bucket
- An **OpenRouter** API key (LLM gateway — captions, vision tagging, cover-frame scoring)
- A **Discord bot** (or WhatsApp/Telegram) for the approval workflow — optional for basic
  local development, required to actually test the approve/reject/cover-frame-picker flow

## 2. Clone and install

```bash
git clone <this-repo>
cd SocialFTE

# Dashboard (Next.js)
cd apps/dashboard
npm install

# Worker (Python)
cd ../worker
python -m venv venv
# Linux/macOS:
source venv/bin/activate
# Windows:
venv\Scripts\activate
pip install -r requirements.txt
```

## 3. Environment variables

**Two separate `.env` files** — the dashboard and worker are two independent processes
(even in local dev) and each reads its own env file. There is no automatic sharing between
them; a value set in one is invisible to the other.

| File | Copy from | Used by |
|---|---|---|
| `apps/dashboard/.env.local` | `apps/dashboard/.env.example` | `npm run dev` (Next.js reads `.env.local` automatically) |
| `apps/worker/.env` | `apps/worker/.env.example` | `pydantic-settings` (`config.py`'s `env_file` setting) |

(The root `.env.example` also exists as the canonical, fully-commented reference for every
variable either app reads — `apps/worker/.env.example` mirrors it.)

**The variables that matter most for both files to actually agree** (a real gap found
while verifying this repo's own setup — `DATABASE_URL`/`R2_*` had drifted between the two
`.env` files, since they were filled in at different times by different people/sessions):

- `DATABASE_URL` — **must point at the same Neon database** for both dashboard and worker.
  They share one schema (`apps/worker/db/schema.sql` is the source of truth; Drizzle's
  `schema.ts` mirrors it) — pointing them at different databases silently breaks
  everything downstream (the dashboard's Calendar screen would show nothing, the worker's
  jobs would process nothing).
- `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` /
  `R2_ENDPOINT` / `R2_PUBLIC_URL` — same bucket, both sides.
- `RENDER_INTERNAL_SECRET` — must be the **identical string** in both files; it's how the
  worker authenticates its calls to the dashboard's `/api/internal/*` routes and how the
  dashboard verifies `/api/render-complete` callbacks.

**Neon-specific gotcha**: if your `DATABASE_URL` includes `?sslmode=require` (Neon's
default connection-string format), that's a libpq/psycopg convention `asyncpg` doesn't
understand as a URL parameter — `apps/worker/db/session.py` already strips it and
translates it into asyncpg's own `ssl` connect arg, so you don't need to edit the URL
yourself. This only matters if you're writing new code that connects to Postgres directly
without going through `db/session.py`.

## 4. Database schema

```bash
cd apps/dashboard
# PowerShell:
$env:DATABASE_URL = "postgresql://..."
npx drizzle-kit push
# bash/zsh:
DATABASE_URL="postgresql://..." npx drizzle-kit push
```

**Enable the `vector` extension in Neon before running this** — `drizzle-kit push` fails
outright if `pgvector` isn't enabled first (Neon console → your project → the SQL editor →
`CREATE EXTENSION IF NOT EXISTS vector;`).

This creates all 9 tables (`templates`, `assets`, `posts`, `metrics`, `audit_log`,
`credentials`, `brand_config`, `job_runs`, `job_schedules`), every index, and the
`caption_vec` pgvector column. Re-run it any time `schema.sql`/`schema.ts` changes — it's
additive/idempotent for new columns, not destructive. The last three tables were added
post-launch (brand config persistence + Jobs page run-tracking/scheduling — see
`docs/how-it-works.md`'s "Operational fixes and Jobs management" section) — if the `/setup`
wizard fails to save or the Jobs page can't show run status/schedule edits, re-run this first
to confirm those tables actually exist on the target database.

`templates` needs at least one row before `compose_batch` can produce anything — the worker
seeds the 6 default templates automatically on startup if the table is empty
(`main.py`'s `_seed_templates()`), so this is normally a non-issue, but if you ever see
"No candidate asset+template pairs found" in the worker logs despite having uploaded assets,
check `SELECT count(*) FROM templates` first.

## 5. Run it

```bash
# Terminal 1 — dashboard
cd apps/dashboard
npm run dev
# -> http://localhost:3000

# Terminal 2 — worker (FastAPI + APScheduler, same process runs both)
cd apps/worker
source venv/bin/activate  # or venv\Scripts\activate on Windows
python main.py
# -> http://localhost:8000 (internal-only in production; fine to browse locally)
```

`apps/worker/main.py`'s `__main__` block calls `uvicorn.run(...)` directly, so `python
main.py` and `uvicorn main:app --reload` do the same thing — the Dockerfile uses the
`uvicorn` form (`CMD ["python", "-m", "uvicorn", "main:app", ...]`) for production.

Log in to the dashboard with the password you set as `SESSION_SECRET` — there's no
separate login form password, `apps/dashboard/lib/session.ts`'s `verifyPassword()` checks
the literal `SESSION_SECRET` value itself.

### One-time setup: BOOTSTRAP wizard

Before the worker's scheduled jobs have anything meaningful to do, run the guided setup
wizard once to collect brand identity, connect platforms, and configure notifications:

```bash
cd apps/worker
python -m worker bootstrap
```

This is interactive (prompts for each answer) and resumable — killing it and re-running
skips whatever's already been answered. It writes `SOUL.md`, `BRAND.md`, `HEARTBEAT.md`,
`IDENTITY.md` at the repo root, and only writes `BOOTSTRAP.md` (the "setup verified
complete" marker) once its 4 final checks — LLM call, render, notification, database —
all pass. Re-running it after `BOOTSTRAP.md` exists refuses immediately (by design).

**This CLI wizard is local-only** — it writes to files on disk (repo root by default), which
a deployed worker container doesn't have (no shared filesystem with the dashboard, no repo
root copied in). Brand colors/name/tagline collected here only go into `BRAND.md`, a doc
nothing reads at runtime. For a **live deployment**'s actual brand config (colors, logo,
social handle — what `compose_batch` and every render actually use), use the dashboard's
`/setup` page instead — it persists to a `brand_config` DB row both the dashboard and worker
read. See `docs/how-it-works.md`'s BOOTSTRAP section for the full picture of which wizard
does what.

To simulate a second client's setup in isolation without touching the first client's
files (see `docs/client-provisioning.md`), pass `--env=<path-to-a-.env-file>` — its parent
directory becomes the target root instead of the real repo root.

### Optional: render preview

`apps/dashboard/app/render-preview` is a bare (no dashboard chrome) page Puppeteer
navigates to internally when rendering a template screenshot. You generally don't need to
open it yourself, but it's useful for debugging a template's HTML/CSS directly in a
browser.

### Optional: Remotion Studio

`packages/remotion/` has its own compositions (video templates) for local preview:

```bash
cd packages/remotion
npm install
npm run studio
```

If this hangs with no output on your machine, it's a known issue with Remotion CLI's
interactive UI failing outside a real terminal (seen in sandboxed/CI-like environments).
The programmatic API works as a fallback — see `packages/remotion/scripts/render-all.mjs`
for the pattern (`bundle()` + `renderStill()`/`renderMedia()` from `@remotion/bundler` /
`@remotion/renderer`, which bypasses the CLI's UI entirely):

```bash
node scripts/gen-registry.mjs   # discovers compositions
node scripts/render-all.mjs --still   # renders a poster PNG per shot to out/
```

## 6. Running the test suite

```bash
cd apps/worker
python -m pytest tests/ -q
```

Dashboard type-checking:

```bash
cd apps/dashboard
npm run typecheck
```

There's no dashboard test suite yet (plan.md notes this explicitly) — typecheck plus
manual verification in a browser is the current bar for dashboard changes.

---

## 7. Deployment

The product deploys as two Docker services (`yl-dashboard`, `yl-worker`) onto an existing
Dokploy-managed VPS, alongside whatever else that VPS already runs. Nothing here is
client-specific — see `docs/client-provisioning.md` for turning this into a *new* client's
own services/database/bucket.

### Architecture

```
push to master ──► .github/workflows/deploy.yml
                      build job: docker build (infra/Dockerfile.dashboard, infra/Dockerfile.worker)
                                 → push both to ghcr.io
                      deploy job: POST /api/application.deploy → Dokploy (dashboard)
                                  POST /api/application.deploy → Dokploy (worker)
                                         │
                                         ▼
                          Hetzner VPS (Dokploy + Traefik)
                          pulls the new images, restarts both containers
                          Traefik terminates TLS, routes the dashboard by domain
                                         │
                          Cloudflare (orange-clouded) ──► your domain
```

`infra/docker-compose.yml` defines both `yl-dashboard` and `yl-worker` as services on the
same Docker network, each with an explicit `mem_limit` (never let one runaway job — e.g. an
ffmpeg spike — starve whatever else is running on that VPS) and a healthcheck. The worker
has **no exposed port** — it's internal-only, reached by the dashboard over the Docker
network via `WORKER_INTERNAL_URL`, and reaches the dashboard back via `RENDER_INTERNAL_URL`.

`deploy.yml` builds and deploys **both** images: `build` pushes `socialfte-dashboard` and
`socialfte-worker` to GHCR, then `deploy` triggers a Dokploy redeploy for each application in
turn (`DOKPLOY_APP_ID_DASHBOARD`, `DOKPLOY_APP_ID_WORKER` — two separate app IDs, one shared
URL/API key).

### One-time Dokploy setup

1. Create the `yl-dashboard` application in Dokploy, pointed at the GHCR image
   (`ghcr.io/<you>/socialfte-dashboard`) — **not** a "Git" provider, which would rebuild
   from source and skip the pre-built image entirely.
2. Set every environment variable from `.env.example` in Dokploy's own env config for that
   application (never bake secrets into the image or commit them).
3. Add the application's domain, let Dokploy/Traefik issue the TLS cert (grey-cloud the DNS
   record in Cloudflare first, then orange-cloud it once the cert is live).
4. Set resource limits matching `docker-compose.yml`'s `mem_limit` if Dokploy manages that
   separately from the compose file.
5. Repeat for `yl-worker`, minus the domain/TLS step (it has no public port) — pointed at
   `ghcr.io/<you>/socialfte-worker`.
6. Note each application's ID from its Dokploy URL/settings — you'll need both for the repo
   secrets below.

**The internal-hostname gotcha** (this cost real debugging time — worth reading before step
2 above): `WORKER_INTERNAL_URL` (set on the dashboard app) and `RENDER_INTERNAL_URL` (set on
the worker app) do **not** use `docker-compose.yml`'s service names (`yl-worker`,
`yl-dashboard`) in a real Dokploy deployment — Dokploy runs each app as its own Docker Swarm
service with a generated internal hostname that includes a random per-deployment suffix.
Confirmed live: the worker app's real hostname was `socialfte-worker-2s66t5`, not
`socialfte-worker` and not `yl-worker`. To find the real value:

1. Open the app's page in Dokploy (worker or dashboard) → the **General** tab shows its name
   directly under the app title (e.g. `socialfte-worker-2s66t5`) — that *is* the hostname.
2. Verify before trusting it: open a terminal on the *other* app (Dokploy's "Open Terminal"
   button) and run `curl http://<that-name>:8000/health` (worker) or
   `curl http://<that-name>:3000/login` (dashboard). A real JSON/HTML response confirms it;
   a connection error means it's the wrong name.
3. Set `WORKER_INTERNAL_URL=http://<worker's real name>:8000` on the **dashboard** app, and
   `RENDER_INTERNAL_URL=http://<dashboard's real name>:3000` on the **worker** app.

Symptoms of getting this wrong: the Jobs page shows "Could not reach worker", and
`compose_batch`'s still-image render calls fail silently (shortfall logged, no error surfaced
to the dashboard).

### GitHub repository secrets required for `deploy.yml`

| Secret | Purpose |
|---|---|
| `DOKPLOY_URL` | Your Dokploy panel's base URL, e.g. `https://dokploy.yourdomain.com` |
| `DOKPLOY_API_KEY` | Dokploy → API keys (scope it, set an expiry) |
| `DOKPLOY_APP_ID_DASHBOARD` | The `yl-dashboard` application's ID in Dokploy |
| `DOKPLOY_APP_ID_WORKER` | The `yl-worker` application's ID in Dokploy |

Set them with `gh secret set <NAME> --repo <you>/socialfte` or via GitHub → repo Settings →
Secrets and variables → Actions. All four are required — if any is missing, the `deploy`
job's `curl` calls resolve to an empty/malformed URL and fail with `curl: (3) URL rejected:
No host part in the URL` (the API key and applicationId end up empty too, but curl fails on
the URL first).

`GITHUB_TOKEN` for the GHCR push is automatic — no extra secret needed, just
`packages: write` permission (already set in the workflow).

### Video rendering's separate CI workflow

`.github/workflows/render-video.yml` is unrelated to the deploy pipeline above — it's
triggered per-post by `apps/worker/jobs/dispatch_render.py`'s `workflow_dispatch` REST
call, not by a `git push`. See `docs/github-actions-setup.md` for the 6 repo secrets it
needs (separate from the 3 above) and how it fits into the video-post lifecycle described
in `docs/how-it-works.md`.

### Manual deploy (without CI)

```bash
# Build (matches what CI does)
docker build -f infra/Dockerfile.dashboard -t yl-dashboard:latest .
docker build -f infra/Dockerfile.worker -t yl-worker:latest .

# Run locally against the compose file (uses infra/.env — never commit it)
cd infra
docker compose up -d
```

## 8. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Dashboard shows old brand name / wrong colors | `BRAND_NAME`/`R2_PUBLIC_URL` not set in `apps/dashboard/.env.local`, or `.next/` cache is stale — restart `npm run dev` |
| Calendar screen is empty despite posts existing | `apps/dashboard/.env.local`'s `DATABASE_URL` points at a different database than the one the worker/BOOTSTRAP wrote to |
| Discord approve/reject buttons silently do nothing | Check `apps/dashboard/proxy.ts`'s matcher excludes `api/webhooks` — a session-gate redirect there returns HTML instead of the JSON Discord expects, and Discord will eventually disable the endpoint |
| `process_footage.py` jobs never seem to run or immediately fail | `ffmpeg`/`ffprobe` not on `PATH` in whatever environment the worker process runs in |
| Worker can't connect to Postgres at all (`Connect call failed ('127.0.0.1', 5432)`) | `DATABASE_URL` isn't set in `apps/worker/.env` — it silently falls back to a localhost placeholder (see `db/session.py`'s comment) rather than crashing on import |
| `drizzle-kit push` fails immediately | The `vector` extension isn't enabled on the Neon database yet — enable it first, then re-run |
| A vision/LLM call fails with a 402 "requires more credits" error | The OpenRouter account is out of credit for the requested token budget — check `apps/worker/brain/vision.py`'s `max_tokens` settings and the account's remaining balance at openrouter.ai/settings/credits |
| Jobs page shows "Could not reach worker" (or vice versa: render/vision calls from the worker fail silently) | `WORKER_INTERNAL_URL`/`RENDER_INTERNAL_URL` set to a hostname that doesn't exist on Dokploy's network — see "The internal-hostname gotcha" above; there is no safe hardcoded default in a real deployment |
| `compose_batch` logs "No candidate asset+template pairs found" despite real uploaded assets | `templates` table is empty — should auto-seed on worker startup (`main.py`'s `_seed_templates()`), but confirm with `SELECT count(*) FROM templates`; if it's an existing deployment from before this fix, either restart the worker or insert the 6 rows manually (slugs must match `apps/dashboard/components/templates/registry.ts` exactly) |
| Worker logs a `Permission denied: '/AGENT_LOG.md'` warning | Expected inside Docker without a volume mount — the write now falls back to `/app/AGENT_LOG.md` automatically (see `audit.py`), so this is a warning, not a failure; the real `audit_log` DB row is written either way |
| `/setup` wizard's "Verify & Finish" doesn't seem to save anything, or `/setup` keeps showing as incomplete after a successful run | `brand_config` table doesn't exist yet — run `drizzle-kit push` (see "Database schema" above) |
| Video posts fail with `Client error '422 Unprocessable Entity'` on `.../actions/workflows/render-video.yml/dispatches` | `RENDER_WORKFLOW_REF` (default `master`) doesn't match a real branch/tag in the repo — GitHub's `workflow_dispatch` API 422s outright on an unknown `ref`. Confirm via `gh repo view <owner>/<repo> --json defaultBranchRef` |
| The dispatch itself succeeds (no 422) but the actual GitHub Actions run fails — R2 upload step errors `Invalid endpoint: https://.r2.cloudflarestorage.com`, or the "Notify the worker" step errors `curl: (3) URL rejected` | The 6 repo secrets `docs/github-actions-setup.md` documents were never set — check with `gh secret list --repo <owner>/<repo>`. `CALLBACK_URL` specifically must be the **dashboard's** public URL + `/api/render-complete` (e.g. `https://social.yourbrand.com/api/render-complete`), never the worker directly — the worker has no public port at all |
| Assets consistently score very low `quality_score` (single digits) despite looking fine, especially with `lighting_ok`/`composition_ok` both true | The vision model is drifting to a 0-10 scale instead of the prompted 0-100 (`skills/asset-tagging.md`) — confirm by checking if `lighting_ok`/`composition_ok` contradict the low score; already-mis-scored rows aren't auto-corrected by `retag_assets` (it only targets `quality_score IS NULL`) — reset the column to `NULL` by hand for any row you want re-scored |
| Captions always come out in plain English even after setting a language in `/setup` | Confirm the `caption_language` column exists (`drizzle-kit push` after this fix) and that `/setup`'s "Verify & Finish" actually ran successfully — `compose_batch.py`'s `_build_brand_tokens()` falls back to `CAPTION_LANGUAGE` (env var) only when the DB row's field is null/empty |
| Still-image posts fail with a 500 from `/api/internal/render`; dashboard logs show `Failed to launch the browser process... chrome_crashpad_handler: --database is required` | Puppeteer's Chrome can't find a writable directory for its crash-handler subprocess (the container's non-root user has no real home dir) — needs `infra/Dockerfile.dashboard`'s `XDG_CONFIG_HOME`/`XDG_CACHE_HOME` fix and a rebuilt image, not just a redeploy of existing code |
| Newly uploaded assets all get tagged with the same generic variant despite visually distinct filenames | `assets.original_filename` column doesn't exist yet — run `drizzle-kit push` (see "Database schema" above); without it, vision tagging never sees the uploader's filename hint at all |
| Dashboard jobs page returns 502, worker logs show `IndentationError` on startup | Dead code placed after a `continue` statement in `apps/worker/jobs/retag_assets.py` — the unreachable block causes a syntax error that crashes the worker before it starts. Fix: remove the duplicate code block after `continue` (the same 404 handling already exists earlier in the `except` block). Symptom: worker never starts, all dashboard→worker calls return 502 |
