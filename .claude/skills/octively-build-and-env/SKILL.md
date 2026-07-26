---
name: octively-build-and-env
description: Load when setting up the Octively repo from scratch on a new machine, when `npm install` fails on WSL2 (ENOTEMPTY, stale rename errors), when `npm run dev` starts but subdomain-specific pages 404 on localhost, when a Neon/Node script fails with "fetch failed" under WSL, when you need to know what a specific npm script (dev/build/build:embed/db:generate/lint/test) actually does, when `npm run db:generate` fails with "Interactive prompts require a TTY terminal" or prompts about column conflicts, or when a local `npm run build` passes but you suspect Docker/production will differ. Trigger files: package.json, embed/package.json, Dockerfile, proxy.ts, drizzle.config.ts, tests/vitest.config.ts, scripts/wsl-net-fix.mjs, tsconfig.json, postcss.config.mjs, .env.example.
---

# Octively: Build and Environment

Recreates the working dev environment from zero and explains every build script. Zero project
lore assumed. The repo path contains spaces — always `cd` into it quoted, or quote every path:

```bash
cd "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas"
```

## When NOT to use this skill

- Deploying, Dokploy, GitHub Actions, prod migrations, cron, DNS → `octively-run-and-operate`.
- What an env var *means*, its default, or the NEXT_PUBLIC build-arg pipeline → `octively-config-and-flags`.
- Change gating rules (build gate gets enforced, not just described) → `octively-change-control`.
- Symptom-first triage (CSP errors, stale embed widget, credits stuck) → `octively-debugging-playbook`.
- "Has this exact WSL/build problem happened before and how was it resolved" → `octively-failure-archaeology`.

## Environment reality (verified 2026-07-07)

| Fact | Value | Evidence |
|---|---|---|
| Host OS | Windows, repo lives on the mounted `D:` drive | `Working directory: /mnt/d/GIAIC/...` |
| Dev shell | WSL2 (Ubuntu) | environment; see WSL traps below |
| Path has spaces | `Real World Projects`, `Owflex Chatbot Saas` | quote every command |
| Local Node (this machine) | v24.12.0 (`node --version`) | ran directly, no `engines` field pins a version |
| Docker/production Node | `node:22-slim` (`Dockerfile` line `ARG NODE_VERSION=22-slim`) | comment: "`@huggingface/transformers` v4 requires node >=22.22" |
| npm (local) | 11.6.2 | `npm --version` |
| npm (Docker) | upgraded to `npm@11` inside the `deps` stage | `Dockerfile`: `RUN npm install -g npm@11 --quiet` — comment says this matches "the lock file generator (npm 11)" |
| Package manager | npm, `lockfileVersion: 3` | `package-lock.json` |
| Workspaces | root `package.json` declares `"workspaces": ["embed"]` | `embed/package.json` name `@owflex/embed` |
| Next.js | 16.2.6 App Router, Turbopack dev | `npx next --version` → `Next.js v16.2.6` |

**Local-vs-Docker Node drift is real and unverified for edge cases.** `package.json` has no
`engines` field, so nothing stops you running `npm install`/`npm run build` on Node 24 locally
while production runs Node 22-slim. This has been fine for pure-JS/TS code; native modules
(`onnxruntime-node`, `sharp`, `@huggingface/transformers`) are only ever exercised inside the
Docker image (`EMBEDDING_PROVIDER=onnx` is a VPS-only runtime setting per `.env.example`), so a
green local build does not prove those paths work — see "Docker build parity" below.

## From-scratch setup checklist

1. **Clone and enter the repo** (quoted path, spaces).
   ```bash
   git clone https://github.com/MrOwaisAbdullah/Owflex-Chatbot-Saas.git "Owflex Chatbot Saas"
   cd "Owflex Chatbot Saas"
   ```
2. **Create `.env.local` from `.env.example`.**
   ```bash
   cp .env.example .env.local
   ```
   Then fill in vars per the "minimum-viable for local dev" table below. Full semantics for every
   var (defaults, who consumes it, NEXT_PUBLIC build-arg wiring) live in `octively-config-and-flags`
   — this skill only tells you what breaks if a var is missing.
