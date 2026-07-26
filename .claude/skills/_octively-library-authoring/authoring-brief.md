# Octively Skill Library — Common Authoring Brief (read this FIRST, follow it exactly)

Date of authoring: 2026-07-06. Repo: `/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas`

## Mission
You are authoring ONE skill in a 16-skill library that lets a zero-context, Sonnet-class AI session
(or a mid-level human engineer) debug, extend, validate, and advance the Octively SaaS at
principal-engineer standard. Your skill must be self-sufficient for its scope and defer to named
sibling skills for everything else.

## Hard rules (violating any of these fails review)
1. **Write ONLY inside `.claude/skills/<your-skill-name>/`**. The rest of the repo is READ-ONLY.
   No mutating git commands (no add/commit/checkout/stash). No npm install. No DB writes.
2. **Ground truth only.** Verify EVERY command, flag, path, table name, env var, and claim against
   the repo (Read/Grep/Bash read-only) before stating it. If you cannot verify something, either
   omit it or label it explicitly `UNVERIFIED`. A wrong runbook is worse than none.
3. **Format:** `.claude/skills/<name>/SKILL.md` with YAML frontmatter:
   ```yaml
   ---
   name: <skill-name>
   description: <trigger-rich, one long sentence-or-two: exactly WHEN a model should load this skill — name symptoms, tasks, file paths, error messages that should trigger it>
   ---
   ```
   You may add `references/*.md` and `scripts/*` inside your own skill dir if genuinely useful.
4. **Audience voice:** imperative runbook voice ("Run X. If you see Y, do Z."). Copy-pasteable
   commands with correct quoting for the repo path (it contains spaces — always quote or cd first).
   Define every jargon term once. Use tables and checklists. Assume ZERO project lore.
5. Each skill MUST contain a **"When NOT to use this skill"** section pointing to the right sibling.
6. Each skill MUST end with a **"Provenance and maintenance"** section: date-stamp (2026-07-06),
   and one-line re-verification commands for every volatile fact (things that drift: versions,
   env var lists, plan prices, model names, file paths).
7. **No oversell.** Unproven/planned things stay labeled "open" / "candidate" / "planned".
   Never mark something SHIPPED/working without verifying it exists in the codebase.
8. **Never route around change control.** If your skill tells the reader to change behavior,
   it must route through the gates in `octively-change-control` (reference it by name).
9. Do NOT cite user-private paths (e.g. `~/.claude/projects/.../memory/`) as sources. Embed the
   knowledge itself in the skill.
10. Date-stamp volatile facts inline, e.g. "(as of 2026-07-06)".
11. Product copy rules apply to any user-facing copy you show as examples: never em dashes,
    never the ₨/₹ glyph (write "Rs" or "PKR"), USD as $.

## Verified project facts (you may rely on these; still spot-check what you cite)
- Product: **Octively** — white-label AI chatbot builder for freelancers/agencies, Pakistan-first
  (PKR via PayFast) + international (USD via Lemon Squeezy). Live in production.
- **FOUR surfaces** routed by hostname in root `proxy.ts` (Next.js 16 convention, replaces middleware.ts):
  - `octively.com` → marketing `(app/(marketing))`
  - `admin.octively.com` → rewrite to `/dashboard` `(app/(dashboard))`
  - `app.octively.com` → rewrite to `/portal` `(app/(portal))`
  - `affiliates.octively.com` → rewrite to `/affiliate` `(app/affiliate)` — NEWER, added ~2026-07;
    CLAUDE.md still says "three subdomains" (documented drift, do not copy that error).
- Stack: Next.js **16.2.6** App Router, TypeScript strict, Tailwind v4, shadcn/ui, BetterAuth,
  Drizzle ORM + Neon Postgres (pgvector), Upstash Redis (credits/ratelimit), QStash (queue),
  LiteLLM-style wrapper `lib/ai/litellm.ts` → OpenRouter, Resend + Brevo email, Cloudflare R2 storage,
  Gemini text-embedding-004 (768-dim), Firecrawl scraping, vitest.
