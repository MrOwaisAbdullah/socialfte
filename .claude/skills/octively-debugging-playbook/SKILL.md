---
name: octively-debugging-playbook
description: Symptom-to-triage playbook for Octively's five costliest live-incident classes — CSP/proxy/subdomain routing bugs (404s only on one subdomain, CORS on navigation, "blocked by Content Security Policy" console errors, dashboard sidebar rendering on top of signup/login), deploy/build-time traps (changed an env var but production behavior is unchanged, embed widget serving stale JS, Dokploy deploy failing with ghcr.io "denied: denied" Login failed), payments/webhooks (PayFast ITN rejected or credits not granted, Lemon Squeezy 401 on webhook, double-granted or missing credits), WSL development environment failures (npm ENOTEMPTY during install, Neon scripts fail with "fetch failed"), and chat/widget/credits runtime issues (widget won't load on a client site, streaming reply stalls or arrives all at once, credits not debiting or not refunding, false-positive human handoff, 429 rate-limit errors). Load this skill when triaging any of those symptoms in this repo — it gives the cheapest diagnostic command to run first and the fork between the likely causes, before reaching for a deeper sibling skill.
---

# Octively Debugging Playbook

Five failure classes cause most real incidents in this repo. This skill is a triage tool: for
each symptom, run the **first check** command, read the result, and follow the fork it implies.
Do not start reading source files or guessing until the first check has narrowed the cause.

Every command below assumes you are in the repo root. The path has spaces — always quote it or
`cd` into it first:

```bash
cd "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas"
```

## How this playbook is organized

One table per failure class. Columns: the symptom as an engineer would type it into a bug
report, the exact first command to run, the most likely cause given that command's output, the
fix (or the wrong path to avoid), and which sibling skill to open for depth if the first check
doesn't resolve it.

---

## Class 1 — CSP / proxy / subdomain routing bugs

Routing for all four surfaces (`octively.com`, `admin.octively.com`, `app.octively.com`,
`affiliates.octively.com`) happens in one file: `proxy.ts` at the repo root (Next.js 16 —
`proxy.ts` replaced `middleware.ts`; a `middleware.ts` file has no effect). Security headers
including CSP live in `next.config.ts` `headers()`. **Read `proxy.ts` in full before touching
subdomain routing** — every guard in it exists because of a specific past incident, documented
inline as a comment above the guard.