3. **Install dependencies** — see the WSL ENOTEMPTY section before running this blind.
   ```bash
   npm install
   ```
4. **Run the dev server.**
   ```bash
   npm run dev
   ```
   Turbopack dev server on `http://localhost:3000`. See "Reaching each surface on localhost" below
   — hostname-based routing does not apply locally.
5. **(Optional) Point Drizzle Studio / a Node script at Neon** — see the Neon-from-WSL trap section;
   do this only once `DATABASE_URL` is set.

### The WSL `ENOTEMPTY` npm-install trap

**Symptom:** `npm install` fails mid-run with `ENOTEMPTY: directory not empty, rename '.../node_modules/.package-lock.json...' -> '...'` or similar rename errors, sometimes non-deterministically.

**Root cause:** WSL2's 9p/DrvFs filesystem bridge to the Windows `D:` drive does not support atomic directory renames the way native Linux ext4 does. npm's install algorithm relies on atomic renames when swapping in package directories; on a Windows-mounted drive under WSL2 these renames can partially fail, leaving stale `.package-*` temp directories behind inside `node_modules`.

**Confirmed by project history:** PHR `history/prompts/phase-1-mvp/0008-phase-1-phase-2-scaffold-implementation.green.prompt.md` (reflection line): *"WSL filesystem (ENOTEMPTY) blocks concurrent npm installs — manual component writing was faster and produced better-themed output than shadcn auto-generated files."*

**Workarounds, in order of how much they help:**
1. **Install in small groups**, not one giant `npm install` of everything at once, if you're adding new deps. For the initial from-scratch install, a plain `npm install` usually completes — the trap mostly bites on repeated/partial installs and dependency additions after the tree already exists.
2. **If it fails, look for and remove stale temp dirs** before retrying:
   ```bash
   find node_modules -maxdepth 1 -name ".*-*" -o -name ".package-*" 2>/dev/null
   rm -rf node_modules/.package-lock.json.* node_modules/.*-*   # remove only the stale temp entries shown above, not real packages
   npm install
   ```
3. **`npm cache clean --force` sometimes helps** when the failure repeats on the same package across retries (corrupted extracted cache entry) — not guaranteed, try it as a second-line fix, not a first reflex.
4. **shadcn/ui CLI (`npx shadcn add <component>`) is a known additional failure point on WSL** — it does its own package resolution/install under the hood and hits the same rename problem, compounded by `components.json`'s `tailwind.config: ""` (Tailwind v4 has no config file for the CLI to patch — see Tailwind v4 section below). **The house workaround, used throughout this codebase, is to hand-write new components in `components/ui/` following the style of the existing ones** (`components/ui/button.tsx`, `card.tsx`, `dialog.tsx`, etc. — all present, all shadcn-style but manually authored/edited) rather than running the generator. This is also *required* by `CLAUDE.md`'s "No shadcn/ui GUI configurator" rule, so the WSL trap and the design-system rule point at the same practice for two different reasons — do not treat "the CLI works today" as license to run it.
5. If `npm install` is still failing after the above, do **not** retry in a sleep loop — diagnose which specific package/rename is failing from the error message and remove only that stale path.

**Do not run `npm install` as part of verifying this skill** — it mutates `node_modules`/the lock file and is slow; this section is read-only guidance, not something to execute speculatively.

### `.env.local` — minimum-viable for local dev

Derived by reading how each module consumes its env var (lazy singletons vs. eager throws), **not
by executing the app** (out of scope for this skill — read-only verification only). Labeled
`UNVERIFIED` where I could not confirm behavior without running the server.