- Deploy: **master is production.** `git push origin master` → GitHub Actions
  (`.github/workflows/deploy.yml`) → Docker image → GHCR `ghcr.io/mrowaisabdullah/owflex-chat`
  → Dokploy API deploy on Hetzner CX33 VPS (Docker Swarm, Traefik v3, Cloudflare proxied DNS,
  panel https://deploy.octively.com). Netlify is DECOMMISSIONED (docs/production-deployment.md);
  CLAUDE.md's Netlify-budget section is stale drift. Vercel remote = dev/preview only.
- Build gates (non-negotiable): `npm run build` must exit 0 before ANY push; after editing
  `embed/src/embed.js` run `npm run build:embed` (rebuilds `embed/dist/embed.min.js` AND copies
  to `public/embed.js` — the file actually served) BEFORE `npm run build`.
- Commit rules: conventional commits `type(scope): description`; **NEVER add Co-Authored-By
  trailers** (historical incident: Netlify free plan counts co-authors as contributors and blocked
  builds on private repos).
- Tests: `npm test` = `vitest run --config tests/vitest.config.ts`; only 3 integration files exist
  (chunker, credits-routing, retrieval-isolation). Real deploy QA = manual `docs/smoke-tests.md`.
- Credits: debit-FIRST pattern (ADR-0001): atomic Redis DECRBY before LLM call, refund on failure,
  Postgres `credit_transactions` append-only ledger with UNIQUE refId idempotency.
- WSL dev environment traps (the machine is WSL2 on a Windows D: drive):
  - npm ENOTEMPTY on installs (no atomic dir renames) → install in small groups, check stale temp dirs.
  - Neon CLI scripts fail "fetch failed" (IPv6/undici) → run with
    `NODE_OPTIONS="--dns-result-order=ipv4first --import ./scripts/wsl-net-fix.mjs" npx tsx scripts/<x>.ts`
- Design: Sky-Teal `#0EA5E9` is the ONLY accent (indigo #6366F1 banned). Token prefixes mkt-/adm-/prt-.
  JetBrains Mono on admin dashboard ONLY. DESIGN.md at root is the visual authority (~60KB).
- Governance: constitution at `.specify/memory/constitution.md` (note: it has drift — mentions
  Netlify as frontend host, deepseek default model, Next.js 15, owflex.com naming; the live truth is
  above), specs in `specs/001..006`, ADRs in `history/adr/`, PHRs in `history/prompts/`.
- **Unwritten rule now codified (owner-confirmed 2026-07-06): NO new paid dependencies/services
  without explicit owner approval. Free-tier-first is a hard rule.** Also owner-only decisions:
  pricing numbers, plan limits, public marketing claims, production DB operations.
- Hardest live problem (owner-confirmed): **getting paying customers** (activation/conversion).
- North star (owner-confirmed): **"cheapest reliable AI option, Pakistan-first"** — unit economics moat.
- Costliest historical failure classes (owner-confirmed, all four): CSP/proxy/subdomain bugs;
  deploy/build-time traps (BuildKit caching swallowing NEXT_PUBLIC_* build-args — see deploy.yml
  `no-cache-filters: builder` comment, commits bb6b66c/ac4e5d6); payments/webhooks (specs/005
  security hardening: PayFast amount tampering + forgeable ITN); WSL environment hell.
- Repo path contains spaces — every command example must `cd "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas"` first or quote paths.

## The 16-skill inventory (cross-reference siblings BY NAME; do not duplicate their content)
| Skill | One-line scope |
|---|---|
| octively-change-control | How changes are classified/gated: SDD spec→plan→tasks, non-negotiables + their incident stories, commit/push/build gates, owner-approval list, changelog/roadmap sync |
| octively-debugging-playbook | Symptom→triage tables for the failure classes (CSP/proxy, deploy/build, payments/webhooks, WSL, chat/widget/credits); discriminating experiments |
| octively-failure-archaeology | Chronicle of every major past incident/dead end/revert: symptom→root cause→evidence (commit)→status; so no one re-fights settled battles |
| octively-architecture-contract | Load-bearing design decisions + WHY, invariants that must hold, known weak points stated plainly |
| octively-domain-reference | Domain theory as applied HERE: RAG math/params, LLM routing economics, credits accounting, payment gateway protocols, multi-tenant white-label model |
| octively-config-and-flags | Catalog of every env var / feature flag: consumer paths, defaults, prod vs experimental, how to add one end-to-end (incl. NEXT_PUBLIC build-arg pipeline) |
| octively-build-and-env | Recreate the dev environment from scratch on WSL2; npm/Neon/WSL traps; build commands anatomy |
| octively-run-and-operate | Running dev + the full deploy pipeline, Dokploy ops, cron jobs, prod migrations, rollback, DNS/Cloudflare, post-deploy smoke tests |
| octively-diagnostics-and-tooling | MEASURE don't eyeball: DB inspection queries, drizzle studio, logs, analytics tables, funnel instrumentation; ships runnable scripts |
| octively-validation-and-qa | What counts as evidence; vitest suite anatomy + how to add tests; smoke-test discipline; tenant-isolation and money-flow test obligations |
| octively-docs-and-copy | Docs-of-record map, templates, house copy style (no em dashes, Rs/PKR not the rupee glyph), public-claims discipline, changelog/roadmap verification |
| octively-ui-surfaces | Distilled DESIGN.md: per-surface tokens/canvas/typography rules, theme classes, skeleton/empty-state rules, when to read full DESIGN.md |
| octively-paying-customers-campaign | EXECUTABLE decision-gated campaign for the hardest live problem: instrument→measure→gate→ranked solution menu→promotion through change control |
| octively-unit-economics-toolkit | Prove-it analysis recipes: cost-per-conversation, routing analysis, plan margin math, payment signature verification, worked examples from repo history |
| octively-research-frontier | Open problems for "cheapest reliable AI, Pakistan-first": why SOTA fails, Octively's asset, first 3 concrete repo steps, falsifiable milestones |
| octively-research-methodology | The discipline that turns a hunch into an accepted change: evidence bar, predict-numbers-first, flag lifecycle, adversarial refutation, idea provenance |

## Quality bar
- SKILL.md target: 150–450 lines. Scannable: headers, tables, checklists. Front-load the most
  load-bearing facts. If depth demands more, split into `references/*.md` and keep SKILL.md as the map.
- Every claim about "what happened historically" must carry evidence (commit hash, file path, doc).
- Prefer exact numbers over adjectives. Prefer file:line pointers over descriptions.
- End-to-end verify at least your 3 most important commands actually run (read-only ones).