| Symptom | First check | Likely cause | Fix / wrong path | Depth |
|---|---|---|---|---|
| A path 404s only on `admin.octively.com` or `app.octively.com`, works fine on `octively.com` | `grep -n "isStaticAsset\|startsWith('/dashboard')\|startsWith('/portal')" proxy.ts` | Missing **double-prefix guard**: the rewrite in `proxy.ts` prepends `/dashboard` or `/portal` to every path on that subdomain. If the requested path already starts with that prefix (e.g. a link literally points to `/dashboard/login` while already on `admin.octively.com`), it becomes `/dashboard/dashboard/login` → 404. Fixed once in commit `76e0667` ("guard against double-prefix rewrite on admin/app subdomains"). | Never hardcode `/dashboard/...` or `/portal/...` in a link/redirect meant to render on the matching subdomain — use a root-relative path with no prefix, the proxy adds it. If you must special-case a path, add it to the existing `!url.pathname.startsWith(...)` guard list in `proxy.ts`, don't write a new rewrite. | octively-architecture-contract (why 4-surface routing is one file) |
| A public asset (image, favicon, `robots.txt`) 404s only on `admin.`/`app.`/`affiliates.` subdomains | `grep -n "isStaticAsset" proxy.ts` | Static files referenced by absolute path (e.g. `/google-logo.png`) live at the app root, not under `/dashboard` or `/portal`. Without the extension guard, the subdomain rewrite prefixes them too (`/dashboard/google-logo.png` → 404). | Confirm the guard regex `/\.[a-zA-Z0-9]+$/` matches your asset's path — it skips rewriting anything whose last path segment has a file extension. If your asset path has no extension in the last segment (rare), reference it a different way rather than weakening the guard. | — |
| Browser console shows a CORS error only when **navigating from `octively.com`** to a dashboard/portal link (not on direct load) | Open Network tab, find the failing request, check if its URL has a `?_rsc=` query param | **RSC prefetch CORS**: Next.js Link prefetches trigger a background RSC fetch with `_rsc` in the query string. `proxy.ts`'s `octively.com` branch used to redirect these like normal navigation; the browser followed the 302 cross-origin to `admin.`/`app.octively.com`, which don't set `Access-Control-Allow-Origin: https://octively.com`, so the browser blocked it as CORS. Fixed in commit `2977a90` — the marketing-domain redirect branch now skips any request with `url.searchParams.has('_rsc')`. | If you see this again, confirm the `_rsc` skip is still present in the `octively.com` branch of `proxy.ts` (search `_rsc`). Do NOT "fix" this by adding CORS headers to admin/app for arbitrary origins — RSC prefetches are non-blocking by design; a failed one only means no preloaded data, not a broken app. | — |
| A visitor lands on `affiliates.octively.com` after a login-expiry redirect and gets a 404 instead of the login page | `grep -n "startsWith('/dashboard')" proxy.ts` (in the `affiliates.` branch) | `requireDeveloper()`'s session-expiry redirect appends `?reason=expired` to a `/dashboard/...` path. On the affiliates subdomain that path doesn't exist under `/affiliate/dashboard/...`. Guard added: if `url.pathname.startsWith('/dashboard')` while on `affiliates.`, `proxy.ts` redirects to `/affiliate/login` instead of rewriting. | If a new auth guard on another surface starts leaking a `/dashboard`-prefixed redirect target onto `affiliates.`, add the same catch: redirect (not rewrite) to that surface's own login. | octively-architecture-contract |
| Script/style/connect blocked with `Refused to load ... because it violates the following Content Security Policy directive` | `curl -sI https://octively.com/ | grep -i content-security-policy` then compare the origin in the browser error against the directive list in `next.config.ts` | A third-party origin (analytics beacon, tag manager, embed) isn't in the matching CSP directive's allowlist. Confirmed past cases: `*.google-analytics.com` missing from `script-src`/`connect-src` (commit `120b938`), `*.cloudflareinsights.com` missing from `script-src` (commit `88277db`). | Add the exact origin (with the narrowest useful wildcard, e.g. `https://*.vendor.com`) to the specific directive that failed (`script-src` for scripts, `connect-src` for fetch/beacon, `img-src` for images) in the `CSP` array in `next.config.ts`, not to `default-src`. Never blanket-add `unsafe-eval` or a bare `https:` to `script-src` to make an error go away — that reopens the XSS surface `specs/005-security-hardening/spec.md` closed. | octively-config-and-flags (full CSP directive catalog) |
| `/dashboard/embed-test` (the in-dashboard widget preview) fails to load `embed.js`, but production embed works fine | `curl -sI http://localhost:3000/dashboard/embed-test 2>/dev/null \| grep -i content-security-policy` (only meaningful in local dev) | Historical: two commits (`fcdce67`, `90ec013`) tried stripping CSP for this page under `0.0.0.0`/`localhost`/`127.0.0.1` because the dev origin didn't match `'self'`. Both were **reverted** by `6f13fa8` once the real bug was found: the embed-test script tag was built from `new URL(req.url).origin`, which resolves to the internal Docker IP behind the reverse proxy, not the public host. | If embed-test breaks again, do NOT re-add a CSP-stripping branch to `proxy.ts`. First check how the script `src` URL is built — it must come from the `Host` + `X-Forwarded-Proto` request headers (the public origin), not `req.url`. `admin.octively.com/embed.js` is same-origin in production, so CSP `'self'` already permits it once the URL is correct. | — |
| Site intermittently won't load in a browser (`ERR_CONNECTION_CLOSED` / session drops), works right after clearing cookies, then breaks again after a few login/logout cycles — affects both the primary browser AND a fresh Edge install, while `curl` and other devices work fine | `grep -n "domain: '.octively.com'\|oct_dev\|oct_client" lib/auth/index.ts` then check whether the `hooks.after` middleware gates on `host === 'octively.com'` | **Cross-subdomain cookie pollution.** The BetterAuth `hooks.after` middleware was setting marketing UI-hint cookies (`oct_dev` / `oct_client`) scoped to the parent domain `.octively.com` on EVERY auth route across ALL subdomains, with a 30-day `maxAge`. Logging in via `admin.octively.com` therefore wrote parent-domain cookies that accumulated across sessions and conflicted with the per-subdomain session cookies (see P3 in octively-failure-archaeology). | Fix pattern (commit `f43faf1`): the hint-cookie hook must ONLY fire on the main marketing host (`octively.com` / `www.octively.com`), never on `admin.` / `app.`; `maxAge` 24h not 30d; sign-out clears BOTH `oct_dev` and `oct_client`; `session.cookieCache` 1 min not 5. Do NOT remove the hook entirely (the marketing nav depends on it) — narrow its host guard. Parent-domain cookies are a global mutable namespace shared across every subdomain; write them very narrowly. | octively-failure-archaeology (entry P4), octively-architecture-contract |
| The dashboard sidebar / chrome (mobile "Open menu" button, admin tabs) renders **on top of** the signup or login page, even though the auth page itself is the correct content — happens on `admin.octively.com/signup` or `/login` but NOT on `admin.octively.com/dashboard/signup` | `grep -n "startsWith('/dashboard/login')\|AUTH_LEAVES\|isAuthLeaf" proxy.ts app/\(dashboard\)/layout.tsx components/dashboard/DashboardShell.tsx` — confirm the auth-redirect branch keeps the `/dashboard` prefix | **Proxy rewrite + `usePathname()` ambiguity.** `proxy.ts`'s `octively.com` branch redirects `octively.com/dashboard/signup` to `admin.octively.com/signup` (it strips the `/dashboard` prefix — the normal pattern for app pages, since the admin subdomain rewrite re-adds it). The admin subdomain then *rewrites* `/signup` → `/dashboard/signup` (correct content) while keeping the visible URL as `/signup`. But `usePathname()` from `next/navigation` returns the **visible (pre-rewrite) URL** — `/signup`, not `/dashboard/signup` — so the sidebar-hide logic that keyed on the full `/dashboard/signup` fell through and leaked the chrome. | Fix pattern (commit `2280b36`, layered on `86186d3` + `d56c288`): (1) in `proxy.ts`, keep the `/dashboard` prefix on redirect for auth paths (`/signup`, `/login`, `/dashboard/{login,signup,forgot-password,reset-password}`) so the browser lands on `admin.octively.com/dashboard/signup` directly — the admin rewrite guard skips paths already starting with `/dashboard`, so no rewrite, no ambiguity; (2) belt-and-suspenders, `DashboardShell` matches the *last path segment* against auth leaves instead of prefix-anchoring, and the `(dashboard)/layout.tsx` computes `isAuthPage` server-side from `x-invoke-path` (always the full `/dashboard/signup` post-rewrite) and passes it as a prop. Do NOT "fix" this by removing the admin subdomain rewrite — it's load-bearing for all the non-auth app pages. Root cause is NOT a cookie issue (that's P4). | octively-failure-archaeology (entry P5), octively-architecture-contract |

**Verify `proxy.ts` still matches this table** (it documents its own history in comments — read it
before assuming any of the above):
```bash
grep -n "Guard:\|CORS\|leaking\|double-prefix" proxy.ts
```

---

## Class 2 — Deploy / build-time traps

Deploy path: `git push origin master` → `.github/workflows/deploy.yml` builds a Docker image
with BuildKit, pushes to GHCR, then calls the Dokploy deploy API. **`NEXT_PUBLIC_*` vars are
baked in at build time as Docker build-args — they must be set as GitHub Secrets, not in
Dokploy's env panel** (Dokploy env vars are runtime-only and never reach a `NEXT_PUBLIC_*` var,
since inlining already happened during `next build` inside the image).

