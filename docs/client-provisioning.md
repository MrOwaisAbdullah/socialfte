# Client Provisioning Runbook

How to onboard a new client onto SocialFTE — a fresh Dokploy service, a fresh
Neon database, a fresh R2 bucket, and a completed BOOTSTRAP wizard, ending
with the operator holding a dashboard URL and a Discord invite.

This runbook exists because Week 5's generalisation pass (`FR-016`, US5) made
the product itself brand-agnostic — every brand-specific value now comes from
config rather than being baked into code. This document is what turns "the
code supports it" into "here's how you actually do it." The second-client
simulation (`clients/test-client-2/`, US6) proved the isolation boundary
works; this is the real-world version of that same process.

## Before you start

- One Hetzner VPS (or equivalent) with Dokploy already running other clients'
  services is fine — each client gets its own Dokploy **service**, not its own
  VPS (see the `vps-dokploy-nextjs` skill for the underlying infra pattern).
- You'll need: a Neon account, a Cloudflare account (R2), a Discord server the
  new client controls (or is willing to let you administer), and the new
  client's actual brand details (name, colors, fonts, platforms, prices).
- Nothing here touches an existing client's Dokploy service, Neon project, R2
  bucket, or `.env` file. Every step below operates on new, client-scoped
  resources only.

## Step-by-step

### 1. New Dokploy service (~15 min)

Copy the existing `yl-dashboard`/`yl-worker` Dokploy services as a template
for the new client (Dokploy supports duplicating a service's config) rather
than building from scratch:

1. In the Dokploy panel, create two new services under a new project (or a
   new namespace within the existing project — Dokploy's per-service
   isolation is what matters, not folder structure): `<client>-dashboard` and
   `<client>-worker`.
2. Point each at the same GHCR image / `infra/docker-compose.yml` +
   `infra/Dockerfile.dashboard` build the first client uses — the product
   is the same codebase for every client, only the environment differs.
3. Do **not** copy the first client's environment variables verbatim. Every
   variable in the table below (§ Per-client environment variables) must be
   client-specific.
4. Assign the new client's own subdomain(s) (e.g. `social.<client>.com`) and
   issue TLS the same way the first client's domains were issued (grey-cloud
   the DNS record in Cloudflare, let Dokploy/Traefik get the cert, then
   orange-cloud it — see the `vps-dokploy-nextjs` skill's `cloudflare-ssl.md`
   reference if this is unfamiliar).

### 2. New Neon project (or schema) (~10 min)

1. Create a new Neon project (a full separate project is simpler to reason
   about and bill than a shared-project-separate-schema approach, and keeps
   one client's data physically isolated from another's — recommended unless
   you have a specific reason to share a Neon project).
2. Enable the `vector` extension **before** pushing the schema (a documented
   gotcha — `drizzle-kit push` fails if `pgvector` isn't enabled first; see
   the root `CLAUDE.md`'s Gotchas section).
3. Push the schema: `cd apps/dashboard && DATABASE_URL=<new-client-url> npx
   drizzle-kit push` — this creates every table `apps/worker/db/schema.sql`
   defines, for the new client's database only.
4. Copy the connection string into the new client's `DATABASE_URL` (see the
   env-var table below) — never into the first client's `.env`.

### 3. New R2 bucket (~5 min)

1. Create a new Cloudflare R2 bucket named for the new client (e.g.
   `<client>-social`) — never reuse the first client's bucket.
2. Create a scoped R2 API token (Cloudflare dashboard → R2 → Manage API
   Tokens) with read/write access to only this new bucket, not the account's
   other buckets.
3. Enable public access on the bucket (or a custom domain via
   Cloudflare Workers/R2 public buckets) so `R2_PUBLIC_URL` resolves to
   something the dashboard's `<Image>`/Remotion `<Img>` components and the
   Discord approval card can actually load.
4. Record: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
   `R2_BUCKET`, `R2_ENDPOINT` (`https://<account-id>.r2.cloudflarestorage.com`),
   `R2_PUBLIC_URL`.

### 4. Run the BOOTSTRAP wizard (~20-30 min, mostly waiting on the client)

BOOTSTRAP is a 6-step guided setup (`apps/worker/bootstrap/steps.py`) that
collects brand identity, connects social platforms, configures the
notification channel, sets posting cadence, and finally runs 4 live checks
(LLM call, render, notification, database) before marking itself complete.

1. Write the new client's env file, e.g. `clients/<client>/.env` (see
   `clients/test-client-2/.env.example` for the shape — copy it, don't start
   from the root `.env.example`, since the client directory's version omits
   variables that don't vary per client).
2. Run it with `--env` pointed at that file — **this is the flag Week 5 added
   specifically for this step** (`apps/worker/bootstrap/cli.py`):

   ```bash
   cd apps/worker
   python -m worker bootstrap --env=../../clients/<client>/.env
   ```

3. The wizard asks for: agent name/voice (→ `SOUL.md`/`IDENTITY.md`), brand
   name/tagline/colors/fonts/language/platforms (→ `BRAND.md`), which
   platforms to connect and their tokens (→ `credentials` table), which
   notification channel and its token (→ `.env.local` in the client's
   directory), and posting cadence (→ `HEARTBEAT.md`).
