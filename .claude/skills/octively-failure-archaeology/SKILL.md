---
name: octively-failure-archaeology
description: Chronicle of every settled battle in the Octively repo, load BEFORE re-investigating anything that smells familiar. Trigger on symptoms like "config change not showing in prod", "NEXT_PUBLIC var empty / hostless http:/// link", "Sanity not configured in prod", "embed.js 404 or stale widget", "CSP blocked script", "double-prefix /dashboard/dashboard 404", "CORS error on prefetch", "credits stuck at zero", "PayFast webhook accepted wrong amount", "session wiped after logging into portal", "site intermittently unreachable in browser but works in curl / after clearing cookies (cross-subdomain cookie pollution, entry P4)", "dashboard sidebar / chrome rendering on top of signup or login page (proxy rewrite + usePathname ambiguity, entry P5)", "npm ci fails in Docker", "ENOTEMPTY on WSL", "fetch failed against Neon", "drizzle-kit generate fails with Interactive prompts require a TTY terminal", "db:generate hangs or prompts about column conflicts"; and on tasks like proposing RabbitMQ / React Query / flow builder / voice / Netlify / Firecrawl / shadow DOM / a similarity threshold (all previously rejected). Also load before reviving branches 001/002/004/release or re-litigating any ADR.
---

# Octively Failure Archaeology

This is the incident ledger for the Octively repo (405 commits, 2026-05-14 to 2026-07-06).
Every entry is: **Symptom -> Root cause -> Evidence -> Status**. If your bug or idea matches an
entry here, read the evidence commit before writing any code. Do not re-fight settled battles.

Verify any hash before trusting it:

```bash
cd "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas"
git log -1 --format="%h %ci %s" <hash>        # confirm the commit exists
git show <hash> --stat                         # see what it touched
git log --format=%B -1 <hash>                  # full message (root-cause writeups live here)
```

Status legend: **FIXED** (bug gone, fix in master) · **FENCED** (guard/process rule prevents recurrence) ·
**SETTLED** (decision made, do not reopen without new evidence) · **OPEN** (known, unfixed) ·
**SUPERSEDED** (whole subsystem replaced).

## Index by subsystem

| Subsystem | Entries | Worst status |
|---|---|---|
| Pre-history (v6 death) | A1 | SETTLED |
| Proxy / subdomains | P1 P2 P3 P4 P5 | FIXED |
| CSP | C1 C2 C3 C4 | FIXED (recurring class) |
| Deploy: Netlify era | N1 N2 N3 N4 N5 | SUPERSEDED |
| Deploy: Docker/VPS era | V1 V2 V3 V4 V5 V6 V7 | FENCED |
| Embed widget | E1 E2 E3 E4 E5 E6 | E6 OPEN |
| RAG / embeddings | R1 R2 R3 R4 R5 | FIXED |
| Credits | CR1 CR2 CR3 CR4 | FIXED |
| Payments / security audit | S1 S2 S3 S4 S5 | FIXED (spec 005) |
| Auth / sessions / invites | AU1 AU2 AU3 AU4 | FIXED |
| Chat / prompt quality | CH1 CH2 CH3 | FIXED |
| Server actions | SA1 | FIXED |
| WSL dev environment | W1 W2 | FENCED |
| Repo hygiene | G1 G2 G3 | G3 OPEN |
| Demo video | DV1 | FIXED |
| Rejected/deferred approaches | table at bottom | SETTLED |
| Dead branches | table at bottom | SETTLED |

---

## Era 0 — Before this repo: the v6 death (SETTLED)

**A1 · v6 died from over-engineering.** The previous incarnation planned a "sovereign, ONNX-powered,
multi-tenant, RabbitMQ-queued platform" before a single user existed; Phase 1 needed 6+ components
before Hello World and nothing shippable in under 2 weeks. Evidence: `docs/owflex_master_plan_v7.md`
section "Why v7 Exists: Lessons from v6" (lines 13-26); `.specify/memory/constitution.md` line 37
("v6 died because code grew before understanding was established"). Consequence: the entire
"What NOT to Build" list in `CLAUDE.md` and the YAGNI/KISS constitution rules are v6's tombstone.
Status: SETTLED. Any proposal that adds infrastructure ahead of demand must answer to this entry.

## Era 1 — MVP bootstrap on Vercel (2026-05-14 to 05-24)

**AU1 · trustedOrigins whack-a-mole.** Symptom: auth requests rejected on every new deploy URL.
Cause: BetterAuth `trustedOrigins` was enumerated per-URL; each Vercel preview / apex domain needed
its own commit (b0151f9, 255240f, 4a40622 wildcard, 85c47b7, b8432b8, bed7768) plus a failed
middleware-CORS detour (62430cb, reverted into the auth handler in 0d29cf5) and removal of a
hardcoded client baseURL (730672c). Status: FIXED (wildcards + current-origin client). Lesson:
never hardcode origins; extend the wildcard list, do not add ad-hoc CORS middleware.

