---
name: vps-dokploy-nextjs
description: |
  Deploys a Next.js application (with optional local ONNX embeddings) to a Hetzner VPS
  using Dokploy as the deployment panel, GitHub Actions for off-box Docker builds, GHCR
  as the image registry, and Cloudflare as the CDN/TLS layer. Covers full VPS bootstrap,
  security hardening, Dockerfile patterns, CI/CD wiring, Cloudflare SSL gotchas, and
  ONNX embedding provider switching. This skill should be used when setting up or
  debugging VPS-based self-hosted deployments for Next.js apps, or when migrating from
  serverless (Vercel/Netlify) to a persistent long-running Docker container on a VPS.
---

# VPS + Dokploy + Next.js Skill

## What this skill does NOT do

- On-box Docker builds (always build in CI — never on the VPS itself)
- Kubernetes / Docker Swarm / multi-node orchestration
- Multi-region or load-balanced VPS setups
- Database hosting on the VPS (use managed Neon/Supabase/PlanetScale)
- Vercel or Netlify deployments (separate workflow, no Docker involved)
- Local ONNX embeddings on serverless functions (ONNX requires a long-running process)

## Deployment shape

```
push to master ──► GitHub Actions
                     build job
                       ├─ docker build --platform linux/amd64
                       └─ push :latest + :<sha> to GHCR
                     deploy job (needs: build)
                       └─ POST /api/application.deploy → Dokploy
                                      │
                                      ▼
                       Hetzner VPS (Dokploy + Traefik)
                       pulls image from GHCR, runs container
                       Traefik terminates TLS, serves 3 domains
                                      │
                       Cloudflare (orange cloud) ──► domains
```

Build and deploy on every master push. The VPS only pulls and runs — no on-box builds.
The two-job split means build failures are distinct from deploy failures in the Actions UI.

## Before implementation — gather context

| Source | What to check |
|---|---|
| `next.config.ts` | Does `output: 'standalone'` exist? Is it gated on `DOCKER_BUILD`? |
| `package.json` | Is `@huggingface/transformers` in deps? Any npm workspaces? |
| `Dockerfile` | Node version (must be 22+), stages, NEXT_PUBLIC_* ARGs |
| `.github/workflows/` | Does `deploy.yml` exist and trigger on `release`? |
| `.env.example` | Which vars are `NEXT_PUBLIC_*` (build-time) vs server-only (runtime)? |
| Hetzner console | Is the CX33 (Intel, 8 GB) provisioned? Is the SSH key added? |
| Dokploy panel | Is the app created? What is the Application ID? |
| GitHub repo | Are all required secrets set? (See §CI secrets below) |

## Required clarifications

Answer these before starting — each changes the path significantly:

1. **ONNX embeddings needed?** If yes, add `@huggingface/transformers` to deps and follow
   `references/onnx-embeddings.md`. If no, skip the ONNX sections and set
   `EMBEDDING_PROVIDER` to your API provider (e.g. `jina`); omit the native module COPY
   lines from the runner stage.

2. **npm workspaces?** List all workspace names (e.g. `embed`, `packages/ui`). The deps
   stage needs one `COPY <workspace>/package.json ./<workspace>/package.json` line per
   workspace, or `npm ci` will fail with a resolution error.

3. **VPS state** — Is the CX33 already provisioned and bootstrapped, or starting from
   scratch? If bootstrapped, skip to step 3 (Next.js config).

4. **GHCR image visibility** — Is the GitHub repo public or private? Public = GHCR images
   are public too, no pull credentials needed in Dokploy. Private = set up a GitHub PAT
   with `read:packages` in Dokploy's Docker registry settings.

5. **Custom NEXT_PUBLIC_* vars** — List every `NEXT_PUBLIC_` env var in your project.
   Each needs a matching `ARG`/`ENV` pair in the builder stage and a `build-args` entry in
   the CI workflow.

## Step-by-step workflow

1. **Provision VPS** — See `references/vps-bootstrap.md`
   - Hetzner CX33 (Intel, 4 vCPU, 8 GB) + Ubuntu 24.04
   - Add SSH key at creation time; never use password auth
   - Add swap: 4 GB