| Symptom | First check | Likely cause | Fix / wrong path | Depth |
|---|---|---|---|---|
| You changed a `NEXT_PUBLIC_*` GitHub Secret (e.g. `NEXT_PUBLIC_GA_MEASUREMENT_ID`), pushed, deploy succeeded, but production still shows the old value | `grep -n "no-cache-filters" .github/workflows/deploy.yml` — confirm it says `no-cache-filters: builder` | **BuildKit layer caching swallows build-arg changes.** A build-arg change alone does not invalidate Docker's cached `RUN npm run build` layer if no source file changed — so `next build` never re-runs with the new value baked in, and the image silently keeps the old inlined JS. This is why `no-cache-filters: builder` exists in the workflow (added across `bb6b66c` and `ac4e5d6`, the latter added a diagnostic step printing secret lengths to confirm the value reached the workflow at all). | If `no-cache-filters: builder` is missing or was removed, re-add it to the `docker/build-push-action@v6` step in `.github/workflows/deploy.yml`. If it's present and the value is still stale, next check GitHub Secrets themselves are set correctly (`ac4e5d6`'s diagnostic pattern: print `${#SECRET}` length, never the value, in a throwaway workflow step) — a secret configured with a typo'd name silently resolves to an empty string in the build-arg line. Do NOT try to fix this by clearing Dokploy's env panel — Dokploy runtime vars are irrelevant to `NEXT_PUBLIC_*`. | octively-build-and-env (full env var pipeline), octively-config-and-flags |
| You changed a **non-`NEXT_PUBLIC_*`** server-only env var (e.g. `PAYFAST_PASSPHRASE`, `LITELLM_DEFAULT_MODEL`) and production still behaves like the old value | Check Dokploy panel → app → Environment, confirm the var is set there (not just in `.env.example` or locally) | Server-only vars are runtime, read from Dokploy's env panel by the running container — not baked into the image. If it's set there but still stale, the container hasn't restarted since the change. | Set/update the var in Dokploy's Environment panel, then trigger a redeploy (Dokploy panel → Deployments → Redeploy, or push a new commit) — env panel changes alone do not restart a running container automatically in all Dokploy configurations. | octively-run-and-operate |
| You edited `embed/src/embed.js`, it works when you test the raw route, but the widget on a live client site still shows the old behavior | `cmp public/embed.js embed/dist/embed.min.js` — if they differ, that's the bug | **Stale embed dist.** `/embed.js` (the route real widgets load — `app/embed.js/route.ts`) `readFileSync`s `public/embed.js`, the *committed, minified* file — not your edited source. `npm run build:embed` (defined in `package.json`: `next build --workspace=embed && cp embed/dist/embed.min.js public/embed.js`) is the only thing that regenerates it. Root-caused in commit `df6c44c` ("read public/embed.js not gitignored embed/dist; fix outputFileTracingIncludes route key") — an earlier version read `embed/dist/` directly, which is `.gitignore`d and simply absent in the deployed image. | Run `npm run build:embed` BEFORE `npm run build`, and commit the resulting `public/embed.js` diff alongside your `embed/src/embed.js` source change. This is a non-negotiable project rule (see CLAUDE.md "Embed Widget Build Rule") — there is no path where skipping it is safe. | octively-build-and-env |
| `npm run build` passes locally, GitHub Actions build succeeds, Dokploy shows "deployed," but the live site still looks/behaves like the previous release | `curl -sI https://octively.com/ | grep -i "cf-cache-status\|age:"` then check the deployed image's git SHA against your latest commit (Dokploy panel → Deployments → latest → image tag, which is `github.sha`) | Either Cloudflare's edge cache is serving a stale cached response (unlikely for HTML but common for static assets), or the Dokploy deploy actually picked up an older image tag/didn't trigger. | For a cache suspicion, purge the specific URL in Cloudflare (or bypass with a cache-busting query param to confirm). For a stuck deploy, check the GitHub Actions run actually completed both `build` and `deploy` jobs (the `deploy` job calls the Dokploy API with `applicationId` — a wrong `DOKPLOY_APP_ID` secret deploys nothing and reports success). | octively-run-and-operate |
| Dokploy deploy **fails** with `Error response from daemon: Get "https://ghcr.io/v2/": denied: denied` and `❌ Login failed` in the deploy logs; production is frozen on the last image that *did* pull (so a freshly-pushed fix never goes live even though the build succeeded) | Open the Dokploy deploy logs and look for the `Pulling ghcr.io/mrowaisabdullah/owflex-chat:latest` line — if it's immediately followed by `denied: denied` / `Login failed`, the registry auth is the problem, not the image | **Expired/revoked GHCR Personal Access Token.** The Dokploy app is configured as a **Docker** provider pulling `ghcr.io/<owner>/owflex-chat:latest`, authenticated with a GitHub **classic PAT** (scope `read:packages`) pasted into the app's registry credentials (see `docs/vps-dokploy-setup.md` §6). GitHub classic PATs expire on the date chosen at creation; an expired/revoked token makes every `docker pull` return `denied`, so the container never updates. | Generate a fresh classic PAT at `https://github.com/settings/tokens/new` with scope `read:packages` (set "No expiration" or a long expiry + a calendar reminder), then update it in the Dokploy app's Docker Registry credentials (Registry URL `ghcr.io`, Username = GitHub username, Password = new PAT) → Save → Redeploy. Do NOT switch the app to the "Github"/"Git" provider to "work around" a pull failure — those providers clone the repo and rebuild from source, bypassing the GHCR image (so `NEXT_PUBLIC_*` build-args / Sanity / analytics break) per the §6 CRITICAL warning. Confirm the workflow's `deploy` job DID trigger Dokploy separately (a failed pull can also mask a `DOKPLOY_*` secret misconfig). | octively-build-and-env, octively-run-and-operate |

**Verify the build-arg pipeline matches this table:**
```bash
grep -n "NEXT_PUBLIC" .github/workflows/deploy.yml Dockerfile
```

---

## Class 3 — Payments / webhooks

Two gateways: PayFast (`lib/billing/payfast.ts`, webhook at `app/api/webhooks/payfast/route.ts`)
for PKR — its webhook is called an ITN (Instant Transaction Notification, PayFast's
server-to-server payment callback) — and Lemon Squeezy (`lib/billing/lemon-squeezy.ts`, webhook at
`app/api/webhooks/lemon-squeezy/route.ts`) for USD, verified via HMAC (hash-based message
authentication code) signatures. Both webhooks are idempotent via a
`refId`-keyed lookup against `credit_transactions` (unique on `refId`) before granting anything.
Full incident history for the two HIGH-severity payment bugs fixed here: `specs/005-security-hardening/spec.md`.

| Symptom | First check | Likely cause | Fix / wrong path | Depth |
|---|---|---|---|---|
| PayFast ITN arrives, org gets zero credits, no error visible to the payer | Check server logs for `[payfast] invalid ITN` or `[payfast] amount mismatch` (both `console.error` in `app/api/webhooks/payfast/route.ts`) | Two possible fail-closed paths in `verifyItn()` (`lib/billing/payfast.ts`): (1) `PAYFAST_PASSPHRASE` env var unset → signature check always fails (deliberate — an unset passphrase makes the MD5 signature computable from semi-public merchant fields, so it fails closed rather than trusting a forgeable ITN); (2) `amount_gross` from PayFast doesn't match the server-computed `CREDIT_PACKS[packId].pkr` / `PLAN_PRICES_PKR[planId]` within 1 cent — this is the amount-tampering guard, since the outgoing checkout URL's `amount` param is unsigned and a user can intercept and lower it before paying. | If cause (1): set `PAYFAST_PASSPHRASE` in Dokploy env panel — this is mandatory for any real PayFast traffic, not optional hardening. If cause (2): do NOT "fix" it by trusting `amount_gross` — that reopens HIGH-1 from `specs/005-security-hardening/spec.md`. The correct expected amount always comes from the server-side `CREDIT_PACKS`/`PLAN_PRICES_PKR` constants, never from anything in the ITN payload. | octively-unit-economics-toolkit (worked signature-verification example) |
| Same PayFast/Lemon Squeezy payment appears to grant credits twice | `SELECT * FROM credit_transactions WHERE ref_id = '<paymentId or orderId>';` (via `npm run db:studio` or a direct query) — if more than one row, idempotency broke | Both webhooks check `SELECT ... FROM credit_transactions WHERE refId = ...` before granting, and `logTransaction()` in `lib/credits/index.ts` inserts with `.onConflictDoNothing()` guarded by a UNIQUE constraint on `refId`. Double-grant almost always means the pre-check query and the insert used **different ref values** (e.g. the m_payment_id parsing changed format between the check and the log call) rather than the constraint being absent. | Confirm the exact string passed to the `eq(schema.creditTransactions.refId, ...)` check matches byte-for-byte what's passed to `creditLib.logTransaction(orgId, tokens, 'purchase', <refId>)` a few lines later in the same route handler — for PayFast that's `result.paymentId`, for Lemon Squeezy `orderId`/`subscriptionId`. Never remove the pre-check "fast path" thinking the DB constraint alone is enough — the constraint prevents a duplicate row, but by the time it fires you've already done the credit `refund()`/`upgradePlanCredits()` side effect once per request, so double-firing before the constraint check still double-grants. | octively-validation-and-qa (money-flow test obligations) |
| Lemon Squeezy webhook returns 401 for every event | `echo -n "$LEMON_SQUEEZY_WEBHOOK_SECRET" | wc -c` (should be non-empty and match what's configured in the LS dashboard's webhook signing secret field) | `verifyWebhook()` in `lib/billing/lemon-squeezy.ts` computes an HMAC-SHA256 of the raw body using `LEMON_SQUEEZY_WEBHOOK_SECRET` and compares it (`timingSafeEqual`) against the `x-signature` header. A 401 on every event means the secret configured in Dokploy doesn't match the one in the Lemon Squeezy dashboard, or the raw body was re-serialized (e.g. re-`JSON.stringify`'d) before hashing, changing the byte content. | Re-copy the signing secret from the Lemon Squeezy dashboard into Dokploy exactly. Confirm the route handler still reads the body via `Buffer.from(await req.arrayBuffer())` (the raw bytes) before any JSON parsing — `verifyWebhook` must run against those same raw bytes, never a re-encoded version. | — |
| A plan upgrade webhook fires but the org's credit balance looks wrong afterward (not simply "full new allocation") | `SELECT plan, delta, reason FROM credit_transactions WHERE org_id = '<orgId>' ORDER BY created_at DESC LIMIT 5;` | This is by design, not a bug: `upgradePlanCredits()` in `lib/credits/index.ts` uses `INCRBY` with `delta = toAlloc - fromAlloc`, preserving whatever balance the org had accumulated — it does NOT reset to the new plan's full allocation. A org that used most of its free-tier credits before upgrading will NOT show the agency plan's full 750M after upgrade; it shows old-balance + delta. | Confirm this is the actual (intended) behavior before treating it as a bug. If an org's balance needs a hard reset regardless of history, that's `resetToPlantAllocation()` (the admin "Sync Credits" action), a different and deliberately separate code path — do not silently swap `upgradePlanCredits` for a reset without owner sign-off, since it changes what upgrading means for every org. | octively-domain-reference (credits accounting model) |

