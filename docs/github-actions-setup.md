# GitHub Actions Setup — Render Workflow

`.github/workflows/render-video.yml` renders a Remotion composition on a
GitHub-hosted `ubuntu-latest` runner (7 GB RAM — more than the VPS has to
spare), uploads the result to Cloudflare R2, and calls the worker back so the
post can move into the review queue. It never runs automatically — only
`apps/worker/jobs/dispatch_render.py` triggers it, via the GitHub REST API's
`workflow_dispatch` endpoint.

## Required repository secrets

Add these under **Settings → Secrets and variables → Actions → New repository
secret** in the GitHub repo:

| Secret | Value |
|---|---|
| `R2_ACCESS_KEY_ID` | The R2 API token's access key ID |
| `R2_SECRET_ACCESS_KEY` | The R2 API token's secret access key |
| `R2_ACCOUNT_ID` | Your Cloudflare account ID — used to build the R2 endpoint URL (`https://<account_id>.r2.cloudflarestorage.com`) |
| `R2_BUCKET` | The R2 bucket name renders get uploaded to |
| `CALLBACK_URL` | `https://<your dashboard's public domain>/api/render-complete` — **not** the worker directly. The worker has no public port at all (internal-only, Dokploy Docker network) and the GitHub-hosted runner can't reach it. `apps/dashboard/app/api/render-complete/route.ts` is a public proxy that forwards the callback to the worker's real `/api/render-complete` over the internal network — it exists specifically because the worker itself is unreachable from outside Dokploy's network |
| `RENDER_INTERNAL_SECRET` | The same shared secret the worker already uses for its other internal endpoints (`RENDER_INTERNAL_SECRET` in `apps/worker/config.py`) — sent as the `x-render-secret` header so the worker can verify the callback actually came from this workflow |

**Note**: `R2_ACCOUNT_ID`, `R2_BUCKET`, and `RENDER_INTERNAL_SECRET` already
exist as **worker** environment variables (`apps/worker/config.py`). These are
separate copies as **GitHub repository secrets** because a GitHub-hosted
runner has no access to the worker's `.env` file — the two must be kept in
sync by hand whenever a value is rotated (see `docs/client-provisioning.md`'s
secret-rotation table).

## Why the render dispatch works the way it does

- **`props` is written to a file, not interpolated into the render command.**
  A `workflow_dispatch` input is technically untrusted (anyone with write
  access to trigger workflows can supply it), and GitHub explicitly documents
  that interpolating an input directly into a `run:` shell block is a
  script-injection risk. The workflow writes `${{ inputs.props }}` to
  `input-props.json` via an `env:` variable first, then passes
  `--props=./input-props.json` to `remotion render` — Remotion's own
  documented pattern for exactly this scenario.
- **`aws s3 cp` needs two things a plain AWS CLI setup doesn't default to**:
  `AWS_DEFAULT_REGION=auto` (R2 has no real AWS regions) and
  `--endpoint-url https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com` on the
  upload command. Without both, the CLI will try to talk to real AWS S3
  instead of R2.
- **The callback fires on `if: always()`**, not only on success — a failed
  render still needs to notify the worker (with `status: "failure"`) so the
  post doesn't sit invisibly forever waiting for a callback that will never
  arrive (FR-004).

## Verifying it works

Dispatch a test run manually (`Actions` tab → `Render video` → `Run workflow`,
or `gh workflow run render-video.yml -f composition_id=HeroReveal -f
props='{"imageUrl":"https://picsum.photos/1080/1920","headline":"Test"}' -f
output_key=renders/test.mp4`) and confirm: the MP4 lands in the R2 bucket at
the given key, and the worker's `/api/render-complete` endpoint receives the
callback (check `audit_log` for a `dispatch_render`/`render_complete` row).
