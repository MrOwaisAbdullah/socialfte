---
name: octively-docs-and-copy
description: Load when writing or updating ANY document-of-record (CLAUDE.md, DESIGN.md, constitution.md, specs/*, ADRs, PHRs, docs/*), when writing or reviewing ANY user-facing copy (marketing pages, dashboard strings, portal strings, changelog/roadmap entries, pricing/competitor claims), or when deciding "does this belong in an ADR, a spec, docs/, or the failure-archaeology skill." Trigger on symptoms and tasks like: "add this to the changelog", "mark X as SHIPPED", "write a new ADR", "create a spec for feature Y", "what's our em-dash rule", "how do I cite the rupee correctly", "is this pricing claim still accurate", "should this be a PHR or an ADR", "does a README exist", "what's stale in CLAUDE.md/constitution.md". Do NOT load for UI token/color/typography work (use octively-ui-surfaces) or for build/push/deploy gating rules (use octively-change-control).
---

# Octively Docs and Copy

Owns two things: (1) the map of every document-of-record — where it lives, what it's for,
and where it has drifted from the live codebase — and (2) the house style for all written
output, internal and external, plus the discipline for verifying external claims before they
ship. If you are about to write a sentence a user, client, or reader will see, or a file future
sessions will treat as truth, read this first.

## When NOT to use this skill

| If you need... | Use instead |
|---|---|
| UI tokens, canvas colors, typography, JetBrains Mono rules, dark mode | `octively-ui-surfaces` |
| Build/push/commit gates, SDD spec→plan→tasks workflow enforcement, owner-approval list | `octively-change-control` |
| A past incident's root cause before re-investigating | `octively-failure-archaeology` |
| Why an architectural decision was made (the reasoning itself, not the ADR file format) | `octively-architecture-contract` |

---

## 1. Docs-of-record map

Every document below was read in full or grepped to confirm it exists (as of 2026-07-06/07).
"Drift" means the file's own text contradicts the live repo — do not copy the stale claim
into new output; flag it if you touch the file.

| File | Purpose | Verified state / known drift |
|---|---|---|
| `CLAUDE.md` (root) | Agent operating rules: stack, phase, patterns, skills reference, commit rules | **Drift**: says "Three subdomains" (`octively.com`/`admin.`/`app.`) — a **fourth surface, `affiliates.octively.com` → `app/affiliate`, exists in the live repo** (added ~2026-07, evidenced by `AffiliateDetailClient.tsx` and recent commits `1acf896`, `4ad35b9` in git log). Also carries a "Netlify Build Budget" section (`docs/netlify-budget.md`) that is stale — Netlify is decommissioned per `docs/production-deployment.md`; Dokploy/Hetzner is the live deploy target. Do not repeat either stale claim. |
| `DESIGN.md` (root) | Single visual authority for all three/four surfaces — canvas colors, typography, component tokens, copy tone | Confirmed present, ~1100+ lines. **Note**: DESIGN.md itself still uses the old `owflex.com`/`admin.owflex.com`/`app.owflex.com` naming in its "Language & Copy Tone" section (line 1074) and shows old example prices with the rupee glyph (`₨2,000/month`) — both are pre-rename/pre-style-rule artifacts. Extract the *tone rules*, not the literal example strings, when quoting this section (see Section 3 below for the corrected rules). |
| `.specify/memory/constitution.md` | Governance: SOLID/DRY/YAGNI/KISS, non-negotiables, subdomain table, model choice | **Drift, confirmed by grep**: line 101 says "OwFlex ships on three subdomains"; line 249 lists `Next.js 15 App Router` (live is 16.2.6 per CLAUDE.md); line 255 lists default model `deepseek/deepseek-v4-flash` (live default per CLAUDE.md is `meta-llama/llama-3.3-70b-instruct:free` via LiteLLM); line 260 lists Frontend Host `Netlify` (decommissioned). Treat CLAUDE.md + the live repo as the source of truth over the constitution's stack table until the constitution is updated; do not propagate these four facts into new writing. |
| `specs/<feature>/` | Per-feature spec → plan → tasks, SDD pattern | Six features exist: `001-phase-2-platform`, `002-phase-3-knowledge`, `003-ui-ux-round-2`, `004-monetization-go-live`, `005-security-hardening`, `006-whatsapp-channel`, plus a `phase-1-mvp` folder. **`specs/006-whatsapp-channel/`** is the best current example of the shape: `spec.md` (with explicit Status line — e.g. "Planned (build only after ~10 paying customers)" — and an explicit Out of Scope paragraph), `plan.md`, `research.md`, `data-model.md`, `contracts/`. New specs should match this shape, not the older, thinner ones. |
| `history/adr/` | Architecture Decision Records | 4 exist: `0001` (credit dual-store), `0002` (platform admin access check), `0003` (unanswered-detection heuristic), `0004` (dual payment provider). Read `0001` in full — its shape is: Status/Date/Feature header → Decision → Consequences (Positive/Negative) → Alternatives Considered (each with Pros/Cons/Rejected reason) → References (links to spec, plan, research, related ADRs, source PHR). Template is `.specify/templates/adr-template.md` — it embeds a **significance checklist** (Impact / Alternatives / Scope, all three must be true) with the instruction: if any is false, write a PHR note instead of an ADR. |
| `history/prompts/` | Prompt History Records (PHRs) — one per meaningful user prompt | Subfolders exist per feature (`001-phase-2-platform`, `002-phase-3-knowledge`, `004-monetization-go-live`, `constitution`, `demo-video`, `general`, `phase-1-mvp`). Template: `.specify/templates/phr-template.prompt.md` — YAML frontmatter (`id`, `title`, `stage`, `date`, `surface`, `model`, `feature`, `branch`, `user`, `command`, `labels`, `links.{spec,ticket,adr,pr}`, `files`, `tests`) followed by `## Prompt`, `## Response snapshot`, `## Outcome` (Impact/Tests/Files/Next prompts/Reflection), `## Evaluation notes (flywheel)` (failure modes, grader results, prompt variant, next experiment). |
| `docs/` | Operational + GTM docs, no fixed template | Confirmed inventory (2026-07-06): `production-deployment.md` (live deploy authority — Dokploy/Hetzner), `smoke-tests.md` (manual QA checklist), `netlify-budget.md` (stale — Netlify decommissioned, keep only as historical record, don't cite as live budget), `dokploy-cron-setup.md`, `vps-dokploy-setup.md`, `embed-installation.md`, `google-ads-conversion-tracking.md`, `utm-tracking-guide.md`, `outreach-guide.md`, `octively-usp-competitive-analysis.md` (competitor pricing, see Section 4), `octively-validation-and-distribution-plan.md`, `feature-difficulty-ranking.md`, `free-tools-seo-research.md`, `whatsapp-custom-integration-costing.md`, `owflex_master_plan_v7.md`, `12_methods_to_get_saas_clients.md`, `Octively MVP Go-to-Market.md`, `Octively-saas-critic.md`, plus `blog-drafts/`, `daily-linkedin-posts-pipeline/`, `demo-assets/`, and three demo-video planning files. No enforced schema in `docs/` — file-per-topic, one-liner-in-this-table is the closest thing to an index. |
| `docs/smoke-tests.md` | Manual post-deploy QA checklist | Confirmed present; referenced by CLAUDE.md session-startup and by `octively-validation-and-qa` sibling skill for test-obligation context. |
| `README.md` (root) | — | **Does not exist.** `ls` at repo root confirms no `README.md`. If asked to add one, do not silently invent scope — flag that this is a new document-of-record and confirm content ownership (marketing README vs dev-onboarding README are different documents) before writing it. |

### Other root-level docs seen but out of this skill's scope
`ACTION-PLAN.md` and `FULL-AUDIT-REPORT.md` exist at repo root. They are point-in-time working
documents, not documents-of-record — do not treat their contents as current state without
checking their dates against today.

---

## 2. Templates — where they live, how to instantiate correctly

All SDD templates live in `.specify/templates/`:

| Template | Instantiate via | Notes |
|---|---|---|
| `spec-template.md` | `.specify/scripts/bash/create-new-feature.sh` (or copy manually) | Structure: Feature Branch/Created/Status/Input header → User Scenarios & Testing (P1/P2/P3 prioritized, each with Why this priority + Independent Test + Given/When/Then Acceptance Scenarios) → (Requirements, Success Criteria sections follow further in the file). Match `specs/006-whatsapp-channel/spec.md`'s shape for a real example, including its explicit "Status: Planned (build only after ~10 paying customers)" gating line and its explicit Out-of-Scope paragraph in the Overview. |
| `plan-template.md` | `.specify/scripts/bash/setup-plan.sh` | Pairs with spec.md; `006`'s `plan.md` + `research.md` + `data-model.md` + `contracts/` show the fuller pattern for a feature with schema/API surface. |
| `tasks-template.md` | (generated during `/sp.tasks` or manually) | Testable tasks referencing spec's user stories. |
| `adr-template.md` | `.specify/scripts/bash/create-adr.sh --title "<title>" [--json]` | Script only scaffolds the file with `{{PLACEHOLDERS}}` intact from the template — **it does not fill them**. The calling agent must fill: ID, Title, Status, Date, Feature, Context, Decision, Consequences, Alternatives Considered, References. Verified command: `.specify/scripts/bash/create-adr.sh --title "Use X" --json` prints `{id, path}`. Apply the significance checklist (Impact + Alternatives + Scope, all three) before creating one — if it fails, write a PHR instead. |
| `phr-template.prompt.md` | `.specify/scripts/bash/create-phr.sh --title "<title>" --stage <stage> [--feature <name>] [--json]` | Script scaffolds only; agent fills placeholders including the full verbatim `PROMPT_TEXT` (never truncate). Stage must be one of: `constitution`, `spec`, `plan`, `tasks`, `red`, `green`, `refactor`, `explainer`, `misc`, `general`. Routing is deterministic by stage per CLAUDE.md Section "PHR routing". |
| `checklist-template.md` | manual copy | Used for ad hoc verification checklists inside a spec folder. |
| `agent-file-template.md` | `.specify/scripts/bash/update-agent-context.sh` | Regenerates CLAUDE.md's "Active Technologies" / "Recent Changes" sections from spec metadata — do not hand-edit those two sections without checking this script's expectations. |

**Next feature number**: 6 numbered spec folders exist (001–006). A new feature spec should be `007-<slug>`.

---

## 3. House copy style (hard rules — owner-mandated, apply to ALL Octively copy)

These rules apply everywhere: marketing pages, dashboard strings, portal strings, changelog
entries, roadmap entries, emails, and any example copy you write inside a skill, doc, or PR
description.

1. **Never use em dashes (—) in Octively copy.** Rewrite with a period, a comma, or two
   sentences. This applies to UI strings, marketing copy, emails, changelog/roadmap entries —
   not to this skill's own internal documentation prose about ADRs/specs, which may use them
   for readability the same way the rest of the codebase's `.md` files do. When in doubt for
   anything a user or client will read, run it through the local `humanizer-main` skill
   (`.claude/skills/humanizer-main/SKILL.md`) before shipping.
2. **Never use the rupee glyph (₨ or ₹).** Write `Rs 2,500` or `PKR 2,500`. USD stays as `$15`
   or `USD 15`. This applies even in code comments, seed data, and skill examples — DESIGN.md's
   own "Language & Copy Tone" section still shows `₨2,000/month` (line ~1094); that is a
   pre-rule artifact, do not copy it forward.
3. **Humanize copy — avoid AI-slop patterns.** Specifically avoid: inflated symbolism
   ("a testament to..."), promotional language ("cutting-edge", "seamless", "revolutionize"),
   superficial "-ing" analyses tacked onto sentences, vague unattributed claims ("many users
   report..."), rule-of-three padding, and negative-parallelism ("it's not just X, it's Y").
   The `.claude/skills/humanizer-main/SKILL.md` skill (v2.5.1, confirmed present) implements
   Wikipedia's "Signs of AI writing" checklist against exactly these patterns — run any
   externally-visible paragraph through it before shipping.
4. **No founder-name references on public surfaces.** Confirmed by commit `13d25ca`
   ("chore(brand): remove founder name and Owais references from public surface") which
   replaced a founder testimonial/bio card with a generic team blurb, changed CTA copy from
   "Talk to Owais" to "Talk to us" / "Get in touch", and changed an email signature from a
   personal name to "Octively Team" across `AboutPage.tsx`, `ContactPage.tsx`,
   `ForFreelancersPage.tsx`, `ForAgenciesPage.tsx`, `PricingGrid.tsx`, `MarketingHome.tsx`, and
   `app/api/v1/tools/subscribe/route.ts`. Do not reintroduce a personal name, personal LinkedIn
   link, or "Founder"/"Co-founder" role label on any marketing-surface component.
5. **Per-surface tone** (extracted from DESIGN.md's "Language & Copy Tone" section, adjusted
   for the current subdomain names and the no-rupee-glyph rule above — the source section
   still uses `owflex.com` naming and the rupee glyph, both superseded):
   - **Marketing** (`octively.com`) — confident, product-led. e.g. "Give your clients a
     professional dashboard, without building one." / "Your agent, your data, your brand."
   - **Dashboard** (`admin.octively.com`) — technical, direct. Show real values: "Embed Key"
     (not "Script ID"), "Monthly message allowance" (not "API quota"), the actual model string
     (e.g. `meta-llama/llama-3.3-70b-instruct:free`) in JetBrains Mono, "Credit balance: $4.20"
     (not "Tokens remaining").
   - **Portal** (`app.octively.com`) — plain, warm, bilingual-friendly. "Customers who
     chatted" (not "Conversation sessions"), "Phone numbers captured" (not "Lead count"),
     "Questions we couldn't answer" (not "Unanswered queries"), "Your agent" (not "Bot
     instance"). Urdu-subtitle + English-label pairing is acceptable here (e.g. "Aaj ke leads,
     Today's new leads") but is unverified as a shipped pattern beyond DESIGN.md's example
     — confirm a live component uses it before citing it as current practice.
   - **Affiliate** (`affiliates.octively.com`) — not covered in DESIGN.md's tone section (this
     surface postdates that section). No documented tone rule exists yet; default to the
     dashboard's direct, technical register since affiliates are developer-side users, and
     flag the gap if you're asked to write a large amount of affiliate copy.

---

## 4. Public-claims discipline (external positioning)

Anything that becomes a public claim (changelog, roadmap, pricing page, competitor comparison,
security page) must be checked against the actual codebase before publishing. Wrong external
claims are a trust and legal-risk issue, not just a style issue.

### Changelog / Roadmap verification (CLAUDE.md rule, restated with the actual files)

- `components/marketing/ChangelogPage.tsx` has a `RELEASES` array with an `items[]` per entry
  (confirmed structure).
- `components/marketing/RoadmapPage.tsx` has three arrays: `SHIPPED`, `IN_PROGRESS`, `PLANNED`
  (confirmed by grep — lines 9, 51, 57).
- `components/marketing/PricingGrid.tsx` embeds `(Phase N)` tags on features still in
  progress, e.g. `'WhatsApp Business API channel (Phase 6)'` (confirmed at line ~124/149/232);
  a regex (`/\s*\(Phase \d+\)/`) strips the tag for display in one place but the raw string
  still carries it in the data array. **Never remove a `(Phase N)` tag or move an item into
  `SHIPPED[]` without first grepping the codebase for the feature's actual implementation**
  (route file, component, migration) — this is a direct instruction from CLAUDE.md's
  "Changelog + Roadmap Sync Rule," repeated here because it's the single most common way an
  unverified claim reaches production. Ask the user for confirmation before editing these
  three files even after you've verified the code exists — CLAUDE.md requires the prompt
  "Feature X is now in the codebase. Should I add it to ChangelogPage.tsx (RELEASES) and move
  it to SHIPPED in RoadmapPage.tsx?"

### Pricing / competitor claims

`docs/octively-usp-competitive-analysis.md` is the source for competitor pricing claims.
Confirmed figures in that file (as of the doc's own writing, treat as **dated mid-2026, do
NOT republish without re-checking the competitor's current pricing page first**):

| Competitor | Free tier | Entry paid | White-label tier |
|---|---|---|---|
| Stammer.ai | 14-day trial only | $49/mo (5 agents, no WL) | $197/mo (20 agents) or $497/mo (full WL) |
| ChatLab | Free tier | $15/mo | $360/mo (25 bots, full WL + client portal) |
| ConvoCore | 50 credits | $49/mo (partial WL) | $197/mo (most WL) / $497/mo (complete WL) |

Octively's own pricing (Starter/Agency tiers, Rs figures) is an **owner-only decision** per
CLAUDE.md — do not alter plan prices, plan limits, or these competitor comparison numbers
without explicit owner approval, and re-verify the competitor's number by visiting their
current pricing page (not memory) before any external republish.

### Feature-status claims tied to open TODOs

- **Voice input**: CLAUDE.md explicitly permits marketing voice input as "upcoming" on the
  public roadmap but forbids building it before a paying customer asks. If you see or write
  copy claiming voice input is available today, that is a false claim — it must stay in
  `PLANNED[]`, never `SHIPPED[]`.
- **iframe sandbox isolation (embed widget security)**: `components/marketing/SecurityPage.tsx`
  (lines ~193 and ~259, confirmed) currently says "Coming soon: iframe sandbox isolation... The
  iframe sandbox (coming soon) will make this architecturally impossible." CLAUDE.md's own TODO
  section confirms this is genuinely **not started** (Status: TODO). Keep the security page's
  claim as "coming soon," not "available" or "in progress," until the iframe refactor actually
  lands — check `embed/src/embed.js` for `sandbox=` attribute usage as the ground-truth signal
  before ever upgrading this claim.

### OSS-license discipline

Never host, fork, or embed copyleft or "source-available" competitor code (e.g. FSL-licensed
projects such as Typebot, confirmed as an adjacent competitor in project memory) inside this
white-label SaaS. The pattern is: study the competitor's UX/feature idea, verify its license
before touching any of its code or assets, then build a native implementation. This applies to
any future "inspired by X" feature (e.g. `specs/006-whatsapp-channel/spec.md`'s "inspired by
WhatChimp" framing is idea-level only, not code-level — confirm no WhatChimp code or assets are
ever vendored).

---

## 5. Where new knowledge goes (one home per fact)

| Kind of new knowledge | Goes in | Not in |
|---|---|---|
| An architectural decision with real alternatives and lasting impact | New ADR in `history/adr/` via `create-adr.sh`, only if the 3-part significance test (Impact + Alternatives + Scope) passes | A docs/ file, a code comment, this skill |
| A past incident, bug, or reverted approach | `octively-failure-archaeology` skill (chronicle format: symptom → root cause → evidence commit → status); optionally cross-link from `docs/` if it's GTM/ops-relevant | An ADR (ADRs are forward decisions, not incident logs) |
| A new feature to be built | New `specs/<NNN-feature-name>/spec.md` using `spec-template.md`, following `006`'s shape | A docs/ file or a chat message with no artifact |
| A marketing/GTM insight (competitor move, pricing benchmark, channel result) | A file in `docs/` (topic-named, no fixed template) | An ADR or a spec |
| Any user prompt that produced non-trivial work | A PHR in `history/prompts/<feature-or-general>/` via `create-phr.sh` | Left undocumented |
| A UI/token decision | `octively-ui-surfaces` skill's scope, or DESIGN.md itself if it's a new rule | This skill |
| A change-gate or approval-process rule | `octively-change-control` skill's scope | This skill |

---

## Provenance and maintenance

Date-stamped: 2026-07-07. Re-verify these volatile facts before trusting them in a future
session:

- **Subdomain count / affiliate surface existence**: `grep -n "affiliate" proxy.ts` and
  `ls app/affiliate` — confirm the fourth surface is still live and CLAUDE.md still says
  "three subdomains" (if CLAUDE.md has been fixed, update this skill's drift note).
- **Constitution drift facts** (Next.js 15, deepseek default, Netlify host, three subdomains):
  `grep -n "Next.js 15\|deepseek\|Netlify\|three subdomains" .specify/memory/constitution.md`
  — if any line is gone, the constitution has been updated; remove that bullet from this file.
- **ADR/spec/PHR counts**: `ls history/adr | wc -l`, `ls specs`, `ls history/prompts` — update
  the counts and "next feature number" above when they change.
- **README existence**: `ls README.md` at repo root (run from
  `cd "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas"` since the path has spaces).
- **Competitor pricing table**: re-visit Stammer.ai, ChatLab, and ConvoCore's live pricing
  pages before republishing any comparison; the table above is sourced from
  `docs/octively-usp-competitive-analysis.md`, itself a point-in-time snapshot.
- **iframe sandbox status**: `grep -n "sandbox=" embed/src/embed.js` — if this now returns a
  match, the "coming soon" claim on `SecurityPage.tsx` is stale and should be promoted (through
  `octively-change-control`, not directly).
- **Changelog/Roadmap arrays**: `grep -n "SHIPPED\|IN_PROGRESS\|PLANNED" components/marketing/RoadmapPage.tsx`
  and `grep -n "RELEASES" components/marketing/ChangelogPage.tsx` to confirm structure hasn't
  changed shape.