**Verify webhook idempotency columns still exist:**
```bash
grep -n "refId" lib/db/schema.ts 2>/dev/null || grep -rn "creditTransactions" lib/db/schema*.ts | grep -i refid
```

---

## Class 4 — WSL environment

The dev machine is WSL2 on a Windows `D:` drive. Two recurring, well-understood failure modes.

| Symptom | First check | Likely cause | Fix / wrong path | Depth |
|---|---|---|---|---|
| `npm install` (or `npm ci`) fails with `ENOTEMPTY: directory not empty, rename ...` | `ls node_modules/.tmp-* 2>/dev/null` or re-run the exact same install command once — if it succeeds on retry, this is it | WSL2's filesystem (especially across the 9p/DrvFs boundary to a Windows `D:` path) doesn't guarantee atomic directory renames the way native Linux ext4 does. npm's install process relies on atomic renames when swapping in a freshly-extracted package directory; under load (many packages installing concurrently) this races and fails. | Install in smaller batches rather than one large `npm install` of everything at once (e.g. install new deps a few at a time). Check for and remove stale `node_modules/.tmp-*` / partially-extracted directories left over from a previous failed install before retrying — these can make the next attempt fail even in the same spot. Do not switch to `--force` or `--legacy-peer-deps` to work around this — it's a filesystem race, not a dependency conflict, and those flags mask a different class of problem. | octively-build-and-env |
| A Neon/DB script (e.g. under `scripts/`) fails with `fetch failed` even though `psql`/`curl` reach the same host fine | Run the same script with the documented preload: `NODE_OPTIONS="--dns-result-order=ipv4first --import ./scripts/wsl-net-fix.mjs" npx tsx scripts/<your-script>.ts` — if it now succeeds, this was it | WSL2 advertises IPv6 (AAAA) DNS records for dual-stack hosts like Neon, but has no working IPv6 route out. Node's undici HTTP client races IPv4 and IPv6 ("Happy Eyeballs" `autoSelectFamily`) and the IPv6 attempt hangs/fails with `ENETUNREACH`/`ETIMEDOUT`, even though the IPv4 path works. | Confirm `scripts/wsl-net-fix.mjs` still exists and still calls `setGlobalDispatcher(new Agent({ connect: { autoSelectFamily: false } }))` — this disables the race so undici uses the first resolved address, paired with `--dns-result-order=ipv4first` so that address is IPv4. Any new one-off Node script that talks to Neon (or another dual-stack host) directly needs the same `NODE_OPTIONS` invocation; it is not global to the repo, it must be passed per-command. | octively-build-and-env |