**E1 · embed.js 404 on Vercel.** Symptom: `<script src=".../embed.js">` returned 404 in production.
Cause: Vercel's CDN intercepts `.js` paths as static assets before Next.js functions run.
Fix chain: serve via App Router route (880d2e3), then extension-free `/api/embed` (ec6c904).
Status: SUPERSEDED by VPS serving, but the route-handler pattern survives in `app/embed.js/route.ts`.

**E2 · Shadow DOM added then removed.** Symptom: widget invisible on client sites after shipping
"shadow DOM isolation + branding tamper protection" (8e824b6). Cause: closed shadow root broke
rendering and complicated the serve path. Reverted to standard DOM injection with layered
`!important` inline styles + MutationObserver branding protection (900350f, then restored the last
known-good structure from fbebe25 in 00a5464). Status: SETTLED. Do NOT reintroduce shadow DOM;
the sanctioned isolation upgrade is the iframe sandbox (E6, still open).

**SA1 · Platform prompt would not save (3-attempt saga).** Symptom: admin-set platform prompt
ignored by the chatbot / save silently failing. Cause: file-level `'use server'` turned a plain DB
query into an action (b8c3d90); then action-refs passed as client-component props failed to
serialize (0eedf0b); final fix rewrote the page as a native `<form action={...}>` in a Server
Component (66b1268). Status: FIXED. Lesson: server actions belong inline in Server Components with
native form actions; never pass action references through client props here.

**AU2 · Client invite flow saga.** Symptoms: invite links failing login, duplicate emails, phantom
orgs, stale role in cookie cache. Fix chain: client-side signup + link fallback (54efbdb), existing
credentials sign-in (e250630), bypass BetterAuth cookie cache by reading role from DB (793c56c),
developer+client same-email sandbox allowance (12139e6). Status: FIXED. Lesson: BetterAuth's
cookie cache serves stale roles; role-sensitive guards must read the DB.

## Era 2 — Netlify production era (2026-05-24 to 06-15) — SUPERSEDED subsystem

Netlify is DECOMMISSIONED (`docs/production-deployment.md`: "Netlify is decommissioned").
`netlify.toml` still exists at repo root as a fossil. The CLAUDE.md Netlify-budget section is stale
drift. These entries matter only as lessons and as explanation for odd repo artifacts.

**N1 · First 3 production deploys all failed (2026-05-24).** #1: Netlify auto-picked the `embed/`
npm workspace as build root (fixed with `base=.`, 9d8ff2d). #2: missing Resend env var.
#3: secrets scanner false-positives. Evidence: `docs/netlify-budget.md` deploy log. Status: SUPERSEDED.

**N2 · Secrets-scanner whack-a-mole.** Symptom: repeated build failures on NON-sensitive env vars
(NEXT_PUBLIC_SANITY_*, BREVO_FROM_EMAIL...). Cause: Netlify secrets scan flags any env value found
in output; the dashboard override did NOT beat `netlify.toml` (deploy #10 failed on exactly that).
Fixes: 7765b4d, 4804d54, 39f10cd, 3c80edb (all edits to SECRETS_SCAN_OMIT_KEYS in netlify.toml).
Cost: 3 wasted deploys of a 20-deploy monthly budget. Status: SUPERSEDED.

**N3 · Co-Authored-By trailers blocked builds.** Symptom: Netlify free plan counts every git
co-author as a separate contributor and blocks builds on private repos. Fix: permanent ban on
Co-Authored-By trailers (94fbb80, rule persists in CLAUDE.md "Commit Message Rules"). Status:
FENCED. The ban survives Netlify's death; see `octively-change-control` before committing.

**N4 · Budget exhaustion forced the VPS migration.** 15 credits per deploy on a 300-credit/month
free plan; by Jun 12 the log reads "~17cr remaining... OVER BUDGET" and "NO MORE DEPLOYS"
(ed4b3c8, 616bbd5). This scarcity, not preference, drove the Hetzner/Dokploy migration (Era 4).
Evidence: `docs/netlify-budget.md` full log with 6 failed deploys itemized. Status: SUPERSEDED.

**N5 · release branch + vercel remote retired.** CI simplified to origin/master only (2d4868e,
2026-06-17). The local/remote `release` branch is frozen at a25071d (2026-06-12). Status: SETTLED.
`git push origin master` is the only production push (see `octively-change-control`).

**P1 · Proxy double-prefix 404.** Symptom: `admin.octively.com/dashboard/login` -> 404. Cause:
proxy rewrote paths already carrying `/dashboard` to `/dashboard/dashboard/login`; also `app/proxy.ts`
existed in the WRONG location (must be project root in Next.js 16). Fix: prefix guard + move (76e0667).
Status: FIXED. Any proxy edit must preserve the "already-prefixed" guard.

**P2 · Canonical subdomain routing + cookie scope.** Symptom: `octively.com/dashboard/*` served
duplicate surfaces; portal login cross-link 404'd (relative link got rewritten to
`/portal/dashboard/login`). Fix: prod-only redirects to the canonical subdomain, skipping `/api/*`
so OAuth callbacks survive (6daf319). Status: FIXED.

