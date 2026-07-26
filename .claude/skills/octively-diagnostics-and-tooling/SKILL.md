---
name: octively-diagnostics-and-tooling
description: Load when you need to MEASURE what Octively is actually doing instead of eyeballing it — checking Dokploy container logs, whether an error tracker is wired at all, GA4/GTM events, UTM/short-link click tracking, or running a SQL/drizzle query against routing_decisions, credit_transactions, messages, conversations, leads, or audit_logs to answer a real operator question ("what % of chats hit the fallback model this week", "any credit refund spikes", "which orgs are near their plan limit", "unanswered rate per bot"). Also load before running `npm run db:studio`, before writing a new diagnostic query, or when asked to build/run a read-only health-check script against the Neon database. Ships runnable scripts in `scripts/`. Does NOT cover fixing what you find (use octively-debugging-playbook) or the vitest suite (use octively-validation-and-qa).
---

# Octively Diagnostics and Tooling

How to measure Octively instead of guessing. Everything here is read-only: SQL/drizzle
`SELECT`s, log viewing, and dashboard reads. Verified against
`/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas` (quote the path, it contains spaces)
as of 2026-07-06/07.

---

## 1. The observability inventory (what exists, what doesn't)

| Tool | Status (as of 2026-07-06) | How to reach it |
|---|---|---|
| Dokploy container logs | Live, only real runtime log source | Panel at `https://deploy.octively.com` → the app's service → **Logs** tab. Also `docker service logs <service>` on the VPS if you have SSH access (see `octively-run-and-operate`). |
| Error tracker (Sentry) | **Not wired.** `@sentry/*` packages appear only as *transitive* dependencies in `package-lock.json` (pulled in by another package, not installed directly — confirmed: no `@sentry/*` entry in `package.json` dependencies, and `grep -rl "@sentry"` across `app/`, `lib/`, `components/`, `embed/src` returns zero files). The constitution's mention of Sentry is aspirational, not implemented. **State plainly: no error tracker wired as of 2026-07-06.** All error visibility today is `console.error`/`console.log` lines that only exist in Dokploy container logs — they are NOT searchable, NOT alerted on, and roll off whenever the container recycles. |
| GA4 | Wired | `NEXT_PUBLIC_GA_MEASUREMENT_ID` env var (see `.env.example:19`), rendered via `<GoogleAnalytics gaId={...}>` from `@next/third-parties/google` in `app/layout.tsx:71-73`. Only renders if the env var is set. |
| GTM | Wired | `NEXT_PUBLIC_GTM_ID` env var (`.env.example:17`), rendered via `<GoogleTagManager gtmId={...}>` in `app/layout.tsx:68-70`. |
| UTM capture | Wired | `lib/utm.ts` — `captureUTM()` reads `?utm_source/medium/campaign/term/content` off the URL and stores them in `localStorage['oct_utm']`. `getUTM()` reads it back. `lib/analytics.ts` (`trackGAEvent`/`trackGTMEvent`) merges `getUTM()` into every event payload automatically. Full guide: `docs/utm-tracking-guide.md`. |
| Short-link click tracking | Wired, fixed once (fire-and-forget bug) | `app/r/[code]/route.ts` — looks up `short_links` by `code`, **awaits** the `clickCount + 1` update (commit `b9adf0c` "fix(analytics): record short-link clicks" — a prior fire-and-forget version silently dropped the increment because neon-http's fetch was never flushed once the redirect response returned), then 302-redirects to `destinationUrl` with the row's UTM params appended. Admin CRUD: `lib/db/queries/links.ts` (`createShortLink`/`listShortLinks`/`deleteShortLink`, all gated by `requirePlatformOwner()`). Admin UI: `admin.octively.com/dashboard/admin/links`. |

**Discriminating check for "is Sentry actually on":**
```bash
cd "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas"
grep -c '"@sentry' package.json                 # 0 = not a direct dependency
grep -rl "@sentry" app lib components embed/src  # empty output = never imported in source
```
If both come back empty/zero, there is no error tracker — full stop. Don't infer one exists because the constitution mentions it.

---

## 2. The DB is the telemetry — table by table

Read `lib/db/schema.ts` (497 lines as of 2026-07-07 — this count drifts with schema commits,
`wc -l lib/db/schema.ts` to re-derive) for ground truth before writing any query; the table names
and column names below are copied verbatim from it (verified 2026-07-06/07).

### `routing_decisions` — model routing behavior (Phase 3, `lib/ai/router.ts`)

Columns: `id, message_id, bot_id, classification, classifier_model, classifier_latency_ms, chosen_model, fallback_used, credit_cost, created_at`.

`classification` is one of `'greeting' | 'faq' | 'knowledge' | 'complex'` (`lib/ai/router.ts:4`).
`fallback_used = true` means specifically: the message classified as `'complex'` (which normally
tries the strong model, `STRONG_MODEL = 'anthropic/claude-haiku-4-5-20251001'`) but the org's
credit balance couldn't cover the 5x strong-model estimate (or the debit failed), so the router
fell back to the bot's default model instead (`lib/ai/router.ts:126-152`). It does **not** mean
"the OpenRouter `:free` variant failed and paid was used" — that's a separate, un-logged fallback
inside `lib/ai/litellm.ts`'s `FREE_VARIANTS` mechanism with no DB record.

### `credit_transactions` — money movement (append-only ledger, never delete rows)

Columns: `id, org_id, delta, reason, ref_id, created_at`. `reason` is one of
`'chat_debit' | 'chat_refund' | 'purchase' | 'monthly_reset'` (schema comment,
`lib/db/schema.ts:220`). `ref_id` carries a `UNIQUE` index for idempotency — same message ID or
payment ID can't double-debit/double-credit.

### `messages` — per-message facts including unanswered/rating

Columns include: `role, content, tokens_used, input_tokens, output_tokens, cost_usd, model_used,
flagged_unanswered, rating (smallint: 1 | -1 | null), latency_ms, created_at`.
`flagged_unanswered` is set by `flagIfUnanswered()` (`lib/ai/uncertainty.ts`, a regex over the
assistant's final content) at write time in `app/api/v1/chat/route.ts:598`.

### `conversations` — session-level facts

Columns include: `bot_id, session_id, page_url, started_at, ended_at, message_count, needs_human,
escalated_at, agent_active_at`.

### `leads` — captured contact info

Columns include: `bot_id, conversation_id, session_id, name, email, phone, subject, notes,
captured_at, hidden_by_limit, status ('new'|'contacted'|'won'|'lost')`.

### `audit_logs` — workspace action log (`lib/db/queries/audit.ts`)

Non-blocking, fire-and-forget writes (a failed insert only logs to console, never throws —
`lib/db/queries/audit.ts:39-42`). `action` is a closed union in `AuditAction`
(`lib/db/queries/audit.ts:4-22`): bot lifecycle, document/KB events, client/member management,
billing, settings, conversation handoff/limit events, and two system error events
(`error.credit_exhausted`, `error.ingestion_failed`) with `user_id = null`.

### `organizations` — plan + monthly counters

Columns include: `plan, conversations_this_month, leads_this_month, credit_cap, banned_at`.
`conversations_this_month`/`leads_this_month` are the counters `lib/limits/index.ts` checks
against `PLAN_LIMITS` (`lib/limits/index.ts:4-11`) — not derived on the fly, so they can drift if a
migration or manual DB edit skips the increment path. Cross-check against a live `COUNT` if you
suspect drift.

### Webhook logs

**None exist as a table.** PayFast (`app/api/webhooks/payfast/`) and Lemon Squeezy
(`app/api/webhooks/lemon-squeezy/`) webhook handlers only `console.log`/`console.error` — visible
in Dokploy logs only, not queryable. If you need historical webhook outcomes, look for the
resulting `credit_transactions` (reason `'purchase'`) or `organizations.plan` change instead — the
webhook's effect is queryable even though the webhook call itself isn't logged anywhere durable.

---

## 3. Ready-made queries (drizzle, read-only)

All of these are implemented as runnable scripts in `scripts/` (section 5). Below is what each
answers and the interpretation guide. "Baseline unknown" means: run it once now, write the number
down somewhere (a PHR or a note), and treat that as day-zero — this repo has never systematically
tracked these numbers before.

| Question | Table(s) | Normal / how to read it |
|---|---|---|
| What % of chats used the fallback (non-strong) model this week? | `routing_decisions` | `fallback_used = true` should be the **minority** of `classification = 'complex'` rows — a majority means orgs are routinely credit-starved when they need the strong model. Free-tier orgs hitting fallback often is expected; paid orgs hitting it often is a signal. Baseline: establish first, no prior number exists. |
| Any credit refund spikes? | `credit_transactions` | `reason = 'chat_refund'` should be rare relative to `'chat_debit'` — refunds only happen when the LLM call fails after debit (debit-first pattern, ADR-0001). A day with refunds >5-10% of that day's debits suggests upstream LLM/provider instability, not a credits bug per se — cross-check LiteLLM/OpenRouter status before assuming a code regression. |
| Which orgs are near their plan limit? | `organizations` + `lib/limits` `PLAN_LIMITS` | Compare `conversations_this_month` / `leads_this_month` against the plan's ceiling (`lib/limits/index.ts:6-10`; e.g. `free: 200 conversations`, `starter: 3,000`, `pro: 15,000`, `agency: 75,000`, `enterprise: Infinity`). >80% is a natural "approaching limit" cutoff (no codified alert exists — this is advisory, not automated). |
| What's the unanswered rate per bot? | `messages` join `conversations` | `flagged_unanswered = true` count ÷ total assistant messages for the bot, over a window. No established baseline in this codebase — flag it, don't alarm on a single number until you've watched it over a few weeks. A rate that's rising week over week for one bot is more meaningful than any single absolute value. |

Query source file for these patterns already exists in the app itself — read
`lib/db/queries/analytics.ts` (`getBotAnalytics`, `getPageBreakdown`, `getBotRatingSummary`,
`getBotUsage`) before writing a new query from scratch; it already has per-bot conversation counts,
escalation rate, rating thumbs up/down, and model cost breakdown wired with the correct
`and()`/`gte()` date-window pattern. Don't reinvent it — extend it or query the same tables the same way.

---

## 4. Ship scripts — running them

Four scripts live in `scripts/` inside this skill directory. **All are read-only (`SELECT` only,
zero `INSERT`/`UPDATE`/`DELETE`), take no arguments that mutate anything, and degrade gracefully**
(missing env vars print a clear message and exit non-zero instead of throwing a stack trace).

| Script | Answers |
|---|---|
| `scripts/health-summary.ts` | One combined snapshot: routing fallback rate, unanswered rate, credit refund rate, orgs near their plan limit, DB reachability — the "what's going on right now" script. |
| `scripts/routing-health.ts` | Routing-decisions-only deep dive: classification mix, fallback rate, model usage counts, over a configurable day window. |
| `scripts/credits-health.ts` | Credit-transactions-only deep dive: debit/refund/purchase totals, refund-to-debit ratio, top orgs by spend. |
| `scripts/db-check.sh` | Shell one-liner wrapper: confirms `DATABASE_URL` is set/reachable and prints table row counts for the tables above — the fastest "is the DB even up" check. |

### Critical: env loading (verified, do not assume)

This repo's existing `scripts/seed-demo-usage.ts` uses `import 'dotenv/config'`, which only loads a
file literally named `.env` — **this repo has no `.env` file, only `.env.local`.** Verified by
direct test: `require('dotenv/config')` with no `.env` present leaves `DATABASE_URL` undefined;
`require('dotenv').config({ path: '.env.local' })` correctly loads it (53 keys injected in a local
test run on 2026-07-07). **All scripts shipped here explicitly load `.env.local`, not the bare
`dotenv/config` shortcut.** If you copy a pattern from elsewhere in the repo, check which file it
actually loads before trusting it.

### Running them (always from the repo root, always with the WSL preload)

```bash
cd "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas"

NODE_OPTIONS="--dns-result-order=ipv4first --import ./scripts/wsl-net-fix.mjs" \
  npx tsx .claude/skills/octively-diagnostics-and-tooling/scripts/health-summary.ts

NODE_OPTIONS="--dns-result-order=ipv4first --import ./scripts/wsl-net-fix.mjs" \
  npx tsx .claude/skills/octively-diagnostics-and-tooling/scripts/routing-health.ts --days 7

NODE_OPTIONS="--dns-result-order=ipv4first --import ./scripts/wsl-net-fix.mjs" \
  npx tsx .claude/skills/octively-diagnostics-and-tooling/scripts/credits-health.ts --days 30

bash .claude/skills/octively-diagnostics-and-tooling/scripts/db-check.sh
```

**Dependency fragility warning (verified 2026-07-07):** neither `dotenv` nor `tsx` is declared in
the root `package.json` (`dependencies` or `devDependencies`) — the TS scripts above resolve them
only because both happen to be present in `node_modules` as transitive/hoisted dependencies of
other packages. A future `npm install` that reshuffles the dependency graph can silently break
every `npx tsx` invocation here with a "Cannot find module" error that has nothing to do with the
scripts' own logic. If that happens: `npx tsx` will fetch tsx on the fly (network permitting), and
you can replace the `dotenv` import by exporting the env manually
(`export DATABASE_URL="$(grep '^DATABASE_URL=' .env.local | cut -d= -f2-)"`) or asking the owner to
add `dotenv`/`tsx` as explicit devDependencies (a `package.json` change needs the change-control
gates). `scripts/db-check.sh` is immune — it uses only bash + `@neondatabase/serverless`, which IS
a declared dependency.

The `--import ./scripts/wsl-net-fix.mjs` path is **repo-relative to the working directory you run
the command from**, not to this skill directory — that's why every invocation above starts with
`cd` to the repo root first. `scripts/wsl-net-fix.mjs` disables undici's Happy Eyeballs
`autoSelectFamily` so Neon's dual-stack DNS doesn't race a dead IPv6 route under WSL2 (see
`octively-build-and-env` for the full WSL trap catalog — this skill doesn't own that content, it
just uses the same preload because the scripts talk to Neon).

If `DATABASE_URL` is missing or unreachable, every script prints an explicit `[diagnostics] ...`
failure message (for `db-check.sh`: a `FAILURE:` summary line if any table check errors) and exits
with a non-zero code. None of them throw raw stack traces at the top level, and `db-check.sh` only
prints its "Done. All table checks succeeded." banner when every check actually passed.

---

## 5. `npm run db:studio` (Drizzle Studio) — usage and WSL caveats

```bash
cd "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas"
npm run db:studio   # runs `drizzle-kit studio`, defined in package.json:18
```

- `drizzle.config.ts` manually reads `.env.local` line-by-line (drizzle-kit's CLI doesn't load
  Next.js env files itself) — so `db:studio` **does** pick up `.env.local` correctly without any
  extra flags, unlike the raw `dotenv/config` trap above. This only applies to `drizzle-kit`
  commands (`db:generate`, `db:migrate`, `db:studio`), not to standalone `tsx` scripts.
- Drizzle Studio opens a local web UI (defaults to `https://local.drizzle.studio`) that proxies to
  your local Neon connection — it is a GUI table browser + query runner, good for one-off "let me
  just look at this row" checks, not for scripted/repeatable diagnostics (use the scripts above for
  that).
- **WSL caveat:** Drizzle Studio's browser UI talks to a local Node proxy process over `https://local.drizzle.studio`, which resolves to a public Drizzle-hosted page that then calls back to your local proxy on `127.0.0.1`. If the studio process fails to bind or the browser can't reach `localhost` from Windows, it's the same WSL2 networking class of problem documented in `octively-build-and-env` — try opening the printed URL from a Windows browser (not a WSL-side one) first.
- Same IPv6/undici trap can bite `drizzle-kit` if it needs to hit Neon over a raw TCP path rather
  than the HTTP driver — if `db:studio` hangs on WSL, retry with the same
  `NODE_OPTIONS="--dns-result-order=ipv4first"` prefix used for the scripts above.

---

## 6. Funnel instrumentation map

This section is a **map of what evidences each funnel step** — it does not own funnel strategy or
recommend what to do about drop-off. That's `octively-paying-customers-campaign`'s job.

| Funnel step | GA4/GTM event (if any) | DB evidence | Notes |
|---|---|---|---|
| Marketing visit / ad click | pageviews (automatic via GA4); `?utm_*` params | — | Captured client-side into `localStorage['oct_utm']` by `lib/utm.ts`'s `captureUTM()`. If UTM capture isn't called on the landing page, the visit is invisible to later attribution — verify `captureUTM()` is actually invoked in the marketing layout before trusting attribution numbers. |
| Signup | `signup_complete` (`app/(dashboard)/dashboard/signup/page.tsx:64`, includes `method` and optional `segment`) | New row in `users`, new row in `organizations` (`ownerId` = the new user) | GA4 event payload is merged with the stored UTM data automatically (`lib/analytics.ts:5-8`). |
| First bot created | `bot_created` (`components/dashboard/OnboardingTracker.tsx:7`) | New row in `bots` for that `org_id` | Fires once per onboarding flow completion — verify it isn't also firing on every bot creation after the first if you're using it as an activation milestone. |
| Embed installed on client site | **None.** No GA/GTM event fires when the embed script actually loads on an external page. | Not directly observable — inferred only by the *first* `conversations` row for that `bot_id` ever existing, which requires the widget to have successfully loaded and called the chat API at least once. | This is a real gap: "installed but never talked to" (embed on the page, zero conversations) is indistinguishable from "never installed" using current instrumentation. Don't conflate "first conversation" with "installed" in reporting — state both, and state the gap. |
| First conversation | None dedicated (no `first_conversation` GA event exists as of 2026-07-06) | `conversations` table, `MIN(started_at)` per `bot_id` | Use this as the practical proxy for "embed is live and working," not a true "installed" signal — see gap above. |
| Paid conversion | `plan_upgraded` (`components/dashboard/UpgradeTracker.tsx:7`, includes `plan`) | `organizations.plan != 'free'`; `credit_transactions` rows with `reason = 'purchase'`; if via affiliate coupon, also `affiliate_referrals` (`payment_ref_id` unique per transaction) | Three independent DB confirmations for the same event — cross-check them if the GA4 number and the DB count disagree; the DB is the source of truth, GA4 can miss events on ad-blocked sessions. |
| (Adjacent, not core funnel) Client invited | `client_invited` (`components/dashboard/InviteClientDialog.tsx:77`) | New row in `invitations` | Agency-side funnel, not the acquisition funnel above — noted for completeness only. |

---

## 7. When NOT to use this skill

- **Fixing** something this skill helped you find (a routing bug, a credits leak, a stuck webhook)
  → `octively-debugging-playbook`.
- Deciding whether a finding is "safe to ship" evidence, or writing/extending the vitest suite
  → `octively-validation-and-qa`.
- Turning a measured number into a ranked action plan for the paying-customers problem
  → `octively-paying-customers-campaign` (this skill only feeds it the funnel map, it doesn't own
  strategy).
- Understanding *why* routing/credits/RAG work the way they do, not just how to query them
  → `octively-domain-reference`.
- WSL environment setup from scratch (npm installs, Neon CLI traps generally)
  → `octively-build-and-env`.
- Dokploy deploy pipeline, cron jobs, prod migrations, rollback
  → `octively-run-and-operate`.
- A symptom you're triaging live (widget broken, payments rejected, WSL install failing)
  → `octively-debugging-playbook` first — it tells you the cheapest diagnostic to run, which may
  point back here for the actual query.

---

## 8. Provenance and maintenance

Date-stamped 2026-07-06/07, revised 2026-07-07 (fixed `db-check.sh`'s no-psql Node fallback —
`@neondatabase/serverless` v1 requires `sql.query()`/tagged-template, the old plain `sql('...')`
call failed every check while still printing a success banner; the script now exits non-zero with
an explicit FAILURE line on any errored check, verified end-to-end against the live DB. Also:
schema line count 477 → 497; added the undeclared-`dotenv`/`tsx` fragility warning).
Re-verify volatile facts with these commands (run from the repo root,
quoting the path):

```bash
cd "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas"

# Sentry still not wired?
grep -c '"@sentry' package.json; grep -rl "@sentry" app lib components embed/src

# GA4/GTM env vars still named the same?
grep -n "GA_MEASUREMENT_ID\|GTM_ID" .env.example

# Schema hasn't renamed/dropped the tables this skill documents
grep -n "export const \(routingDecisions\|creditTransactions\|messages\|conversations\|leads\|auditLogs\|shortLinks\|organizations\) = pgTable" lib/db/schema.ts

# Plan limits unchanged
sed -n '4,11p' lib/limits/index.ts

# routing classification enum unchanged
grep -n "RoutingClass =" lib/ai/router.ts

# GA4 event names unchanged
grep -rn "trackGAEvent(" app lib components | grep -v node_modules

# db:studio / test / build script names unchanged
grep -n '"db:studio"\|"test"\|"build"' package.json

# dotenv env-loading behavior unchanged (re-run the actual test, don't assume)
node -e "require('dotenv/config'); console.log('bare dotenv/config sees DATABASE_URL:', !!process.env.DATABASE_URL)"
node -e "require('dotenv').config({path:'.env.local'}); console.log('.env.local sees DATABASE_URL:', !!process.env.DATABASE_URL)"
```