**Verify the WSL fix script still matches this description:**
```bash
cat scripts/wsl-net-fix.mjs
```

---

## Class 5 — Chat / widget / credits runtime

The chat pipeline is one large handler: `app/api/v1/chat/route.ts` (SSE streaming, ~750 lines).
Supporting modules: `lib/credits/index.ts` (debit-first ledger), `lib/credits/grace.ts` (grace
period on exhaustion), `lib/ratelimit.ts` (Upstash sliding-window limiters), `lib/ai/uncertainty.ts`
(regex-based "I don't know" detector that drives human handoff). The widget itself is
`embed/src/embed.js` (source) → built to `public/embed.js` (served) via `npm run build:embed`.
Public endpoints are served with CORS `Access-Control-Allow-Origin: *` on exactly five routes
(`/api/v1/chat`, `/api/v1/widget-config`, `/api/v1/leads`, `/api/v1/rating`, `/api/v1/feedback`)
— see `next.config.ts` `headers()`.

| Symptom | First check | Likely cause | Fix / wrong path | Depth |
|---|---|---|---|---|
| Widget doesn't render at all on a third-party client site (no error visible to the site owner) | Open the client site's console, look for a fetch failure to `/api/v1/widget-config?key=...` or `/api/v1/chat` — note the exact error and status code | Two independent gatekeepers can block this: (1) The `<script data-key="...">` tag's embed key doesn't match any bot (`embedKeyMatch()` in `lib/bots/embed-key.ts` checks the current key OR a previous key still inside its rotation grace window) → widget-config returns 404 `NOT_FOUND`; (2) the chat POST's origin guard in `app/api/v1/chat/route.ts` — if the bot has no `storeUrl` configured in its widget config, the origin lock defaults to **deny all external origins** (`STORE_URL_REQUIRED`, 403) specifically so a leaked embed key can't be used to burn credits on an arbitrary site until the developer sets a Store URL. | For (1): confirm the embed key in the `<script>` tag matches the bot's current `embedKey` (or was rotated within the grace window — check `embedKeyRotatedAt` on the bot row). For (2): this is often "working as intended" — the developer must set the bot's Store URL in Settings before the widget will respond on any external site; walk them to that setting rather than loosening the origin check. Do not relax `STORE_URL_REQUIRED` to accept any origin — that's the exact SSRF-adjacent leak it was built to close. | octively-architecture-contract |
| Streaming reply arrives all at once instead of token-by-token (or times out around 10s on very long replies) | `curl -sI https://admin.octively.com/api/v1/chat` (or inspect response headers in Network tab on an actual chat) — look for `content-encoding` | If the response is being gzip-compressed/buffered by an intermediary, the whole SSE stream gets bundled and delivered at once instead of streaming — the route explicitly sets `'Content-Encoding': 'none'` and `'X-Accel-Buffering': 'no'` to prevent this, but a reverse proxy in front of the app (Traefik/Cloudflare) can still buffer if misconfigured. A hard 10s cutoff would instead point at `maxDuration` — the route sets `export const maxDuration = 60` specifically because the platform default (10s) truncates long replies. | Confirm both headers are still present in `app/api/v1/chat/route.ts`'s streaming `Response`. If a proxy layer is buffering despite the headers, that's a Traefik/Cloudflare config issue, not an app bug — check for a proxy-level buffering setting overriding the app's headers. If truncation happens near 60s instead of 10s, the LLM call itself is too slow (routing/model issue), not a config issue. | octively-run-and-operate (Traefik config) |
| Credits appear to debit but never refund after a failed/errored chat request | Check `credit_transactions` for the org around the failure time: does a negative `chat_debit` row exist with no offsetting positive row shortly after? | The debit-first pattern in `app/api/v1/chat/route.ts` debits an *estimate* before calling the LLM (`creditLib.debit(bot.orgId, estimatedTokens)`), then on any error inside the streaming `catch` block calls `creditLib.refund(bot.orgId, estimatedTokens)` — full refund of the original estimate, not the actual (partial) usage. If credits are draining without seeing a compensating "chat_debit" reversal, check whether the failure happened in the **outer** `try/catch` (before the stream ever opened) instead of the **inner** stream `catch` — the outer catch path returns a 500 JSON response and never runs the refund logic, because a debit only happens after the outer try body's DB lookups succeed. **Second, independent cause — smart-routing refund asymmetry:** if the failed request was smart-routed to a `complex` classification (check `routing_decisions.classification` / `credit_cost` for that message), the router (`lib/ai/router.ts`) net-debited `5 * estimatedTokens` (debits `baseEstimate * 5`, refunds only `baseEstimate` on the strong-model success path), but the stream-failure refund at `app/api/v1/chat/route.ts:690` is hardcoded to `estimatedTokens` — the base estimate only. A failed strong-model call therefore under-refunds by 4x the base estimate. This is a known, documented, unfixed bug (`octively-architecture-contract` weak point #8) — do not explain it away via the outer/inner-catch check alone. | If you find a code path that debits but has no matching refund on error, that's a real bug — every debit call must have a corresponding refund on every failure branch reachable after it. Do not "fix" a suspected double-refund by removing the refund from the stream's catch block — that's the only refund path for streaming failures; removing it silently leaks credits on every LLM error. | octively-unit-economics-toolkit |
| A conversation gets incorrectly flagged for human handoff (or the reverse — a genuinely stuck bot never escalates) | `grep -n "UNCERTAINTY_RE" lib/ai/uncertainty.ts` and manually test the flagged message against that regex | `flagIfUnanswered()` is a plain regex match against phrases like "i don't know", "i can't help", "outside my knowledge" — it has no semantic understanding. False positives: the bot legitimately uses one of these phrases while still being helpful (e.g. "I don't know your exact size, but here are some general options..."). False negatives: the bot is unhelpful using phrasing the regex doesn't cover. | This is a known-limited heuristic, not a bug to "fix" by making the regex more complex ad hoc — false positives are handled downstream by the flag only mattering when `handoffEnabled === true` on that bot's widget config; if a specific agency finds it triggers too often, capture concrete transcript examples first before changing the shared regex (this file is used platform-wide, not per-bot). | octively-domain-reference |
| Widget requests return 429 `RATE_LIMITED` from `/api/v1/chat` under normal (non-abusive) traffic | `grep -n "slidingWindow" lib/ratelimit.ts` — confirm the current limit for the affected route | `getChatRatelimit()` in `lib/ratelimit.ts` caps chat at 30 requests/minute **per IP** (`Ratelimit.slidingWindow(30, '1 m')`), independent of the per-org credit/plan limits. A shared office/NAT IP with several concurrent visitors on the same client site can exhaust this even though no single visitor is abusive. Leads and tools-AI have their own separate, lower limits (10/min and 5/min respectively). | If legitimate shared-IP traffic is being throttled, this is a product tradeoff (protects against abuse of a leaked embed key) — raising the limit is a deliberate, owner-approved change, not a quick patch; route it through `octively-change-control`. Do not confuse this with the **auth** rate limit (`/get-session`, 30 req/60s, configured separately in `lib/auth/index.ts`, raised once in commit `88277db`) — they are different limiters guarding different routes. | octively-change-control |