**P3 · Shared session cookie wiped admin session.** Symptom: logging into the client portal logged
you OUT of the admin dashboard. Cause: `crossSubDomainCookies` (from P2) scoped one session cookie
to `.octively.com`. Fix: removed it, per-subdomain cookies, Google login removed from portal
(3867470, Netlify deploy #15). Status: FIXED/SETTLED: admin and portal sessions are intentionally
separate; do not re-enable cross-subdomain cookies.

**P4 · Marketing hint-cookie hook polluted cross-subdomain cookies (2026-07-24).** Symptom: the
marketing site (`octively.com`) and dashboard (`admin.octively.com`) intermittently failed to load
in the browser with `ERR_CONNECTION_CLOSED`-style failures; the site worked right after clearing
cookies, then broke again after a few login/logout cycles. Affected both the primary browser AND
a fresh Edge install. Cause: the BetterAuth `hooks.after` middleware in `lib/auth/index.ts` set
UI-hint cookies (`oct_dev` / `oct_client`) scoped to `.octively.com` on EVERY auth route across
ALL subdomains (not just the marketing site), with a 30-day `maxAge`. Logging in via
`admin.octively.com` therefore wrote parent-domain hint cookies that accumulated across sessions
and conflicted with the per-subdomain session cookies (see P3). The 5-minute `session.cookieCache`
made stale sessions persist too long on top of that. Fix (f43faf1): (1) the hint-cookie hook now
ONLY fires on the main site host (`octively.com` / `www.octively.com`), never on `admin.` / `app.`,
so auth subdomains stop polluting the parent-domain cookie jar; (2) `maxAge` reduced 30 days to
24 hours; (3) sign-out now clears BOTH `oct_dev` and `oct_client` instead of guessing which one;
(4) `session.cookieCache` reduced 5 min to 1 min. Marketing nav still gets its role hint exactly
as before. Status: FIXED. **Invariant:** any cookie set on `.octively.com` (the parent domain) must
be set ONLY from the main marketing host, never from an auth subdomain, and must be cleared on
sign-out. This is the same root cause class as P3; the lesson is that parent-domain cookies are a
global mutable namespace shared across every subdomain and must be written very narrowly.

**P5 · Proxy rewrite + usePathname() ambiguity leaked the dashboard sidebar onto auth pages (2026-07-26).**
Symptom: the marketing site "Get Started" / "Sign up" button linked to `octively.com/dashboard/signup`,
which 302-redirected to `admin.octively.com/signup` (the `/dashboard` prefix was stripped on redirect —
the normal pattern for app pages). On the admin subdomain, `proxy.ts` then *rewrote* `/signup` →
`/dashboard/signup` (serving the right content) while keeping the visible URL as `/signup`. The catch:
`usePathname()` from `next/navigation` returns the **visible (pre-rewrite) URL**, i.e. `/signup`, NOT the
rendered `/dashboard/signup`. The sidebar-hide logic in `components/dashboard/DashboardShell.tsx` keyed on
exact `/dashboard/signup`, so the short `/signup` fell through and the full dashboard chrome (sidebar +
mobile menu + admin tabs) rendered on top of the signup/login form. Meanwhile `admin.octively.com/dashboard/signup`
(navigated to directly, or via the login page's "Sign up" link) worked fine because no rewrite occurred and
`usePathname()` returned the full path. Root cause is NOT a cookie issue (that was P4) — it is the
interaction of three layers: proxy redirect strips prefix → admin subdomain rewrite re-adds it → usePathname()
returns the short form. Fix (2280b36, layered on 86186d3 + d56c288): (1) `proxy.ts` now keeps the
`/dashboard` prefix on redirect for auth paths (`/signup`, `/login`, `/dashboard/{login,signup,
forgot-password,reset-password}`) so the browser lands on `admin.octively.com/dashboard/signup` directly —
the admin rewrite guard skips paths already starting with `/dashboard`, so usePathname() returns the full
path and the auth layout renders chrome-free; (2) belt-and-suspenders: `DashboardShell` matches the *last
path segment* against auth leaves (`/login`,`/signup`,`/forgot-password`,`/reset-password`) instead of
prefix-anchoring, and the `(dashboard)/layout.tsx` computes `isAuthPage` server-side from `x-invoke-path`
(post-rewrite, always `/dashboard/signup`) and passes it as a prop, bypassing usePathname() entirely.
Status: FIXED. **Invariant:** any conditional that depends on the current route in a layout or shell must
account for proxy rewrites — `usePathname()` returns the *visible* URL, not the *rendered* route. For
auth-vs-app chrome decisions, either keep the full prefix on redirect so no rewrite occurs, or match the
last path segment, or compute server-side from the rendered route. Lesson: a redirect→rewrite→client-hook
chain is three places a single conceptual "what page is this" decision can drift apart; collapse it to one
source of truth.

## Era 3 — RAG and catalog quality battles (2026-05-17 to 05-26)

**R1 · Embedding provider churn (5 providers in 30 days).** Chain: Gemini `text-embedding-004`
permanently shut down Jan 14 2026 -> `gemini-embedding-001` REST (e486425) -> Gemini project 403
PERMISSION_DENIED -> Jina v3 free tier (fb21023) -> jina-embeddings-v5-text-small (7f1f273) ->
final: local ONNX BGE-M3 1024-dim multilingual with Jina v3 API fallback, migration 0014 rebuilt
vector(768)->vector(1024) + HNSW (2e5ff8f). Current: `lib/knowledge/embedder.ts`, selected by
`EMBEDDING_PROVIDER`, both providers 1024-dim. Status: SETTLED (as of 2026-07-06). Any provider
change must keep 1024-dim schema compatibility or budget a full re-embed migration.

**R2 · Similarity threshold: tried 0.65 -> 0.40 -> 0 (removed).** Symptom: retrieval returned
nothing, or catalog queries ("list all products") got 1 of 10 products. Cause: generic queries
score 0.05-0.15 cosine similarity against specific product passages; ANY floor breaks catalog
listing. Fix chain: 2ce5204 (0.40), then c8b9f73 (DEFAULT_THRESHOLD=0, trust TOP_K=20 ordering).
Status: SETTLED. Do not reintroduce a similarity floor for small on-topic knowledge bases.

**R3 · Shopify variant CSVs broke catalog counting.** Symptom: plan's product limit consumed by
variant rows; bot saw 3 "products" for 1 item. Fix: count DISTINCT products not raw rows (b8d59bc);
merge variant rows into one passage per product + raise TOP_K to 20 (769cc96); synthesize handle
from title when CSV lacks one (b119e0d). Status: FIXED.

**R4 · Bot guessed catalog totals from the retrieved subset.** Fix: count chunks directly from
`document_chunks` and inject the true total into the prompt (2420a5d, 8b5514b); hallucination
fences for prices/attributes (1a8d58f) and greeting turns (20c118f). Status: FIXED.

**R5 · Firecrawl replaced by Tavily for scraping.** Reason: Firecrawl free tier = 500 one-time
lifetime credits vs Tavily 1,000/month; same `scrapeUrl()` interface, zero caller changes (c7aa737,
2026-06-17). Note: CLAUDE.md "Active Technologies" still lists Firecrawl (drift). Status: SETTLED,
free-tier-first rule applies (see `octively-change-control`).

**CR1 · Credits stuck at zero.** Symptom: permanent 402 for an org that never chatted. Cause:
failed debit/refund cycles on a MISSING Redis key left it at 0; `SET NX` no-ops on existing keys.
Fix: self-heal on first debit when balance=0 and no `credit_transactions` exist (74f3cd2, also
b86f2a9 auto-init). Status: FIXED.

**CR2 · Free tier seeded at 50K instead of 2M.** Cause: `FREE_TIER_CREDITS` constant lagged
`PLAN_CREDIT_ALLOCATIONS.free`; upgrades did not apply a delta. Fix + one-time legacy correction
migration for all orgs (52f5952). Status: FIXED. Lesson: plan-limit numbers must have one source.

## Era 4 — Security audit + VPS/Docker migration (2026-05-29 to 06-23)

### The security hardening audit (spec 005, all findings)

Read `specs/005-security-hardening/spec.md` in full before touching payments, webhooks, or the
widget. Main fix commits: 7edd3f8 + 539ad7d (2026-05-29). Summary ledger:

| ID | Finding | Root cause | Fix | Status |
|---|---|---|---|---|
| S1 HIGH-1 | PayFast amount tampering | Checkout `amount` unsigned in redirect URL; ITN verified signature of RECEIVED data, not expected price. Pay Rs 1, get the Rs 2,500 plan | `verifyItn` computes `expectedAmount` server-side from `CREDIT_PACKS`/`PLAN_PRICES_PKR`; webhook rejects on `!amountValid` (`lib/billing/payfast.ts`) | FIXED |
| S2 HIGH-2 | Forgeable PayFast ITN | Passphrase only appended IF env var set; unset = signature computable from semi-public fields | Fail closed when `PAYFAST_PASSPHRASE` unset; `timingSafeEqual`; hash in received order (spec-correct, was sorted) | FIXED |
| S3 MED | Product-card XSS in widget | `esc()` missed `"`/`'`; LLM-controlled `image`/`url` hit attribute context; no scheme check (`javascript:` URIs) | quote escaping + `safeUrl()` https-only whitelist in `embed/src/embed.js` | FIXED |
| S4 MED | SSRF via lead webhook | `fetch(webhookUrl)` unrestricted: metadata IPs, RFC-1918, localhost reachable | `assertSafeWebhookUrl` blocklist in `lib/webhooks/outbound.ts`; also removed hardcoded `'owflex-webhook-secret'` fallback (skip delivery if secret unset) | FIXED |
| S5 MED/LOW | Auth rate limit useless on serverless (in-memory, resets per cold start); admin email in client bundle via `NEXT_PUBLIC_PLATFORM_OWNER_EMAIL`; no CSP; CORS `*` on ALL `/api/v1/*`; non-constant-time CRON_SECRET compares; standing DDL endpoint | see spec | Upstash secondaryStorage rate limiting; server-only `PLATFORM_OWNER_EMAIL` + `/api/dashboard/is-admin`; CSP header; CORS scoped to 5 public embed endpoints; `verifyBearer()`; `MIGRATIONS_ENABLED` kill switch (default off) | FIXED |

Open follow-ups from spec 005 (still true as of 2026-07-06): CSP uses `unsafe-inline` (nonce pass
not done); `LLM_KEY_ENCRYPTION_SECRET` zero-padded not KDF-derived; no PayFast server-side validate
postback. Status: OPEN, documented in spec's "Known Limitations".

**Payments UI note:** payment buttons were replaced with WhatsApp CTAs on 2026-05-24 (e926337,
manual billing while gateways matured). As of 2026-07-06 `components/dashboard/PlanUpgradeSection.tsx`
has BOTH the WhatsApp CTA and a PayFast plan-URL link. Check the file before assuming either flow.

### Docker/VPS deploy traps (all hit during the 2026-06-15..17 migration, 59ee823)

| ID | Symptom | Root cause -> fix | Status |
|---|---|---|---|
| V1 | `npm ci` always fails in CI on linux-x64 | `@rolldown/binding-wasm32-wasi` pins a nested optional dep never written to the lockfile on linux -> use `npm install` in the Docker deps stage (2b9e53d) | FENCED |
| V2 | GHCR push rejected | `github.repository_owner` preserves case; GHCR requires lowercase image names (b437b17) | FIXED |
| V3 | `next build` throws in Docker | `new Resend(undefined)` throws at module eval when key absent at BUILD time -> lazy/fallback init (3c2c07f). Same class: any SDK constructed at module scope | FENCED |
| V4 | **BuildKit swallowed NEXT_PUBLIC changes.** "Sanity not configured" in prod DESPITE correct GitHub secrets; builds finishing in ~35s (= full cache hit) | build-arg changes do NOT invalidate BuildKit's cached `npm run build` layer, so updated NEXT_PUBLIC_* values were never re-inlined. Diagnosed by printing secret LENGTHS in CI (ac4e5d6), fixed with `no-cache-filters: builder` in `.github/workflows/deploy.yml` (bb6b66c; the workflow comment at lines 46-50 documents it) | FENCED. Never remove `no-cache-filters: builder` |
| V5 | SSH prune step reverted | Added VPS Docker-image pruning over SSH after each deploy (3a333c9), reverted same hour to a server-side cron (c3541d2). CI must not hold SSH access to prod | SETTLED |
| V6 | **Hostless `http:///` links in emails.** Gmail-redirect invite links with no host | `process.env.NEXT_PUBLIC_PORTAL_URL ?? fallback` lets EMPTY STRING through (`??` only catches null/undefined) and NEXT_PUBLIC_* is baked at build time -> `lib/url.ts` `getAppBaseUrl()/getPortalBaseUrl()` treat empty as missing, accept runtime `APP_URL`/`PORTAL_URL` overrides, never return localhost (c6f13aa, 020e11a, adf7b6e; recent sibling 9be7561 added `getMarketingBaseUrl()` for /pricing links that 404'd on admin subdomain) | FENCED. ONLY `lib/url.ts` may read these env vars directly |
| V7 | embed-test script tag pointed at Docker-internal IP | `new URL(req.url).origin` = `0.0.0.0:3000` behind reverse proxy -> build public origin from `Host` + `X-Forwarded-Proto` headers (6f13fa8); QStash callback same class -> runtime `INTERNAL_APP_URL` (4c8bf51) | FENCED |

**AU3 · Sessions expired en masse after deploys.** Cause: `BETTER_AUTH_SECRET` not stable across
environments + 7-day cookie cache. Fix: cookieCache maxAge 5 min + `?reason=expired` banner
(21bd427). Status: FIXED.

## Era 5 — Widget config, CSP, credits polish (2026-06-24 to 06-25)

**C1-C4 · The CSP incident class.** CSP was added in spec 005 and then broke legitimate scripts
four separate times: GTM/GA4 initial load (d3332d1, Netlify deploy #16), the dashboard embed-test
page (fcdce67, then a dev-only strip 90ec013, resolved properly by V7's origin fix in 6f13fa8),
Cloudflare Insights (88277db), and GA4's lazily-loaded secondary scripts from google-analytics.com
(120b938). Status: each FIXED, class recurs. Rule: any new third-party script REQUIRES a CSP
allowlist change in `next.config.ts` in the same commit. Triage recipe lives in
`octively-debugging-playbook`.

**CR3 · Credit warning threshold inverted.** Symptom: "low credits" banner at 0% used, silence at
95%. Cause: `pct<=10` fired on percent-USED (bf7bdd6, fix: `pct>=90`). Companion CR4: the warn flag
went stale after top-up; layout now rechecks real Redis balance and clears it (88277db). Status: FIXED.

**E6-adjacent · widget-config cached 5 minutes.** Symptom: saved widget settings not visible in
prod, looked exactly like deploy failure V4. Cause: `max-age=300` on the widget-config endpoint ->
`no-cache, must-revalidate` (2cb9ed2). Status: FIXED. Check THIS before suspecting the deploy
pipeline when a config change "does not take".

**P4 · RSC prefetch CORS errors.** Symptom: console CORS errors on octively.com navigation. Cause:
proxy 302-redirected RSC payload fetches (`?_rsc=`) to admin/app subdomains, which do not send CORS
headers for octively.com. Fix: skip redirects when `_rsc` param present, prefetch fails harmlessly
(2977a90). Status: FIXED. Preserve this guard in any proxy.ts edit.

**P5 · Static assets 404 on subdomains + embed preview.** Fixed in c8f66fc (assets/`/signup` alias)
and 72d4770 (embed-preview 404). E4: `/embed-test` as a React page could not run embed.js
synchronously; replaced with a raw-HTML route handler (31a26cf). E5: a `flex-shrink` CSS typo broke
the gradient header (fcd9125). Status: all FIXED.

## Era 6 — Recent (2026-06-30 to 07-06)

**CH1 · Missing `session_id` column crashed chat.** Symptom: chat 500s on deployments whose DB had
not run the leads migration. Fix: known-lead lookup wrapped to degrade gracefully (34db484).
Status: FIXED. Pattern: any query on a recently-migrated column needs a guard until the migration
is confirmed in prod.

**P6/AU4 minor recents:** relative `/pricing` links 404'd on admin subdomain -> `getMarketingBaseUrl()`
(9be7561); BetterAuth get-session rate limit 10/min caused 429s on normal navigation -> 30/min
(120b938); affiliate portal magic-link emails used wrong base URL -> `AFFILIATE_PORTAL_URL` (9987238).
All FIXED. Note the affiliate surface (`affiliates.octively.com`, `app/affiliate`) exists since
~2026-07 even though CLAUDE.md still says "three subdomains" (known doc drift).

## Standing environment battles (WSL2 on Windows D: drive)

**W1 · npm ENOTEMPTY.** WSL on a Windows-mounted drive cannot do atomic directory renames;
concurrent/large `npm install` runs fail with ENOTEMPTY. Fence: install packages in small groups,
remove stale `node_modules/.*-XXXX` temp dirs, never run parallel installs. Status: FENCED
(environmental, cannot be fixed in-repo). Details in `octively-build-and-env`.

**W2 · Neon "fetch failed" under WSL.** WSL2 advertises IPv6 routes it cannot use; Node undici's
Happy Eyeballs races IPv6 and dies ENETUNREACH even though curl works. Fence (permanent):

```bash
cd "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas"
NODE_OPTIONS="--dns-result-order=ipv4first --import ./scripts/wsl-net-fix.mjs" npx tsx scripts/<script>.ts
```

Evidence: `scripts/wsl-net-fix.mjs` header comment. Status: FENCED. Every DB-touching script run
from WSL needs this preload.

## Repo hygiene incidents

**G1 · `.claude/` accidentally tracked.** Unignored by accident, reverted (0f84308, 2026-06-12).
`.gitignore` line 42 ignores `.claude/` broadly; skills like this one are force-added or the
ignore is scoped, so verify tracking with `git check-ignore -v .claude/skills/<name>/SKILL.md`
before assuming a commit will include it. Status: FIXED.

**G2 · `.next/` dev artifacts committed** on day 1, removed in f270be1. Status: FIXED.

**G3 · Drizzle migration journal/snapshot drift, migrations 0017-0024 untracked.** Discovered
2026-07-21 while adding columns for spec 007 (custom domains). `lib/db/migrations/meta/_journal.json`
only lists entries through `0016_puzzling_morph` (idx 16), and `meta/0017_snapshot.json` through
`0024_snapshot.json` do not exist — but `0017_platform_coupons.sql` through `0024_pricing_summary.sql`
exist as real SQL files on disk (8 migrations, one of them a duplicate-numbered pair:
`0017_platform_coupons.sql` + `0017_sample_affiliate_platform_coupon.sql`). Symptom: `npm run
db:generate` fails with `Error: Interactive prompts require a TTY terminal` when run
non-interactively (any CI, any agent tool without a real TTY) — `drizzle-kit`'s
`promptColumnsConflicts` step tries to ask "is this a rename or a new column?" because its diff
engine is comparing the live `schema.ts` against the stale 0016 snapshot, 8 migrations out of
date, producing an ambiguous/confusing diff. Root cause of the drift itself is unconfirmed —
likely migrations 0017-0024 were generated in a session/environment where the snapshot output
wasn't committed alongside the SQL, or were hand-authored directly without running
`db:generate` at all. Workaround used for spec 007: hand-wrote the new migration SQL file
directly (`0025_custom_domain_support.sql`), matching the plain `ALTER TABLE ... ADD COLUMN`
style already established by 0017-0024, bypassing `drizzle-kit generate` entirely for that
change — safe only because it was a simple, unambiguous additive migration (new nullable
columns, no renames, no type changes). Status: **OPEN** — the underlying snapshot/journal gap
is NOT fixed, only worked around for one migration. Any future migration with real ambiguity
(a rename, a type change, a drop) will hit the same broken prompt and cannot be safely
hand-written the same way. Needs a dedicated reconciliation pass: reconstruct
`meta/0017_snapshot.json` through `0024_snapshot.json` (or their true equivalent) and backfill
`_journal.json` entries for idx 17-24, likely by diffing each migration's SQL against the prior
snapshot by hand, before trusting `db:generate` again. Details: `octively-build-and-env`.

**M1 · Default model changed deepseek -> llama-3.3-70b.** Old deepseek default deprecated in
practice; c7a497c migrated existing bots. Constitution still names deepseek (drift). Later
economics work added free-first OpenRouter `:free` variant routing with Redis quota counters
(5258726, dbab373). Status: SETTLED; model economics live in `octively-domain-reference`.

**DV1 · Demo video voiceover.** ElevenLabs required an API key the free tier would not grant at
the time; the video (isolated Remotion project `video/octively-demo/`) ships flag-gated audio:
`VO_ENABLED`/`MUSIC_ENABLED` in `src/voiceover.ts`, a locally-synthesized CC0 music bed
(`scripts/generate-music.mjs`, "royalty-free by construction") as the always-available fallback,
with VO mp3s in `public/audio/` once generated. Status: FIXED/SETTLED.

## Rejected and deferred approaches (do not re-propose without new evidence)

| Approach | Verdict | Rationale + evidence |
|---|---|---|
| PostgreSQL-only credits (SUM or materialized column) / Redis-only (no ledger) | REJECTED | Too slow / lock contention / no audit trail for billing disputes. ADR `history/adr/0001-*` Alternatives A-C. Debit-first dual-store is settled |
| BetterAuth admin role, separate admin auth instance, hardcoded owner UUID | REJECTED (N=1) | Email check is proportionate; revisit only when a second admin exists. ADR `history/adr/0002-*` |
| LLM-call or embedding-similarity "unanswered" detection | REJECTED for now | Doubles cost + 300-800ms latency per message; heuristic regex is enough at current volume. ADR `history/adr/0003-*` |
| Stripe-only / PayFast-only / FX conversion layer / manual bank transfer | REJECTED | Stripe has no PKR/Pakistan acquiring; PKR-only blocks international; manual ops do not scale. ADR `history/adr/0004-*`. Dual PayFast+Lemon Squeezy is settled |
| Visual drag-and-drop flow builder; social channel integrations; RabbitMQ (use BullMQ on Redis); React Query/SWR (server components only); custom CSS beyond Tailwind; indigo accent | REJECTED | CLAUDE.md "What NOT to Build" list, each item a v6-era scar (A1) |
| Voice/audio features | DEFERRED | Demand-gated: marketable as "upcoming", built only when a paying customer asks (CLAUDE.md) |
| ONNX local embeddings "later" | ALREADY SHIPPED | Was deferred, then landed as BGE-M3 on the VPS (2e5ff8f). CLAUDE.md "No ONNX until Phase 3" is stale |
| WhatsApp channel | DEFERRED until ~10 paying customers | `specs/006-whatsapp-channel/spec.md` line 5: "Status: Planned (build only after ~10 paying customers)". Broadcasts/templates/shared inbox/omnichannel explicitly out of scope even then |
| iframe sandbox embed isolation | OPEN / TODO | CLAUDE.md "TODO — iframe Sandbox Refactor"; `/security` page says "coming soon". The sanctioned successor to the rejected shadow DOM (E2). Not started as of 2026-07-06 |
| Firecrawl | REPLACED | Tavily, better free tier (R5, c7aa737) |
| Netlify hosting | DECOMMISSIONED | Budget exhaustion (N4); Dokploy VPS is production |

## Dead and stalled branches (as of 2026-07-06)

All three feature branches ARE merged into master (`git branch --merged master` confirms); their
tips are just old merge-base leftovers. None contain unmerged work.

| Branch | Tip | State |
|---|---|---|
| `001-phase-2-platform` | 4a40622 (2026-05-15) | merged via 3071a98; safe to delete |
| `002-phase-3-knowledge` | 625f5db (2026-05-16) | merged via 9714ca0; safe to delete |
| `004-monetization-go-live` | b1a2b15 (2026-05-19) | merged via 59a8103; safe to delete |
| `release` (+ origin/vercel copies) | a25071d (2026-06-12) | OBSOLETE since 2d4868e; never push here |

## When NOT to use this skill

- **Triaging a NEW bug with no historical match** -> `octively-debugging-playbook` (symptom->experiment tables).
- **Understanding why the architecture is shaped this way** (invariants, load-bearing decisions) -> `octively-architecture-contract`.
- **Making/committing/pushing a change**, or checking non-negotiable gates -> `octively-change-control`.
- **Env var behavior and the NEXT_PUBLIC build-arg pipeline going forward** -> `octively-config-and-flags` (this skill only records how it burned us).
- **Recreating the WSL dev environment** -> `octively-build-and-env`.
- Deploy pipeline operations and rollback -> `octively-run-and-operate`.

## Provenance and maintenance

Authored 2026-07-06 from the full git history (405 commits, fba5c26..6a9b946), `docs/netlify-budget.md`,
`docs/production-deployment.md`, `docs/owflex_master_plan_v7.md`, `specs/005-security-hardening/spec.md`,
`specs/006-whatsapp-channel/spec.md`, `history/adr/0001..0004`, `.github/workflows/deploy.yml`,
`lib/knowledge/embedder.ts`, `scripts/wsl-net-fix.mjs`, and `video/octively-demo/README.md`.
Every hash cited was confirmed with `git log -1 <hash>` on 2026-07-06. Revised 2026-07-21
(added G3, the drizzle migration journal/snapshot drift found while implementing spec 007).

Re-verification one-liners (run from repo root, quote the path — it contains spaces):

```bash
cd "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas"
# New incidents since authoring (append them here):
git log --format="%h %ci %s" --since=2026-07-06 | grep -Ei "fix|revert|guard"
# Any hash in this file still valid:
git log -1 --format="%h %s" bb6b66c 2>/dev/null || echo "HISTORY REWRITTEN — re-audit this skill"
# V4 fence still in place:
grep -n "no-cache-filters" .github/workflows/deploy.yml
# R2 threshold still zero:
grep -rn "DEFAULT_THRESHOLD" lib/knowledge/retriever.ts
# Embedder providers/dimensions:
sed -n '1,15p' lib/knowledge/embedder.ts
# Billing UI state (WhatsApp vs gateway buttons):
grep -n -i "whatsapp\|payfast" components/dashboard/PlanUpgradeSection.tsx | head
# iframe sandbox still TODO:
grep -n "iframe Sandbox" CLAUDE.md
# WhatsApp still deferred:
sed -n '5p' specs/006-whatsapp-channel/spec.md
# Branch staleness:
git branch --merged master
```

If any re-verification contradicts an entry, update the entry's status rather than deleting it:
this file's value is the trail, not just the current state.