| Var | Required to boot `npm run dev` at all? | What breaks without it | Evidence |
|---|---|---|---|
| `DATABASE_URL` | No crash at startup | Any page/route touching Postgres throws at request time. `lib/db/index.ts` wraps the Neon client in a lazy `Proxy` — `neon()` is only called on first property access, specifically "to prevent build errors when DATABASE_URL is not set in the build env" (code comment). Almost everything beyond static marketing pages hits the DB (auth session lookups included), so treat this as effectively required. | `lib/db/index.ts:8-17` |
| `BETTER_AUTH_SECRET` | Likely no local-dev crash, but UNVERIFIED | `lib/auth/index.ts` never sets an explicit `secret` field on the `betterAuth()` config — BetterAuth's own convention is to read `process.env.BETTER_AUTH_SECRET` directly. `.env.example` says "Generate: `openssl rand -base64 32`". Any login/session flow needs a real value. | `lib/auth/index.ts` (no `secret:` key found by grep); `.env.example` |
| `BETTER_AUTH_URL` | UNVERIFIED | Same as above — used for BetterAuth's own callback/redirect base; `.env.example` default `http://localhost:3000` is correct for local dev, leave it. | `.env.example` |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | No crash at import | `lib/credits/index.ts`, `lib/credits/grace.ts`, `lib/credits/usage-warnings.ts` all construct `new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, ... })` lazily inside functions (`getRedis()`), so import-time is safe but **any credit-consuming request throws** without real values. `lib/ratelimit.ts` explicitly guards: if either var is unset it no-ops instead of throwing — so auth rate limiting alone tolerates missing Redis, credits do not. | `lib/credits/index.ts:19-24`, `lib/ratelimit.ts:5-9` |
| `RESEND_API_KEY` | No crash | `lib/email/clients.ts` falls back to the literal string `'not-configured'` if unset — email sends will fail at call time (signup/reset flows), not at boot. | `lib/email/clients.ts:8` |
| `GOOGLE_CLIENT_ID` / `_SECRET` | No crash | `lib/auth/index.ts` passes `process.env.GOOGLE_CLIENT_ID!` straight through; a TypeScript `!` assertion is compile-time only, so an unset var is just `undefined` at runtime — Google sign-in will fail if a user tries it, everything else is unaffected. Safe to leave unset unless you're testing Google OAuth. | `lib/auth/index.ts` socialProviders block |
| `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_PORTAL_URL` | No crash | `.env.example` defaults (`http://localhost:3000`) are already correct for local dev — leave as-is. Wrong values silently produce broken absolute links, not errors. | `.env.example` |
| `PLATFORM_OWNER_EMAIL`, `WEBHOOK_SIGNING_SECRET`, `LLM_KEY_ENCRYPTION_SECRET`, R2/QStash/Firecrawl/Jina/PayFast/Lemon Squeezy vars | UNVERIFIED at boot | Each gates one specific subsystem (platform admin, outbound webhooks, BYOK, RAG storage/queue/scraping/embeddings, payments) — out of scope for this skill to enumerate; see `octively-config-and-flags` for the full catalog and consumer paths. | — |

**Practical minimum for "the app boots and I can click around":** `DATABASE_URL` +
`BETTER_AUTH_SECRET` + `BETTER_AUTH_URL` + `NEXT_PUBLIC_APP_URL`/`NEXT_PUBLIC_PORTAL_URL` (defaults
are fine). Everything else degrades a specific feature rather than the whole app — confirm by
grepping the consuming file before assuming a var is load-bearing.

### Reaching each surface on localhost (proxy.ts does NOT rewrite by host locally)

`proxy.ts` (root-level, the Next.js 16 replacement for `middleware.ts`) branches on the `host`
header:

```ts
if (host.startsWith('admin.')) { ... rewrite to /dashboard ... }
else if (host.startsWith('app.')) { ... rewrite to /portal ... }
else if (host.startsWith('affiliates.')) { ... rewrite to /affiliate ... }
else if (host === 'octively.com') { ... redirect /dashboard,/portal,/affiliate to their subdomains ... }
// falls through to NextResponse.next() → marketing site
```
(`proxy.ts:21-96`)

On `http://localhost:3000` the host header is `localhost:3000`, which matches **none** of those
branches — it falls straight through to the final `return NextResponse.next()`, i.e. the bare
marketing-site behavior. **There is no hostname-based routing in local dev.** Instead, navigate the
real filesystem path directly, because the route groups `(dashboard)` and `(portal)` are invisible
to the URL (parens = layout grouping only) while `affiliate` has no parens and is already a literal
URL segment:

| Surface | Local URL | Filesystem root |
|---|---|---|
| Marketing | `http://localhost:3000/` | `app/(marketing)/` |
| Dashboard (dev) | `http://localhost:3000/dashboard` | `app/(dashboard)/dashboard/` |
| Portal (client) | `http://localhost:3000/portal` | `app/(portal)/portal/` |
| Affiliate | `http://localhost:3000/affiliate` | `app/affiliate/` |

Verified by directory listing: `app/(dashboard)/dashboard/{admin,billing,bots,clients,conversations,leads,login,settings,signup,usage,...}`, `app/(portal)/portal/{conversations,invite,leads,login,settings}`, `app/affiliate/{dashboard,login,signup}`.

If you need to test the production host-based redirect/rewrite behavior itself (not just reach a
page), you must fake the `Host` header — e.g. `curl -H "Host: admin.octively.com" http://localhost:3000/` — or add entries to your hosts file. That is edge-case verification, not day-to-day dev.

## Every npm script, what it actually does

All scripts are defined in root `package.json:8-19`.

| Script | Command | What it does |
|---|---|---|
| `npm run dev` | `next dev --turbopack` | Turbopack dev server, hot reload, no host-based routing (see above). |
| `npm run build` | `next build` | Production build. **The build gate** — must exit 0 before every push (rule lives in `octively-change-control`; this skill only explains the command). `next.config.ts` sets `output: 'standalone'` only when `DOCKER_BUILD=1` is set (so plain local `npm run build` does NOT produce a standalone build — see Docker parity below). |
| `npm run start` | `next start` | Serves the `npm run build` output. Requires a prior build; not the same code path as the Docker `runner` stage (which runs `.next/standalone/server.js` directly, not `next start`). |
| `npm run lint` | `eslint` | Flat-config ESLint (`eslint.config.mjs`) extending `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`. Ignores `.next/**`, `out/**`, `build/**`, `next-env.d.ts`. |
| `npm test` | `vitest run --config tests/vitest.config.ts` | Runs `tests/integration/*.test.ts` once (currently 3 files: `chunker.test.ts`, `credits-routing.test.ts`, `retrieval-isolation.test.ts`). Full suite anatomy and "what counts as a passing test" belong to `octively-validation-and-qa`. |
| `npm run test:watch` | `vitest --config tests/vitest.config.ts` | Same config, watch mode. |
| `npm run build:embed` | `npm run build --workspace=embed && cp embed/dist/embed.min.js public/embed.js` | Two steps: (1) runs the `build` script **inside the `embed` workspace**, which is `terser src/embed.js --compress passes=3,pure_getters=true,unsafe=true --mangle --output dist/embed.min.js` (`embed/package.json:6` — the minifier is **terser 5.47.1**, confirmed via `npx terser --version`); (2) copies the minified output over `public/embed.js`, **the file Next.js actually serves** at the `/embed.js` route. Editing `embed/src/embed.js` and skipping this script means production keeps serving the stale prior build — this exact rule is also stated in `CLAUDE.md` ("Embed Widget Build Rule") and enforced procedurally by `octively-change-control`. |
| `npm run db:generate` | `drizzle-kit generate` | Reads `lib/db/schema.ts`, diffs against `lib/db/migrations/meta/`'s tracked snapshots, writes new SQL files into `lib/db/migrations/` (26 migration files as of 2026-07-21, `0000_workable_nemesis.sql` through `0025_custom_domain_support.sql`, including same-numbered pairs like `0005_*`/`0005_roadmap_features.sql` and `0017_*`/`0017_sample_affiliate_platform_coupon.sql` — drizzle-kit numbers by generation order, not a strict single-file-per-number rule, so a duplicate number alone is not a conflict). **Known broken as of 2026-07-21: `meta/_journal.json` and the `meta/*_snapshot.json` files stop at migration 0016 — migrations 0017 through 0025 exist as real SQL but were never recorded in drizzle's own bookkeeping.** Running `db:generate` now diffs against the stale 0016 snapshot (9 migrations out of date) and fails non-interactively with `Error: Interactive prompts require a TTY terminal` (the `promptColumnsConflicts` step tries to ask a rename-vs-new-column question it can't resolve from the stale diff). No TTY-safe flag found. **Workaround for a simple additive change** (new nullable columns, no renames/type changes): hand-write the migration SQL file directly, following the plain `ALTER TABLE ... ADD COLUMN` style already used by 0017-0025, and skip `drizzle-kit generate` entirely for that change. **Do not attempt this workaround for anything with real ambiguity** (a rename, a type change, a drop) — hand-writing those correctly requires understanding drizzle's actual diff, which this broken snapshot state prevents. Full incident writeup: `octively-failure-archaeology` G3 (OPEN — the snapshot/journal gap itself is not fixed, needs a dedicated reconciliation pass reconstructing `meta/0017_snapshot.json` through `0025_snapshot.json` and backfilling `_journal.json`). |
| `npm run db:migrate` | `drizzle-kit migrate` | Applies pending SQL files from `lib/db/migrations/` to whatever `DATABASE_URL` in `.env.local` points at. `drizzle.config.ts` manually parses `.env.local` itself (comment: "drizzle-kit CLI doesn't load Next.js env files") — so drizzle-kit commands work off `.env.local` even outside the Next.js process. |
| `npm run db:studio` | `drizzle-kit studio` | Opens Drizzle Studio (browser DB browser) against the same `DATABASE_URL`. |

`drizzle.config.ts` config: `schema: './lib/db/schema.ts'`, `out: './lib/db/migrations'`, `dialect: 'postgresql'`. Confirmed: `npx drizzle-kit --version` → `drizzle-kit: v0.31.10`, `drizzle-orm: v0.45.2`.

## The two build gates (stated here, enforced by `octively-change-control`)

1. **`npm run build` must exit 0 before any `git push`.** Type-checking alone (`tsc --noEmit`) is
   explicitly insufficient per `CLAUDE.md` — `next build` catches things `tsc` alone does not
   (route-level static analysis, edge/runtime constraints).
2. **If `embed/src/embed.js` changed, run `npm run build:embed` BEFORE `npm run build`,** so the
   freshly-minified `public/embed.js` is what the Next.js build's `outputFileTracingIncludes` picks
   up for the `/embed.js` route (`next.config.ts:73-76`).

This skill only explains *what the commands do*; the *rule that you must run them, in what order,
before what git operations* is owned by `octively-change-control` — read it for the actual gate
mechanics and historical incidents tied to skipping them.

## Neon-from-CLI-under-WSL2 trap

**Symptom:** any standalone Node/`tsx` script that talks to Neon (migrations via `drizzle-kit`,
one-off seed scripts, etc.) fails with `fetch failed`, `ENETUNREACH`, or `ETIMEDOUT` — even though
`curl` to the same host works fine from the same shell.

**Root cause** (from `scripts/wsl-net-fix.mjs`'s own header comment): WSL2 advertises IPv6 (`AAAA`)
DNS records for dual-stack hosts like Neon but has no working IPv6 route out. Node's `undici`
"Happy Eyeballs" (`autoSelectFamily`) races IPv4 and IPv6 connections and the IPv6 attempt hangs or
fails, sometimes winning the race anyway.

**Fix — preload a dispatcher that disables the race, and force DNS to resolve IPv4 first:**
```bash
NODE_OPTIONS="--dns-result-order=ipv4first --import ./scripts/wsl-net-fix.mjs" npx tsx scripts/<your-script>.ts
```
What `scripts/wsl-net-fix.mjs` does, verbatim mechanism:
```js
import { Agent, setGlobalDispatcher } from 'undici'
setGlobalDispatcher(new Agent({ connect: { autoSelectFamily: false } }))
```
It replaces undici's global dispatcher with one that has `autoSelectFamily: false`, so only the
first DNS-resolved address is tried — paired with `--dns-result-order=ipv4first` so that first
address is always IPv4. Without the `--import`, this fix never loads and the race condition
returns. This only matters for scripts run directly with `node`/`tsx` outside the Next.js process;
`next dev`/`next build` are not documented to need this flag (not verified either way — if a
build-time Neon call ever fails the same way, try the same `NODE_OPTIONS` on the build command).

`drizzle-kit generate` does not touch the network (schema-only diff), but `drizzle-kit migrate` and
`drizzle-kit studio` do talk to `DATABASE_URL` — if either hangs on WSL2, retry with the env vars
above: `NODE_OPTIONS="--dns-result-order=ipv4first --import ./scripts/wsl-net-fix.mjs" npx drizzle-kit migrate`. (Not executed as part of this verification pass — DB-touching commands are out of scope for read-only verification.)

## Config specifics that trip people up

- **Tailwind v4 has no `tailwind.config.*` file.** `postcss.config.mjs` just plugs in
  `@tailwindcss/postcss` — all design tokens live as CSS custom properties directly in
  `app/globals.css` (confirmed: file starts with `@import "tailwindcss";` then custom
  `@keyframes`/utility classes, no `tailwind.config` import anywhere). `components.json`
  (shadcn CLI config) has `"tailwind": {"config": ""}` — an empty string, not a missing key —
  which is exactly why any shadcn CLI invocation has nothing to patch and is a second reason (on
  top of the WSL ENOTEMPTY trap above) to hand-write new `components/ui/*` files instead of
  running the generator. Full token/surface rules (`mkt-`/`adm-`/`prt-` prefixes, Sky-Teal only,
  JetBrains Mono scoping) belong to `octively-ui-surfaces`/`DESIGN.md`, not here.
- **`tsconfig.json`** — `strict: true`, `moduleResolution: "bundler"`, path alias `@/*` → repo
  root. `noEmit: true` (Next.js's own compiler emits, `tsc` is check-only here — reinforcing why
  `tsc --noEmit` alone is not the build gate: it can pass while `next build` still fails on
  route/runtime-specific constraints). `plugins: [{ "name": "next" }]` wires the Next.js TS plugin
  for editor support.
- **`eslint.config.mjs`** is flat-config (`eslint/config`'s `defineConfig`), not the legacy
  `.eslintrc`. Extends `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`,
  with `globalIgnores` restoring the framework's default ignores (`.next/**`, `out/**`,
  `build/**`, `next-env.d.ts`) that got overridden by the custom array — read the file if `npm run
  lint` seems to ignore/not-ignore something unexpected.
- **`vitest.config.ts` lives at `tests/vitest.config.ts`**, not the repo root — the `--config`
  flag in both `test` scripts points there explicitly. It uses `vite-tsconfig-paths` so the `@/*`
  alias resolves inside tests, `environment: 'node'`, and only globs
  `tests/integration/**/*.test.ts` — unit tests placed elsewhere will not run.

## Docker build parity — why local `npm run build` passing is not proof

`Dockerfile` is a 3-stage build (`deps` → `builder` → `runner`):

1. **`deps`** (`node:22-slim`): upgrades npm to v11, copies only `package.json` +
   `package-lock.json*` + `embed/package.json` (comment: "npm workspaces: the embed widget is a
   workspace, so its package.json must be present for `npm ci` to resolve it"), then runs `npm
   install` (not `npm ci` — comment explains cross-platform optional-dep entries like
   `@rolldown/binding-wasm32-wasi`'s pinned `@emnapi/core@1.10.0` are never written to the lock
   file on a linux-x64 generation machine, so `npm ci` would fail strict-mode verification; plain
   `npm install` resolves and skips incompatible optionals cleanly).
2. **`builder`**: copies the full repo, sets `NODE_ENV=production` and **`DOCKER_BUILD=1`** (this
   is what flips `next.config.ts`'s `output: process.env.DOCKER_BUILD ? 'standalone' : undefined`
   to `'standalone'` — a plain local `npm run build` never sets this and never produces a
   standalone bundle), declares `ARG`/`ENV` for every `NEXT_PUBLIC_*` var, then runs `npm run
   build:embed && npm run build`.
3. **`runner`**: copies only `public/`, `.next/standalone`, `.next/static`, plus a hand-picked set
   of native-module directories (`@huggingface`, `onnxruntime-node`, `onnxruntime-common`, `sharp`)
   with a comment warning that native `.node` binaries aren't reliably traced into the standalone
   bundle automatically — "if you ever see a runtime 'Cannot find module' for an embedding dep,
   copy the whole `/app/node_modules` instead." Runs as non-root `node` user, `CMD ["node",
   "server.js"]` (i.e. **not** `next start`).

**Why local and Docker can diverge even when both exit 0:**
- **`NEXT_PUBLIC_*` values are baked in at build time**, not runtime. Local `npm run build` bakes
  in whatever is in your shell/`.env.local` at the moment you run it; the Docker build bakes in
  whatever `ARG` values CI passes at image-build time. A value can be correct locally and wrong (or
  blank) in the image if CI's build-args aren't wired the same way — this exact class of bug is
  the documented root cause behind commits `bb6b66c`/`ac4e5d6` (BuildKit layer caching swallowing a
  `NEXT_PUBLIC_*` build-arg). Full var-by-var semantics and the build-arg pipeline are owned by
  `octively-config-and-flags`; this skill only flags that the *mechanism* (build-time inlining,
  not runtime env) is the reason "works locally, wrong in prod" happens.
- **`output: 'standalone'` is Docker-only** — a local `npm run build` + `npm run start` exercises a
  materially different server entry point than the Docker image's `.next/standalone/server.js`.
  Passing locally does not exercise the standalone tracing step at all.
- **Native modules are only present in the `runner` stage's hand-picked copy list.** If a new
  dependency needs a native addon and isn't added to that `COPY --from=builder` list, Docker will
  fail (or silently misbehave) in a way a local build cannot reveal, since local `npm start` uses
  the full `node_modules` tree, not the pruned Docker copy.
- **Node version drift** (v24 local vs. `node:22-slim` in Docker, see table above) is a plausible
  fourth source of divergence but is `UNVERIFIED` — no specific incident ties a build failure to
  this yet; keep it in mind if a build passes locally and fails only in CI with no other
  explanation.

None of the above was executed as part of authoring this skill (no Docker build was run — too slow
for read-only verification); the analysis is derived entirely from reading `Dockerfile`,
`next.config.ts`, and the CI-comment evidence cited above.

## Provenance and maintenance

Date-stamped: 2026-07-07, revised 2026-07-07 (migration ceiling 0021 → 0022, file count 24 → 25);
revised 2026-07-21 (migration ceiling 0022 → 0025, file count 25 → 26; documented the
`db:generate` TTY-prompt failure and the underlying journal/snapshot drift — see
`octively-failure-archaeology` G3). Re-verify these commands if this skill feels stale:

```bash
cd "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas"
node --version                                   # local Node version vs Dockerfile's ARG NODE_VERSION
npm --version                                    # local npm version vs Dockerfile's `npm install -g npm@11`
npx next --version                               # Next.js version (package.json pin vs actual resolved)
npx vitest --version                              # vitest version
npx drizzle-kit --version                         # drizzle-kit / drizzle-orm versions
npx --workspace=embed terser --version            # embed minifier version
grep -n "ARG NODE_VERSION" Dockerfile             # Docker's pinned Node version
grep -n '"workspaces"' -A2 package.json           # confirm embed is still the only workspace
sed -n '1,20p' package.json                       # full script list — diff against the table above
ls lib/db/migrations | tail -5                    # latest migration files (for db:generate/migrate claims)
grep -n "output:" next.config.ts                  # confirm DOCKER_BUILD standalone-output gate still exists
```

Also re-check if any of these have changed:
- `proxy.ts` host-branch logic (new subdomain added/removed) — re-read the whole file, not just the branch names.
- `.env.example` — new required vars for new subsystems; re-run the "does it throw at import or at call time" grep pass per var before updating the minimum-viable table.
- Any new `history/prompts/**` PHR mentioning `ENOTEMPTY`, `fetch failed`, or `shadcn` — these are the ground-truth source for the WSL traps section; re-grep before assuming this section is complete.