**Verify the CORS-enabled public route list still matches this table:**
```bash
grep -n "source: \"/api/v1" next.config.ts
```

---

## When NOT to use this skill

- Need the **narrative** of a past incident (what broke, in what order, who found it, what was
  tried and reverted) rather than a live triage step → `octively-failure-archaeology`.
- Need to **run** dev, understand the deploy pipeline end-to-end, or operate Dokploy/cron/DNS →
  `octively-run-and-operate`.
- Need to **set up** the dev environment from scratch on a new machine (not diagnose a broken
  one) → `octively-build-and-env`.
- Need a **complete catalog** of every env var/feature flag and how to add a new one →
  `octively-config-and-flags`.
- Need to **measure** something (DB queries, logs, funnel data) with runnable tooling rather than
  triage a specific symptom → `octively-diagnostics-and-tooling`.
- Need to decide **whether a proposed fix is allowed** (owner-approval gates, non-negotiables) →
  `octively-change-control`.
- Need the **domain math** behind credits/routing/RAG, not just where the code lives →
  `octively-domain-reference`.
- The symptom isn't one of these five classes at all (e.g. a UI/design regression, a failing
  vitest test unrelated to money/tenant-isolation, a copy/marketing-claim question) — this skill
  will not help; search the repo directly or use the matching sibling from the 16-skill index in
  `octively-change-control`.