4. Step 6 needs the new client's `DATABASE_URL`, `OPENROUTER_API_KEY` (can be
   the same key as an existing client — OpenRouter billing is per-key, not
   per-client, unless you deliberately want separate billing), and either a
   real `RENDER_INTERNAL_URL`/`RENDER_INTERNAL_SECRET` pair or an accepted
   partial failure on that check if the render pipeline isn't live yet.
5. Re-run the same command if any step fails — every step checks whether its
   own output already exists before prompting again (resumability), so a
   failed step 6 doesn't re-ask steps 1-5's questions.
6. `BOOTSTRAP.md` is written **only** when all 4 of step 6's checks pass —
   its presence in the client's directory is the actual "setup is verified
   working" signal, not just "the questions got answered."

### 5. Hand over the dashboard URL + Discord invite (~5 min)

1. Confirm the client's dashboard is reachable at its assigned domain and the
   login page shows the new client's `BRAND_NAME` (not the first client's) —
   a quick visual proof the isolation actually took.
2. Create a Discord bot application scoped to the new client's own Discord
   server (never reuse the first client's bot/application — each client's
   approval flow must be independently revocable).
3. Send the client: the dashboard URL, the shared operator password
   (`SESSION_SECRET`-derived — see `apps/dashboard/lib/session.ts`), and the
   Discord server invite where their approval cards will appear.

## Per-client environment variables

Every variable below **must** differ between clients. Anything not in this
table (cron schedules, anti-repeat windows, caption similarity thresholds,
etc. — see `specs/002-week2-dashboard-render/contracts/env-vars.md` through
`specs/005-week5-motion-generalise/contracts/env-vars.md` for the full,
per-week variable history) is a product-wide default that's fine to leave
shared unless a specific client needs a different value.

| Variable | Where it's set | Why it must be per-client |
|---|---|---|
| `BRAND_NAME` | dashboard `.env.local`, worker `.env` | Shown in the dashboard shell/title (Week 5, FR-016) |
| `APP_URL` | dashboard `.env.local`, worker `.env` | The client's own dashboard domain |
| `SESSION_SECRET` | dashboard `.env.local` | A shared secret scoped to one client's login — reusing it across clients would let one client's session cookie work on another's dashboard |
| `DATABASE_URL` | both | Separate Neon project — data isolation between clients |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_ENDPOINT` / `R2_PUBLIC_URL` | both | Separate bucket — one client's assets/renders must never be reachable from another's public media domain |
| `META_APP_ID` / `META_APP_SECRET` / `META_PAGE_ID` / `META_PAGE_TOKEN` / `META_IG_USER_ID` | worker `.env` | Each client has their own Facebook Page/Instagram account |
| `YOUTUBE_CLIENT_SECRETS_PATH` / `YOUTUBE_TOKEN_PATH` / `YOUTUBE_CHANNEL_ID` | worker `.env` | Each client has their own YouTube channel and OAuth app |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` / `TIKTOK_ACCESS_TOKEN` | worker `.env` | Each client has their own TikTok developer app and account |
| `DISCORD_BOT_TOKEN` / `DISCORD_PUBLIC_KEY` / `DISCORD_APPLICATION_ID` / `DISCORD_CHANNEL_ID` (or the WhatsApp/Telegram equivalents) | worker `.env` | Each client approves posts in their own Discord server — sharing a bot token would let one client see/approve another's posts |
| `RENDER_INTERNAL_SECRET` | worker `.env` **and** the client's GitHub repo secrets (if using a per-client render workflow) | Verifies the render-complete callback came from this client's own workflow |
| `GITHUB_REPO` | worker `.env` | Which repo's `workflow_dispatch` to call for video renders (Week 5) — only relevant if each client gets their own fork/repo rather than sharing one multi-tenant render workflow |
| `CAP_*_PER_DAY` | worker `.env` | Only if the new client has a different posting-frequency agreement than the default |

## Secrets that must be rotated per client (never shared)

These are the values where accidentally reusing the first client's copy is a
real security/isolation failure, not just a config mistake:

- `SESSION_SECRET` — one client's login cookie must never validate on
  another's dashboard.
- `DATABASE_URL` — full data isolation between clients' posts, assets,
  metrics, and audit logs.
- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` — scope the R2 API token to
  only the new client's bucket at creation time (§3 above), so even a leaked
  token can't reach another client's media.
- `META_PAGE_TOKEN`, `YOUTUBE_TOKEN_PATH`'s underlying token, `TIKTOK_ACCESS_TOKEN`
  — each is already tied to one client's actual social account by the
  platform itself; the risk here is operator error (pasting the wrong
  client's token into the wrong `.env`), not the token being reusable.
- `DISCORD_BOT_TOKEN` — a leaked or reused bot token gives approve/reject
  access to whichever Discord server it's installed in; never install the
  same bot application across multiple clients' servers.
- `RENDER_INTERNAL_SECRET` — must match between the worker's `.env` and
  whatever calls `/api/render-complete` for that client; rotate it if a
  GitHub Actions log or CI secret for one client is ever exposed.

## Total estimated time

~55-85 minutes end-to-end for an operator who already has the client's brand
details and platform credentials in hand. Most of the variance is in how
quickly the client can produce their platform tokens (Meta App review,
YouTube OAuth consent screen verification, etc.) — those are the client's
dependencies, not the operator's.
