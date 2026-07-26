---
name: octively-run-and-operate
description: Load this skill when running or operating the Octively production system - deploying to production (git push origin master, GitHub Actions, GHCR, Dokploy on the Hetzner VPS), watching or debugging a deploy, rolling back a bad release, applying schema migrations to the prod Neon DB (MIGRATIONS_ENABLED, /api/internal/migrate, drizzle-kit migrate), setting up or fixing cron jobs (monthly-reset, weekly-digest, CRON_SECRET 401s), Cloudflare DNS/SSL issues (redirect loops, ACME cert failures, SSE buffering), post-deploy smoke testing, or answering "what runs where / if X is down what breaks". Trigger files: .github/workflows/deploy.yml, Dockerfile, docs/production-deployment.md, docs/dokploy-cron-setup.md, docs/smoke-tests.md, app/api/cron/*, app/api/internal/migrate/route.ts.
---

# Octively: Run and Operate Production

Octively is one Next.js 16 app serving four hostnames, running as a single Docker container on one Hetzner VPS, deployed by pushing to `master`. This skill is the operations runbook: deploy, watch, roll back, migrate, cron, DNS, and verify.

Jargon used once and defined here:
- **Dokploy**: the self-hosted deploy panel on the VPS (like a mini Heroku). Panel: `https://deploy.octively.com` (v0.29.8 as of 2026-07-06).
- **GHCR**: GitHub Container Registry, where CI pushes the Docker image.
- **Traefik**: the reverse proxy Dokploy runs (v3); terminates TLS on the box.
- **Orange cloud**: a Cloudflare-proxied DNS record (traffic goes through Cloudflare). Grey cloud = DNS-only.

## Infrastructure at a glance (as of 2026-07-06, from docs/production-deployment.md)

| Component | Value |
|---|---|
| VPS | Hetzner CX33, Intel 4 vCPU / 8 GB RAM, Nuremberg (nbg1), 4 GB swap |
| IP | `195.201.122.202` |
| Runtime | Docker + Docker Swarm (single node), Traefik v3 via Dokploy |
| Image | `ghcr.io/mrowaisabdullah/owflex-chat:latest` (also tagged `:<git-sha>`) |
| CI/CD | GitHub Actions (`.github/workflows/deploy.yml`) -> GHCR -> Dokploy deploy API |
| Panel | `https://deploy.octively.com` |
| Status page | `https://octively.instatus.com` |
| SSH | `ssh -i ~/.ssh/octively_dokploy root@195.201.122.202` (key-only, fail2ban on 22) |

Hostnames (all served by the one container; root `proxy.ts` routes by host header):
`octively.com` (marketing), `admin.octively.com` (-> `/dashboard`), `app.octively.com` (-> `/portal`), `affiliates.octively.com` (-> `/affiliate`). Note: the DNS table in `docs/production-deployment.md` predates the affiliates subdomain (documented drift); the surface is live (verified 200 on 2026-07-06).

## Deploy pipeline anatomy

`master` IS production. There is no release branch, no staging environment.

```
git push origin master
  └► GitHub Actions ".github/workflows/deploy.yml" (also manual: workflow_dispatch)
       ├─ job "build" (ubuntu-latest)
       │    ├─ docker/setup-buildx-action@v3
       │    ├─ login to ghcr.io with the built-in GITHUB_TOKEN
       │    └─ docker/build-push-action@v6:
       │         platforms: linux/amd64          # MUST match the Intel CX33; native onnxruntime/sharp binaries are arch-specific
       │         tags: :latest AND :<git-sha>    # the sha tag is your rollback handle
       │         cache-from/to: type=gha         # layer cache; makes rebuilds fast
       │         no-cache-filters: builder       # ALWAYS re-run the builder stage (see below)
       │         build-args: 9x NEXT_PUBLIC_*    # from GitHub Secrets, inlined at build time
       └► job "deploy" (needs: build)
            curl -X POST "$DOKPLOY_URL/api/application.deploy" -H "x-api-key: $DOKPLOY_API_KEY" -d '{"applicationId":"$DOKPLOY_APP_ID"}'
                 └► Dokploy pulls ghcr.io/...:latest and swaps the container (Traefik keeps routing)
```

Why `no-cache-filters: builder` exists (do not remove it): `NEXT_PUBLIC_*` values are inlined into the client bundle during `npm run build` inside the Docker builder stage. A build-arg change alone does NOT bust BuildKit's cached layer, so without this filter, changing a `NEXT_PUBLIC_*` GitHub Secret silently never took effect (commits `bb6b66c`, `ac4e5d6`). The `deps` stage (npm install) stays cached; only `builder` re-runs.

Dockerfile facts that matter operationally (root `Dockerfile`):
- Node `22-slim`, multi-stage (`deps` -> `builder` -> `runner`). `deps` uses `npm install` (not `npm ci`) deliberately - cross-platform optional deps break `ci`.
- Builder runs `npm run build:embed && npm run build` with `DOCKER_BUILD=1` (emits Next standalone output). The widget is minified inside the image; you do not need to remember `build:embed` for prod (you DO for local commits - see `octively-change-control`).
- Runner: `CMD ["node", "server.js"]`, `USER node`, port 3000, `EMBEDDING_PROVIDER=onnx`, `TRANSFORMERS_CACHE=/app/.cache/transformers`. **There is no migration step at container boot.** Schema changes are a separate manual act (see Migrations below).
- The embedding model cache must persist: Dokploy app -> Mounts -> volume `octively-model-cache` at `/app/.cache/transformers`. If lost, the model re-downloads once on first use (disposable, not data loss).

### Timing and where to watch

- First/uncached build: ~10-12 min end to end. Cached rebuilds are faster (deps layer cached; builder always re-runs).
- Watch the build: `https://github.com/MrOwaisAbdullah/Owflex-Chatbot-Saas/actions` (or `gh run watch` / `gh run list --limit 3`).
- Watch the container swap and runtime logs: Dokploy panel `https://deploy.octively.com` -> the app -> Deployments / Logs.
- A green Actions run only means "image pushed + deploy API returned 200". The container can still fail to boot - always check Dokploy logs, then run the smoke pass (below).

### Redeploy without a code change

Two cases:
1. **Changed a `NEXT_PUBLIC_*` GitHub Secret** (build-time): re-run the workflow via `workflow_dispatch` (Actions tab -> "Build and deploy" -> Run workflow) or `gh workflow run deploy.yml`. A rebuild is required; a Dokploy-only redeploy will NOT pick up build-time values.
2. **Changed a runtime env var in Dokploy** (everything that is not `NEXT_PUBLIC_*`): save in Dokploy -> Environment, then redeploy/restart from the panel. No image rebuild needed. (Which var is which: see `octively-config-and-flags`.)

Dokploy app gotcha (from docs/vps-dokploy-setup.md section 6): the app's Source type must be **Docker** pointing at the GHCR image. If it is ever set to a Git provider, Dokploy clones and builds from source itself, bypassing the CI image - `NEXT_PUBLIC_*` build-args are lost and Sanity/analytics break.

## Rollback

Images are tagged `:latest` and `:<full-git-sha>` in GHCR, so every deployed commit has a pullable image. Options, safest-first:

1. **Git revert (fully verified path).** `git revert <bad-commit>` (or a fix-forward commit), run `npm run build` locally (build gate), `git push origin master`. Takes one full CI cycle (~10-12 min) but leaves history honest and needs no panel access.
2. **Dokploy Deployments redeploy (documented).** docs/production-deployment.md section "Rollback": Dokploy panel -> app -> Deployments tab -> click a previous deployment -> Redeploy. UNVERIFIED nuance: the app is configured to pull `:latest`, and it is unverified from the repo whether redeploying an old entry re-pins the old image or just re-pulls `:latest` - verify in the panel before relying on this under fire.
3. **Pin a sha tag (mechanism verified, UI steps UNVERIFIED).** In Dokploy -> app -> the Docker image setting, change `ghcr.io/mrowaisabdullah/owflex-chat:latest` to `...:<known-good-sha>` and redeploy. Get the sha with `git log --oneline -10` (full sha: `git rev-parse <short-sha>`). Remember to set it back to `:latest` afterward or future CI deploys will not take effect.

Rollback does NOT undo database migrations. If the bad release included a schema change, rolling back the image while the schema stays migrated is usually safe here (migrations are additive `IF NOT EXISTS` style), but confirm before assuming - and any prod DB action is owner-approval territory per `octively-change-control`.

## Production migrations (prod DB ops = owner approval, per octively-change-control)

There is **no automatic migration on deploy** - not in the Dockerfile CMD, not in CI. Two mechanisms exist:

### Mechanism 1: drizzle-kit against the prod DATABASE_URL (the standard path)

Migration files live in `lib/db/migrations/` (up to `0022_notifications.sql` as of 2026-07-07 — this ceiling drifts, re-derive with `ls lib/db/migrations | tail -3`; journal in `lib/db/migrations/meta/`). `drizzle.config.ts` self-loads `.env.local` for `DATABASE_URL`.

```bash
cd "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas"
npm run db:generate    # generate SQL from lib/db/schema.ts changes
npm run db:migrate     # applies to whatever DATABASE_URL points at - CHECK IT FIRST
```

- **Check which DB you are pointed at before running migrate.** `.env.local`'s `DATABASE_URL` may be dev or prod. Pointing it at prod Neon and running `db:migrate` is the historical precedent (specs/phase-1-mvp/tasks.md T076).
- On WSL, Neon connections from CLI scripts fail with "fetch failed" (IPv6/undici). Prefix with: `NODE_OPTIONS="--dns-result-order=ipv4first --import ./scripts/wsl-net-fix.mjs"` (see `octively-build-and-env`).
- Order of operations for a schema change: apply migration to prod BEFORE deploying code that reads the new column (the additive-migration-first rule). New code + old schema = runtime 500s; old code + new additive schema = harmless.

### Mechanism 2: the in-app one-shot endpoint `/api/internal/migrate` (kill-switched)

`app/api/internal/migrate/route.ts` is a double-locked ad-hoc DDL runner:
- Returns 404 unless env `MIGRATIONS_ENABLED=true` (default-off kill switch - even a leaked secret cannot reach it while disabled).
- Additionally requires header `Authorization: Bearer $CRON_SECRET` (constant-time check via `verifyBearer` in `lib/security.ts`).
- `GET` = read-only column inventory of key tables (diagnosis). `POST` = applies a hardcoded, idempotent batch of DDL (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`) plus a legacy Redis credit correction; returns per-statement results.

Operating procedure (only with owner approval): set `MIGRATIONS_ENABLED=true` in Dokploy -> Environment, restart, `GET` to diagnose / `POST` to apply, then **unset the flag and restart again**. Never leave it enabled.

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" https://admin.octively.com/api/internal/migrate   # GET: inspect columns
```

Use Mechanism 1 for new schema work (it keeps the drizzle journal truthful). Mechanism 2 is for emergency prod-only fixes when local access to prod DATABASE_URL is unavailable, and its DDL list is a historical snapshot - new migrations do not automatically appear in it.

## Cron jobs

`vercel.json` declares both crons, but **vercel.json crons only run on Vercel (the dev/preview deploy). Production is Dokploy, where they do NOT run** - they must be scheduled in Dokploy (docs/dokploy-cron-setup.md).

| Job | Endpoint | Schedule | Criticality |
|---|---|---|---|
| Monthly reset | `GET /api/cron/monthly-reset` | `0 0 1 * *` | **Required.** Zeroes `conversationsThisMonth`/`leadsThisMonth` for all orgs and restores free-tier credits. Missing it breaks the "permanent free plan" promise. |
| Weekly digest | `GET /api/cron/weekly-digest` | `0 3 * * 1` | Optional. Emails weekly stats to developers on paid plans above starter (free/starter skipped in code). |

Both routes (`app/api/cron/*/route.ts`) export **GET only** and require `Authorization: Bearer $CRON_SECRET` (else 401). A POST returns 405 - an older snippet in docs/vps-dokploy-setup.md section 8 uses `curl -X POST`; that snippet is wrong, use GET.

Setup in Dokploy (per docs/dokploy-cron-setup.md): app -> Schedules tab -> Create Schedule -> run inside the app container with:

```bash
node -e "fetch('http://localhost:3000/api/cron/monthly-reset',{headers:{Authorization:'Bearer '+process.env.CRON_SECRET}}).then(r=>r.text()).then(t=>console.log('monthly-reset:',t))"
```

(`node` + global fetch exist in the container; localhost keeps the call off the public internet; `CRON_SECRET` comes from the container env.)

Test manually - do not wait for the 1st of the month:

```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" https://admin.octively.com/api/cron/monthly-reset
# 200 {"orgsReset": N} = good; 401 = header secret != Dokploy env CRON_SECRET; 404 = wrong URL/app down
```

Fallback if Dokploy's scheduler misbehaves: cron-job.org hitting the public URL with the bearer header. Do not use GitHub Actions schedules for this (routinely delayed/skipped; wrong for a billing reset).

**Server-side Docker prune cron:** old images are pruned by a weekly cron ON THE VPS itself, not from CI (commit `c3541d2` removed the SSH prune step from deploy.yml to avoid storing SSH keys in GitHub Secrets). The exact crontab entry lives only on the box - UNVERIFIED from the repo; check with `ssh root@195.201.122.202 'crontab -l'`. If disk fills on the VPS, suspect this cron died: `docker system df`, then `docker image prune -f`.

## DNS / Cloudflare / SSL

From docs/production-deployment.md (record of intent; live state is in the Cloudflare dashboard):

| Record | Target | Proxy |
|---|---|---|
| `@`, `www`, `admin`, `app` (A) | `195.201.122.202` | Orange (proxied) |
| `affiliates` (A) | `195.201.122.202` | Live but absent from the doc's table (drift) - UNVERIFIED proxy status, check dashboard |
| `deploy` (A) | `195.201.122.202` | Doc table says Grey; docs/vps-dokploy-setup.md section 9 says orange - conflicting docs, check dashboard |
| MX / SPF / DKIM / DMARC | - | **Always grey.** Proxying email records breaks DKIM and SMTP. |

Rules that bite:
- **SSL mode: Full (Strict), never Flexible.** Flexible + Traefik = infinite redirect loop (Traefik redirects HTTP->HTTPS, Cloudflare keeps sending HTTP).
- **Cache rule: bypass `/api/*`.** Otherwise Cloudflare buffers SSE and chat streaming breaks (arrives as one block, or hangs). `/embed.js` is the opposite: cached hard, TTL 1 day. If you ship a widget change and third-party sites still serve the old one, purge `/embed.js` in Cloudflare.
- **ACME certs use the DNS-01 challenge** with a Cloudflare API token (commit `5089cff`, docs/vps-dokploy-setup.md section 9 Solution A): Traefik's `certificatesResolvers.letsencrypt.acme.dnsChallenge.provider: cloudflare` in `/etc/dokploy/traefik/traefik.yml` on the VPS, token passed as `CF_DNS_API_TOKEN` to the Traefik container. This lets records stay orange-clouded permanently, renewals ~every 60 days with zero intervention. If a cert fails to renew: `docker logs dokploy-traefik --tail 50` on the VPS; check the CF token has not expired/been revoked.
- Adding a new subdomain (like affiliates was): Cloudflare A record -> add the domain on the SAME Dokploy application (container port 3000) -> Traefik/LE issues the cert -> the hostname branch must exist in root `proxy.ts`. All four pieces or it 404s/handshake-fails.

## Post-deploy verification

Full checklist: `docs/smoke-tests.md` (14 sections, ~90 checks; pass/fail discipline). Note its section 14 still references Netlify - stale drift; read "Netlify deploy status" as "GH Actions run green + Dokploy deployment done". What counts as evidence: see `octively-validation-and-qa`.

Minimal 10-minute smoke pass after every deploy (item numbers from docs/smoke-tests.md):

```
[ ] 1.1/1.5/1.6  octively.com, admin.octively.com, app.octively.com load (add affiliates.octively.com - not yet in the doc)
[ ] 1.3          octively.com/dashboard redirects to admin.octively.com (proxy.ts alive)
[ ] 2.3          dashboard email login lands on the bot list (auth + Neon + Redis alive)
[ ] 5.1          /embed.js returns Content-Type: application/javascript
[ ] 5.3/5.4      send a chat message in bot preview; response STREAMS token-by-token
                 (if it arrives as one block: Cloudflare cache rule on /api/* broke - see DNS section)
[ ] 5.7          embed script on a local third-party HTML page loads and chats
[ ] 12.1/12.2    POST /api/v1/chat: valid embed key 200, invalid key 404
[ ] Webhooks     billing change pending? verify Lemon Squeezy webhook (admin.octively.com/api/webhooks/lemon-squeezy)
                 delivery in the LS dashboard; PayFast ITN URL derives from NEXT_PUBLIC_APP_URL
[ ] 9.1/9.3      credit pill shows a number (not a skeleton) and decreases after a chat (Upstash + debit path alive)
```

Quick scripted head-checks (all verified working 2026-07-06):

```bash
curl -sI https://octively.com | head -3                                   # HTTP/2 200
curl -sI https://octively.com/embed.js | grep -i "content-type\|cf-cache" # application/javascript
curl -sI https://admin.octively.com | head -3                             # 307 (to login) is healthy
curl -sI https://affiliates.octively.com | head -3                        # HTTP/2 200
```

## Operational surfaces: what runs where, and what breaks

The container is stateless; almost all state lives in external managed services. A dead VPS loses no customer data.

| Service | Role | If it is down, what breaks |
|---|---|---|
| Next.js container (VPS) | Everything user-facing | All four surfaces + API + widget. Total outage. Check Dokploy logs first. |
| Cloudflare | DNS, TLS edge, cache | Everything unreachable (all records proxied). Also the SSE/caching layer. |
| Neon Postgres (external) | All app data: orgs, bots, conversations, leads, document chunks, auth tables | Login, dashboards, chat persistence, RAG retrieval. App may render shells but every data read 500s. |
| Upstash Redis (external) | Credit balances, rate limits, session/secondary cache | Chat blocked (debit-first: no debit = no LLM call), credit pill skeleton, rate limiting off. |
| OpenRouter (via `lib/ai/litellm.ts`) | LLM responses | Chat replies fail; credits are refunded on failure (debit-first pattern). Everything else works. |
| QStash (external) | Background doc/URL ingestion queue | Knowledge uploads stall in "processing". Chat unaffected. |
| Cloudflare R2 | Uploaded document storage | New uploads/downloads fail. Retrieval of already-embedded chunks unaffected (chunks in Neon). |
| Local ONNX embeddings (in-container) | Query + ingest embeddings | Down only if the container is down; model cache volume loss = one-time re-download. |
| Resend | Transactional email | Welcome/reset/invite/handoff emails silently missing. Nothing else. |
| Brevo | Marketing digests, contact | Weekly digest and marketing mail only. |
| Sanity | Blog/marketing CMS content | Blog pages degrade; product unaffected. |
| PayFast / Lemon Squeezy | Payments + webhooks | Checkout and plan changes; existing users keep working. |
| GHCR + GitHub Actions | Build/deploy path only | Cannot ship or roll forward; production keeps running. |

## Running locally (brief - full setup in octively-build-and-env)

```bash
cd "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas"   # path has spaces - always quote
npm run dev    # next dev --turbopack, http://localhost:3000
```

On localhost there are no subdomains: `proxy.ts` only rewrites when the host starts with `admin.`/`app.`/`affiliates.`, so navigate by path prefix - `/` (marketing), `/dashboard`, `/portal`, `/affiliate`. WSL/npm/Neon environment traps: `octively-build-and-env`.

## When NOT to use this skill

- **Env var/flag semantics, adding a new env var end-to-end, NEXT_PUBLIC build-arg pipeline details** -> `octively-config-and-flags` (this skill only tells you build-time vs runtime routing).
- **Bootstrapping a VPS from zero** (buy box, install Dokploy, harden SSH/firewall) -> the generic `vps-dokploy-nextjs` skill + `docs/vps-dokploy-setup.md` sections 1-2, 13.
- **Dev machine setup, WSL traps, build command anatomy** -> `octively-build-and-env`.
- **Whether/how a change is allowed to ship** (build gates, commit rules, owner-approval list) -> `octively-change-control`. Everything in this skill that touches prod DB or pricing-adjacent behavior routes through it.
- **A deploy that "succeeded" but the app misbehaves** (CSP, proxy rewrites, payments, credits) -> `octively-debugging-playbook`; past incidents -> `octively-failure-archaeology`.
- **Evidence standards and test-writing** -> `octively-validation-and-qa`.

## Provenance and maintenance

Authored 2026-07-06, revised 2026-07-07 (migration ceiling 0021 → 0022). Sources: `docs/production-deployment.md`, `docs/vps-dokploy-setup.md`, `docs/dokploy-cron-setup.md`, `docs/smoke-tests.md`, `.github/workflows/deploy.yml`, `Dockerfile`, `drizzle.config.ts`, `vercel.json`, `netlify.toml` (historic only - Netlify decommissioned), `proxy.ts`, `app/api/cron/{monthly-reset,weekly-digest}/route.ts`, `app/api/internal/migrate/route.ts`, `lib/security.ts`, commits `c3541d2` (server-side prune), `5089cff` (DNS-01), `bb6b66c`/`ac4e5d6` (builder cache bust). Live endpoints spot-checked 2026-07-06.

Re-verify volatile facts before trusting them (run from the repo root, quoted path):

| Fact | Re-verify with |
|---|---|
| Workflow triggers, image name, build-args, deploy API call | `cat .github/workflows/deploy.yml` |
| Dockerfile CMD, Node version, no-boot-migration claim | `cat Dockerfile` |
| Latest migration number | `ls lib/db/migrations/ \| tail -3` |
| MIGRATIONS_ENABLED gate + endpoint behavior | `sed -n '1,40p' app/api/internal/migrate/route.ts` |
| Cron routes are GET + bearer-gated | `grep -n "export async function" app/api/cron/*/route.ts` |
| Cron schedules of record | `cat vercel.json docs/dokploy-cron-setup.md` |
| VPS specs, IP, panel URL, DNS table, rollback doc | `sed -n '40,70p;185,191p' docs/production-deployment.md` |
| Subdomain list | `grep -n "ORIGIN\|startsWith" proxy.ts` |
| npm scripts (dev/build/db:*) | `grep -n -A 12 '\"scripts\"' package.json` |
| Prod endpoints alive | `curl -sI https://octively.com \| head -3` (repeat per subdomain) |
| Dokploy/Traefik/Docker versions, prune crontab, Traefik ACME config | On the VPS only: `ssh root@195.201.122.202 'crontab -l; docker --version; cat /etc/dokploy/traefik/traefik.yml'` (UNVERIFIED from repo; panel shows versions too) |
