---
name: octively-change-control
description: Load BEFORE making, committing, or pushing ANY change to the Octively repo. Covers how changes are classified and gated (doc-only vs UI vs behavior vs money-path vs schema migration), the SDD pipeline (specs/<feature>/spec.md, plan.md, tasks.md, PHRs, ADRs), every non-negotiable rule with its historical incident (build gate, build:embed stale-dist, no Co-Authored-By trailers, tenant isolation, Zod, debit-first credits, error shape, embed_key), the owner-approval list (paid dependencies, pricing, marketing claims, prod DB ops, payment logic), the push-equals-deploy reality of master, and the changelog/roadmap sync rule. Also load when you notice CLAUDE.md or the constitution contradicting the code, before running git push, before drizzle-kit generate, or when tempted to add a paid service.
---

# Octively Change Control

How changes get made, classified, gated, reviewed, and shipped in this repo.
Zero project lore assumed. The repo path contains spaces, so always start with:

```bash
cd "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas"
```

## The one fact that governs everything: push = deploy

**`master` IS production. There is no staging gate.** The exact consequence chain
(verified in `.github/workflows/deploy.yml` and `docs/production-deployment.md`, as of 2026-07-06):

```
git push origin master
  -> GitHub Actions workflow ".github/workflows/deploy.yml" (trigger: push to master)
  -> Docker image build (linux/amd64, BuildKit, `no-cache-filters: builder`)
  -> push to GHCR: ghcr.io/mrowaisabdullah/owflex-chat:latest and :<sha>
  -> curl POST ${DOKPLOY_URL}/api/application.deploy
  -> Dokploy on the Hetzner CX33 VPS pulls the image and redeploys (~10-12 min)
  -> live at octively.com / admin.octively.com / app.octively.com / affiliates.octively.com
```

**If you must NOT deploy: do not push.** Commit locally and stop. There is no
"push but hold the deploy" mechanism on `origin master`. The `vercel` remote is
dev/preview only (Netlify is decommissioned; see Drift section below).