---

## Provenance and maintenance

Authored 2026-07-06/07, revised 2026-07-07 (corrected `NEXT_PUBLIC_*` build-arg count 8→9; added
smart-routing refund-asymmetry cause to the Class 5 credits row). All file paths, commit hashes,
and behavior claims in this playbook were
verified directly against the repository at that date (source reads + `git log`/`git show` +
one live `curl` against production). Re-verify anything that looks stale using the commands
below — this table exists so a future reader can re-check facts without re-deriving them.

| Volatile fact | Re-verify with |
|---|---|
| `proxy.ts` guards still match the 5 documented incidents | `grep -n "Guard:\|CORS\|leaking\|double-prefix" proxy.ts` |
| CSP directive contents (allowed third-party origins) | `grep -n "^const CSP" -A 10 next.config.ts` |
| CORS-wildcarded public API routes (currently 5) | `grep -n "source: \"/api/v1" next.config.ts` |
| `no-cache-filters: builder` still present in the build workflow | `grep -n "no-cache-filters" .github/workflows/deploy.yml` |
| `NEXT_PUBLIC_*` build-args list (currently 9 vars) | `grep -n "NEXT_PUBLIC" .github/workflows/deploy.yml Dockerfile` |
| `embed/dist/embed.min.js` and `public/embed.js` are in sync | `cmp public/embed.js embed/dist/embed.min.js` (no output = identical) |
| Chat rate limit (currently 30/min/IP) | `grep -n "slidingWindow" lib/ratelimit.ts` |
| Auth `/get-session` rate limit (currently 30/60s) | `grep -n "get-session" -A 2 lib/auth/index.ts` |
| PayFast amount-tampering + passphrase guards still present | `grep -n "amountValid\|PAYFAST_PASSPHRASE" lib/billing/payfast.ts` |
| Lemon Squeezy HMAC verification still uses `timingSafeEqual` | `grep -n "timingSafeEqual" lib/billing/lemon-squeezy.ts` |
| Credit debit-first + refund-on-failure pattern intact in chat route | `grep -n "creditLib.debit\|creditLib.refund" app/api/v1/chat/route.ts` |
| WSL net-fix preload script still matches description | `cat scripts/wsl-net-fix.mjs` |
| Referenced incident commits still resolve to the described change | `git show --stat <hash>` for `2977a90`, `76e0667`, `120b938`, `88277db`, `fcdce67`, `90ec013`, `6f13fa8`, `bb6b66c`, `ac4e5d6`, `df6c44c` |