2. **Bootstrap server** — See `references/vps-bootstrap.md`
   - `apt update && apt upgrade`, create non-root user, copy SSH key
   - UFW (defence-in-depth only — read the Docker-bypasses-UFW warning)
   - Set Hetzner Cloud Firewall as the real gate
   - Install Dokploy **as root** (not sudo)
   - Put panel on `deploy.yourdomain.com`, issue cert, close port 3000

3. **Next.js config** — See `references/dockerfile-patterns.md`
   - `output: process.env.DOCKER_BUILD ? 'standalone' : undefined`
   - `serverExternalPackages: ['@huggingface/transformers', 'onnxruntime-node']`

4. **Dockerfile** — See `references/dockerfile-patterns.md`
   - Node 22-slim base (ONNX requires ≥22.22)
   - 3 stages: deps / builder / runner
   - Copy workspace `package.json` files before `npm ci`
   - `DOCKER_BUILD=1`, 9 × `NEXT_PUBLIC_*` ARG→ENV in builder
   - Run `build:embed` then `build`
   - Explicit COPY of native packages in runner
   - `USER node`, `HOSTNAME=0.0.0.0`

5. **GitHub Actions** — See `references/github-actions.md`
   - Two jobs: `build` → `deploy` (`needs: build`), both triggered on every `master` push
   - `master` is production — no `release` branch needed (that was the Netlify pattern)
   - GHCR login via built-in `GITHUB_TOKEN` (no extra secret needed)
   - `platforms: linux/amd64` (must match Intel CX33 — never arm64)
   - GHA layer cache (`cache-from/to: type=gha`) for fast rebuilds
   - Chicken-and-egg: set `DOKPLOY_*` secrets last, after the app is created in the panel

6. **Cloudflare + SSL** — See `references/cloudflare-ssl.md`
   - SSL mode: **Full (Strict)** — never Flexible (causes redirect loops with Traefik)
   - Grey-cloud each record during cert issuance, then orange-cloud
   - Add CF Config Rule for `/.well-known/acme-challenge/*` for durable renewals
   - Bypass `/api/*` cache (SSE streaming); hard-cache `/embed.js`

7. **Create app in Dokploy**
   - **Provider: "Docker"** (NOT Github/Gitlab/Bitbucket/Git — those rebuild from source and skip the GHCR image)
   - Image: `ghcr.io/yourname/app:latest`, registry: `ghcr.io`, username + PAT for private repos
   - 3 domains on same app (Traefik routes by host header; proxy.ts handles in-process)
   - Health check path, resource limits (CPU/RAM caps)
   - Runtime env vars: paste server secrets + `EMBEDDING_PROVIDER=onnx`

8. **Security hardening** — Do this BEFORE real DNS cutover
   - See `references/security-hardening.md`
   - SSH drop-in, fail2ban, Dokploy 2FA, scoped API token with expiry
   - Hetzner Cloud Firewall: only 22/80/443 inbound

## ONNX embeddings

See `references/onnx-embeddings.md` for the full provider-switch pattern. Summary:

- `EMBEDDING_PROVIDER=onnx` on VPS; `jina` everywhere else (serverless can't load ONNX)
- Model: `Xenova/bge-base-en-v1.5` (768-dim, matches existing vector schema — no migration)
- Mount a Docker volume at `TRANSFORMERS_CACHE` so the 110 MB model survives restarts

## CI secrets reference

| Secret | Where it comes from |
|---|---|
| `NEXT_PUBLIC_APP_URL` … (×9) | Match production values |
| `DOKPLOY_URL` | `https://deploy.yourdomain.com` |
| `DOKPLOY_API_KEY` | Dokploy → API keys (scoped, expiring) |
| `DOKPLOY_APP_ID` | Application detail page in Dokploy |
| `GITHUB_TOKEN` | Automatic (for GHCR push — set `packages: write`) |

## Common pitfalls quick-ref

> **⚡ First step when debugging:** Always verify the Critical Cloudflare Settings in `references/cloudflare-ssl.md` before assuming a server issue. Most "it works locally but not in production" problems are Cloudflare misconfigurations.

See `references/pitfalls.md` for full detail. The big ones:

| Symptom | Root cause |
|---|---|
| `node server.js` fails at startup | `output: 'standalone'` not set, or three runner COPY lines missing |
| Port 3000 open despite UFW deny | Docker bypasses UFW — use Hetzner Cloud Firewall |
| LE cert fails to issue | Record is orange-clouded; grey-cloud first, then orange |
| Redirect loop (ERR_TOO_MANY_REDIRECTS) | Cloudflare SSL set to Flexible, not Full (Strict) |
| ONNX `Cannot find module` at runtime | Native modules not copied explicitly in runner stage |
| EBADENGINE at npm install | Node base is 20-slim; ONNX v4 needs ≥22 |
| `NEXT_PUBLIC_*` is `undefined` in browser | Not passed as build-arg during `next build` |
| Sanity/blog shows "not configured" | Dokploy Provider is "Github" instead of "Docker" — rebuilds from source, skips GHCR (P26) |
| `npm ci` fails with workspace error | `embed/package.json` not copied before `npm ci` |
| SSH locked out after hardening | Edited `sshd_config` directly; Ubuntu `50-cloud-init.conf` overrides it |
| Dokploy install fails | Ran as `sudo`, not as root — must run the installer as root |
| `ERR_CONNECTION_CLOSED` on subdomains (intermittent) | Cloudflare edge TLS handshake timeout — see `references/cloudflare-ssl.md` §ERR_CONNECTION_CLOSED |
| Stale content after deploy | Browser Cache TTL set to fixed value instead of "Respect Existing Headers" — see `references/cloudflare-ssl.md` §Critical Settings |

## Deployment checklist

Run through this before calling the deployment done:

```
VPS & security
  □ SSH key-only auth, root login off, password auth off (99-hardening.conf drop-in)
  □ fail2ban running, unattended-upgrades enabled
  □ Hetzner Cloud Firewall: only 22/80/443 inbound, 3000 removed
  □ Dokploy 2FA enabled, scoped API token created with expiry

Build & image
  □ npm run build exits 0 locally (full next build, not just tsc)
  □ Dockerfile Node version = 22-slim or higher
  □ EMBEDDING_PROVIDER set in runner ENV (or in Dokploy env if not ONNX)
  □ GitHub secrets set: all NEXT_PUBLIC_* + DOKPLOY_URL/API_KEY/APP_ID

Domains & SSL
  □ DNS records grey-clouded before adding domains to Dokploy
  □ Let's Encrypt certs issued (Dokploy shows green) before orange-clouding
  □ Cloudflare SSL mode = Full (Strict)
  □ /api/* cache bypassed in Cloudflare, /embed.js cached hard
  □ CF Config Rule for /.well-known/acme-challenge/* (durable renewals)
  □ Browser Cache TTL = "Respect Existing Headers" (Caching → Configuration)

App in Dokploy
  □ Provider is "Docker" (NOT Github/Git — those rebuild from source and skip GHCR)
  □ 3 domains added (or however many the app serves), correct container port
  □ Health check route configured
  □ Resource limits (CPU/RAM) set
  □ All server-only secrets set in Dokploy env (not baked into image)
  □ ONNX model cache volume mounted at TRANSFORMERS_CACHE path

Smoke test (before full DNS cutover)
  □ Auth login works
  □ Chat stream works (SSE, not buffered)
  □ Embed widget loads on a test page
  □ Lead capture fires email
  □ Portal login works
  □ Document upload + retrieval works (if ONNX path)
  □ http://<vps-ip>:3000 no longer responds (port closed)
```

## References

| File | Topic |
|---|---|
| `references/vps-bootstrap.md` | Full server bootstrap + Dokploy install |
| `references/dockerfile-patterns.md` | Multi-stage Dockerfile + next.config.ts patterns |
| `references/github-actions.md` | Full workflow, platform pinning, API trigger |
| `references/cloudflare-ssl.md` | SSL mode, LE gotcha, cache rules |
| `references/security-hardening.md` | SSH, firewall, Dokploy panel, data safety |
| `references/onnx-embeddings.md` | Provider switch, model choice, cache volume |
| `references/pitfalls.md` | Full pitfall list with fixes |
| `references/official-docs.md` | Official docs URLs for all tools in this stack |