Rollback if a bad deploy ships: Dokploy panel (https://deploy.octively.com) ->
app -> Deployments -> redeploy a previous image, or `git revert` + push. Mechanics
belong to `octively-run-and-operate`.

## Pre-push checklist (every push, no exceptions)

- [ ] Change went through the right gates for its class (table below)
- [ ] If `embed/src/embed.js` changed: `npm run build:embed` ran and its outputs are staged
- [ ] `npm run build` exits 0 locally (`tsc --noEmit` alone is NOT sufficient)
- [ ] Commit message is `type(scope): description` (conventional commits)
- [ ] Commit message has NO `Co-Authored-By:` trailer
- [ ] Nothing on the owner-approval list was decided unilaterally (see below)
- [ ] You are prepared for this commit to be live in production ~12 minutes after push

## Non-negotiables, with rationale and incident history

Each of these exists because something broke or because the constitution
(`.specify/memory/constitution.md`) mandates it. Do not relitigate them.

| # | Rule | Why / incident evidence |
|---|------|--------------------------|
| 1 | **Build gate:** `npm run build` must exit 0 before every push | master is production; a push deploys. A broken build means a broken prod deploy attempt. CLAUDE.md "Build Gate (Non-Negotiable)". |
| 2 | **`npm run build:embed` after editing `embed/src/embed.js`** | The live `/embed.js` route (`app/embed.js/route.ts`) serves `public/embed.js`, NOT the source file. `build:embed` = `npm run build --workspace=embed && cp embed/dist/embed.min.js public/embed.js` (see `package.json`). Incident: commit `df6c44c` (2026-05-25) "fix(embed): read public/embed.js not gitignored embed/dist" - prod served a stale/absent widget because the route read a gitignored build dir. Run it BEFORE `npm run build` and commit the changed output files. |
| 3 | **NEVER add `Co-Authored-By:` trailers to commits** | Incident: commit `94fbb80` (2026-05-25) "docs(claude): never add Co-Authored-By to commits - breaks Netlify contributor limit". Netlify's free plan counted every git co-author as a billable contributor and blocked builds. Netlify is now decommissioned, but the rule stands (CLAUDE.md): trailers add noise and re-arm the trap if any git-connected host returns. |
| 4 | **Conventional commits:** `type(scope): description` | Keeps `git log` mineable; every skill in this library mines history for incident evidence. Verified norm across recent log (`fix(embed):`, `feat(leads):`, `ci:` ...). |
| 5 | **Tenant isolation on every query** | Constitution lines 128-130: every user-data query MUST scope to `org_id` AND verify session ownership via join; `bot_id` alone is insufficient. This is a white-label multi-tenant product: one leak = a client sees another client's leads/conversations. An integration test guards this (retrieval isolation, under `tests/`). |
| 6 | **Zod on every API route, no exceptions** | Constitution line 137. Pattern: validate Zod -> check auth -> check org limits -> execute. Note: constitution says schemas live in `lib/validators`; in reality (as of 2026-07-06) no such dir exists, schemas are defined near their routes/lib modules. Follow the existing local pattern; flag the doc drift, do not invent the dir. |
| 7 | **Credits are debit-FIRST** | ADR-0001 (`history/adr/0001-credit-system-dual-store-redis-balance-postgresql-audit-log.md`). Atomic Redis `DECRBY` BEFORE the LLM call, `INCRBY` refund on failure (`lib/credits/index.ts` lines ~88-98), Postgres `credit_transactions` append-only ledger. Never debit after; never skip the refund. |
| 8 | **Error shape is exactly `{ error: string, code: string, status: number }`** | Constitution line ~196. One shape means the widget, dashboard, and portal can all parse errors uniformly. No other shape allowed. |
| 9 | **No raw SQL in application code** | Constitution Principle II (Dependency Inversion): app code depends on `/lib/db` (Drizzle), never raw SQL outside migrations. Known sanctioned exceptions: (a) `app/api/internal/migrate/route.ts` (DDL endpoint, kill-switched, see Schema class below); (b) `db.execute(sql\`...\`)` with Drizzle's parameterized template tag, used ONLY for pgvector operators the query builder cannot express — live call site `lib/knowledge/retriever.ts`; string-concatenated SQL remains banned (worked example: `octively-domain-reference`, RAG section). |
| 10 | **Never expose internal UUIDs to the frontend; use `embed_key`** | Constitution line 131. `embed_key` is the public bot identity and is rotatable (commit `51319df` added key rotation); a leaked UUID is forever. |
| 11 | **Design bans:** indigo `#6366F1` banned everywhere; Sky-Teal `#0EA5E9` is the only accent; JetBrains Mono on the admin dashboard ONLY (never portal/marketing) | Constitution Design System section ("Any PR that uses JetBrains Mono on the portal fails review"). Full per-surface token rules: see `octively-ui-surfaces` and `DESIGN.md`. |

Also standing (constitution): skeleton loaders not spinners; empty states always
have a CTA; no React Query/SWR; rate-limit all public embed endpoints via
Upstash Redis.

## Change classification and required gates

Classify every change BEFORE writing code. A change takes the gates of its
**highest** class (a UI tweak that touches a payment amount is money-path).

| Class | Examples | Required gates |
|-------|----------|----------------|
| **Doc-only** | `docs/*.md`, `specs/*`, skill files, comments | Conventional commit. Build gate still applies before push (cheap insurance; docs commits ride the same deploy pipeline). No spec needed. |
| **UI** | Component styling, layout, copy on a surface | Confirm which surface FIRST (marketing/dashboard/portal/affiliate). Read `DESIGN.md` + `octively-ui-surfaces`. Design bans (#11). Copy rules: no em dashes, "Rs"/"PKR" not the rupee glyph (see `octively-docs-and-copy`). Build gate. |
| **Behavior** | New route, changed logic, new feature | Full SDD pipeline (below). Non-negotiables #5-#10. `npm test` (vitest) plus manual smoke per `docs/smoke-tests.md`. Build gate. PHR. |
| **Money-path** | Anything touching payment amounts, PayFast/Lemon Squeezy webhook verification, credits debit/refund, plan limits, pricing display | Everything in Behavior, PLUS: owner approval (below), read `specs/005-security-hardening/spec.md` first (HIGH-1: unsigned checkout amount tampering; HIGH-2: forgeable ITN (Instant Transaction Notification, PayFast's server-to-server payment webhook) when passphrase unset - both were real vulnerabilities, both fixed in `lib/billing/payfast.ts`). Never weaken `verifyItn`, amount validation, or `timingSafeEqual` comparisons. Evidence obligations: `octively-validation-and-qa`. |
| **Schema migration** | `lib/db/schema.ts` changes | See dedicated section below. |

### Schema migration gates (verified against repo, 2026-07-06)

1. Edit `lib/db/schema.ts` only. Never hand-write DDL into app code.
2. `npm run db:generate` (= `drizzle-kit generate`, config `drizzle.config.ts`,
   output `lib/db/migrations/` - currently up to `0022_notifications.sql`; this
   ceiling drifts, re-derive with `ls lib/db/migrations | tail -3`).
3. **Read the generated SQL file before applying it.** Drizzle sometimes needs
   hand edits and can generate destructive statements. Precedent: tasks required
   hand-appending HNSW index DDL to a generated migration file
   (`specs/002-phase-3-knowledge/tasks.md` T003).
4. Apply: `npm run db:migrate` (= `drizzle-kit migrate`) with `DATABASE_URL` in
   `.env.local` pointing at the target Neon database (`drizzle.config.ts`
   self-loads `.env.local`). Prod migrations are run from the dev machine
   against the prod `DATABASE_URL` (precedent: `specs/phase-1-mvp/tasks.md`
   T076). There is NO automatic migration step in the Dockerfile or
   `.github/workflows/deploy.yml` - deploys do not migrate.
5. Alternative one-shot DDL path: `app/api/internal/migrate/route.ts` - a
   kill-switched endpoint that returns 404 unless `MIGRATIONS_ENABLED=true` is
   set, and requires `CRON_SECRET` bearer auth even then. Set the flag for one
   run, then unset it. This is a **production DB operation = owner approval
   required**.
6. Order code and migration so old code + new schema coexist during the ~12 min
   deploy window (additive first; destructive cleanup in a later deploy).
7. WSL trap: Neon-touching CLI scripts can fail with "fetch failed" - see
   `octively-build-and-env` for the `ipv4first` / `wsl-net-fix.mjs` workaround.

## Owner-approval list (an AI session must NEVER decide these alone)

Stop and ask the owner before doing ANY of the following. "It seemed reasonable"
is not approval.

1. **New paid dependencies or services.** Free-tier-first is hard law
   (owner-confirmed 2026-07-06). No new API keys with billing, SaaS
   subscriptions, paid model tiers, or paid licenses without explicit sign-off.
   If a free tier exists, use it; if it does not, present the cost and wait.
2. **Pricing numbers and plan limits.** Plan prices (Starter Rs 2,500, Agency
   Rs 20,000, etc.), credit pack sizes, free-tier quotas, conversation caps.
   These are the product's unit-economics moat; changing them is a business
   decision, not an engineering one.
3. **Public marketing claims.** Anything on octively.com asserting a feature,
   number, or comparison. Verify-before-claim discipline lives in
   `octively-docs-and-copy`.
4. **Production DB operations.** Migrations against prod, data backfills,
   deletions, the `MIGRATIONS_ENABLED` endpoint, anything run in the Neon
   console.
5. **Payment amounts and webhook verification logic.** Any edit to
   `lib/billing/payfast.ts`, `lib/billing/lemon-squeezy.ts`,
   `app/api/webhooks/*` signature/amount checks, or credit grant amounts.

## The SDD pipeline (Spec-Driven Development)

Constitution Principle I: "No spec -> no code. No exceptions." Rationale recorded
there: a previous version of this product ("v6") died because code grew before
understanding did.

For any Behavior-class-or-above feature:

```
specs/<feature>/spec.md   what and why (template: .specify/templates/spec-template.md)
specs/<feature>/plan.md   architecture decisions (plan-template.md)
specs/<feature>/tasks.md  atomic, independently testable tasks (tasks-template.md)
```

Existing features to model on: `specs/phase-1-mvp` and `specs/001` through `006`
(001-phase-2-platform, 002-phase-3-knowledge, 003-ui-ux-round-2,
004-monetization-go-live, 005-security-hardening, 006-whatsapp-channel).

**PHRs (Prompt History Records):** every significant session records the verbatim
user prompt and outcome under `history/prompts/<feature>/` (or `general/`,
`constitution/`). Template: `.specify/templates/phr-template.prompt.md`; helper:
`.specify/scripts/bash/create-phr.sh --title "<t>" --stage <stage> --json`.

**ADRs (Architecture Decision Records):** live in `history/adr/` (currently
0001-0004: credits dual-store, platform admin access, unanswered-detection
heuristic, dual payment provider). Template: `.specify/templates/adr-template.md`;
helper: `.specify/scripts/bash/create-adr.sh`. **Suggestion-only, never
auto-created**: when a decision passes the significance test (long-term impact +
real alternatives considered + cross-cutting scope), suggest documenting it and
wait for user consent. Group related decisions into one ADR.

## Changelog / roadmap sync rule

When a feature is finalized and committed, prompt the owner to sync the public
marketing pages. **Verify the feature actually exists in the codebase first**
(grep for the component/route) - never mark SHIPPED on assumption.

| File | What to update |
|------|----------------|
| `components/marketing/ChangelogPage.tsx` | Add to the latest `RELEASES` entry's `items[]` (const at line ~10) |
| `components/marketing/RoadmapPage.tsx` | Move from `IN_PROGRESS`/`PLANNED` to `SHIPPED` (const at line ~9) |
| `components/marketing/PricingGrid.tsx` | Remove any `(Phase X)` tag from the matching feature string |

These are public claims: apply the copy rules and the "no oversell" discipline
from `octively-docs-and-copy`.

## Documented drift: when governance docs contradict the code

The governance docs have known stale sections. **When CLAUDE.md or the
constitution conflicts with verified current code plus
`docs/production-deployment.md`, trust the latter. Flag the drift to the owner;
do NOT silently "fix" CLAUDE.md or the constitution yourself** - governance doc
edits are themselves owner-approved changes.

Known drift as of 2026-07-06 (all verified against the repo):

| Stale claim | Where | Current truth |
|-------------|-------|---------------|
| Netlify build budget rules, "push to vercel" workflow, release branch | CLAUDE.md "Netlify Build Budget" and remotes sections | Netlify is decommissioned (`docs/production-deployment.md` line 22). Prod = Dokploy VPS via `origin master`. Vercel remote = dev/preview only. |
| Netlify as frontend host | constitution line ~260 | Hetzner CX33 + Dokploy + Traefik v3. |
| Next.js 15 | constitution line ~249 | Next.js 16.2.6 (`package.json`). Root `proxy.ts` replaced `middleware.ts`. |
| Default model `deepseek/deepseek-v4-flash` | constitution line ~255 | LiteLLM-style wrapper `lib/ai/litellm.ts` -> OpenRouter; default set by `LITELLM_DEFAULT_MODEL` env var (CLAUDE.md says llama-3.3-70b free). Verify the env var, not the docs. |
| "owflex.com" / OwFlex naming, "three subdomains" | constitution lines ~101-114, CLAUDE.md | Product is Octively on octively.com; there are FOUR surfaces - `affiliates.octively.com` -> `/affiliate` was added later (`proxy.ts` line ~45). |
| Zod schemas in `lib/validators` | constitution DRY section | No `lib/validators` dir exists; schemas live beside routes/lib modules. |
| "Commit embed/dist/embed.min.js" | CLAUDE.md embed rule | The served file is `public/embed.js` (`app/embed.js/route.ts`); `.gitignore` line 37 lists `embed/dist/embed.min.js` yet the file remains git-tracked. Commit whatever `git status` shows changed after `npm run build:embed`, which includes `public/embed.js`. |

Everything NOT listed here in the constitution (SDD, SOLID, tenant isolation,
debit-first, error shape, design bans) is current and binding.

## When NOT to use this skill

| You are trying to... | Use instead |
|----------------------|-------------|
| Diagnose a failure (CSP, deploy, payments, WSL, widget) | `octively-debugging-playbook` |
| Run the deploy pipeline, Dokploy ops, rollback mechanics, cron, DNS | `octively-run-and-operate` |
| Learn what past incidents looked like in depth | `octively-failure-archaeology` |
| Write docs or product copy, house style | `octively-docs-and-copy` |
| Build UI, choose tokens/typography per surface | `octively-ui-surfaces` |
| Understand WHY the architecture is shaped this way | `octively-architecture-contract` |
| Set up the dev environment, fix WSL/npm/Neon traps | `octively-build-and-env` |
| Decide what evidence a change needs, write tests | `octively-validation-and-qa` |
| Add or change an env var / feature flag | `octively-config-and-flags` |

## Provenance and maintenance

Authored 2026-07-06, revised 2026-07-07 (added second sanctioned raw-SQL exception —
parameterized `db.execute(sql\`...\`)` for pgvector; migration ceiling 0021 → 0022).
Every claim above was verified by
reading the cited file or `git show`-ing the cited commit on that date.

Re-verification one-liners (run from the repo root; these facts drift):

```bash
cd "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas"
# build scripts still as documented (build, build:embed cp target, db:generate/migrate)
grep -E '"build|db:' package.json
# push->deploy chain still triggers on master and hits Dokploy
grep -nE "branches|application.deploy|no-cache-filters" .github/workflows/deploy.yml
# embed route still serves public/embed.js
grep -n "public/embed" app/embed.js/route.ts
# migration kill switch still exists
grep -n "MIGRATIONS_ENABLED" app/api/internal/migrate/route.ts
# latest migration number
ls lib/db/migrations | tail -3
# incident commits still resolve
git show --no-patch --format="%h %s" df6c44c 94fbb80 bb6b66c
# ADR inventory
ls history/adr/
# constitution drift markers (should shrink if the owner updates it)
grep -cinE "netlify|deepseek|next.js 15|owflex" .specify/memory/constitution.md
# Netlify decommission statement
grep -n "decommissioned" docs/production-deployment.md
# changelog/roadmap consts still named RELEASES / SHIPPED
grep -n "const RELEASES\|const SHIPPED" components/marketing/ChangelogPage.tsx components/marketing/RoadmapPage.tsx
```

If any re-verification fails, update THIS skill (an owner-visible change under
`.claude/skills/`), and check whether sibling skills cite the same fact.
