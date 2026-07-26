# GitHub Actions: Build → GHCR → Dokploy

## Workflow structure

Two separate jobs in a single file:

- **`build`** — runs on every push to `master` AND `release`. Validates the Docker build on every commit, pushes `:latest` + `:<sha>`-tagged images to GHCR.
- **`deploy`** — runs only when `github.ref == refs/heads/release` (or via manual `workflow_dispatch`). Triggers the Dokploy webhook to pull the new image. Only runs after `build` succeeds (`needs: build`).

This split matters:
- Build failures are distinct from deploy failures in the Actions UI
- Broken images can't reach Dokploy — the deploy job never runs if `build` fails
- Every `master` push validates the Docker build without triggering a deploy

## Full workflow

```yaml
# .github/workflows/deploy.yml
name: Build and deploy

# master is production — every push builds and deploys.
# workflow_dispatch for manual re-deploys without a code change.
on:
  push:
    branches: [master]
  workflow_dispatch:

env:
  # GHCR requires lowercase — github.repository_owner preserves case, so hardcode it.
  IMAGE: ghcr.io/your-github-username-lowercase/your-app-name

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write       # allows pushing to GHCR with GITHUB_TOKEN
    outputs:
      sha: ${{ github.sha }}
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}   # built-in; no extra secret needed

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          # MUST match the VPS CPU architecture.
          # CX33 is Intel (x86_64) → linux/amd64.
          # Using linux/arm64 on an Intel VPS = image won't run.
          # Also, onnxruntime-node and sharp are arch-specific native binaries.
          platforms: linux/amd64
          tags: |
            ${{ env.IMAGE }}:latest
            ${{ env.IMAGE }}:${{ github.sha }}
          # GHA layer cache — dramatically faster rebuilds
          cache-from: type=gha
          cache-to: type=gha,mode=max
          # NEXT_PUBLIC_* must be present at build time (inlined into client bundle).
          # Server secrets are NOT here; set them in Dokploy's env panel.
          # Add one line per NEXT_PUBLIC_* var in your project.
          build-args: |
            NEXT_PUBLIC_APP_URL=${{ secrets.NEXT_PUBLIC_APP_URL }}
            # NEXT_PUBLIC_PORTAL_URL=${{ secrets.NEXT_PUBLIC_PORTAL_URL }}
            # NEXT_PUBLIC_GA_MEASUREMENT_ID=${{ secrets.NEXT_PUBLIC_GA_MEASUREMENT_ID }}
            # ... add all your NEXT_PUBLIC_* vars here

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      # Tell Dokploy to pull the new image and redeploy.
      # Uses -fsSL: fail on HTTP error, silent on progress, follow redirects.
      - name: Trigger Dokploy deploy
        run: |
          curl -fsSL -X POST "${{ secrets.DOKPLOY_URL }}/api/application.deploy" \
            -H "x-api-key: ${{ secrets.DOKPLOY_API_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{"applicationId":"${{ secrets.DOKPLOY_APP_ID }}"}'
```

## Required GitHub secrets

| Secret | Value / source |
|---|---|
| `NEXT_PUBLIC_*` (one per var) | Your project's public env vars — set to production values. Run `grep -r "NEXT_PUBLIC_" .env.example \| cut -d= -f1` to list them all. |
| `DOKPLOY_URL` | `https://deploy.yourdomain.com` |
| `DOKPLOY_API_KEY` | Dokploy → API keys (scoped per-org, with expiry ~90d) |
| `DOKPLOY_APP_ID` | Application detail page in Dokploy panel |
| `GITHUB_TOKEN` | Automatic — just ensure `packages: write` permission is set in the `build` job |

## Chicken-and-egg ordering

The three `DOKPLOY_*` secrets can't exist until the panel is live and the app is created.
Set them **last**, right before the first push to `master` that should deploy:

1. Provision VPS → install Dokploy → put panel on a domain
2. Create the app in Dokploy → grab the Application ID
3. Create a scoped API key in Dokploy → grab the key
4. Add the three `DOKPLOY_*` secrets to GitHub
5. Set all `NEXT_PUBLIC_*` secrets
6. `git push origin master`

**Before secrets are set:** temporarily comment out the `deploy` job in the workflow, push to validate the Docker build, then uncomment and add the secrets.

## Private GHCR image — Dokploy pull credentials

If the GHCR image is private, Dokploy needs credentials to pull it:
- Go to Docker registry settings in Dokploy → add GHCR registry
- Username: your GitHub username
- Password: GitHub Personal Access Token (classic) with `read:packages` scope

Public repos: GHCR images are public by default — no pull credentials needed.

## Branch strategy

```
master  ──► GitHub Actions: build job → deploy job
         ──► Dokploy pulls new image and restarts container (production VPS)
```

When Dokploy is connected to `origin`, `master` is production. Every push deploys.
No `release` branch needed — that pattern was for Netlify (separate remote).

If you want a staging gate, add a `staging` branch (build-only, no deploy job) and keep `master` as the deploy trigger. Most single-VPS projects don't need this.

## Manual deploy (workflow_dispatch)

From GitHub Actions UI → "Run workflow". Useful for:
- Re-triggering a deploy without a code change (e.g. if Dokploy missed the webhook)
- Redeploying after a rollback to push a known-good image
