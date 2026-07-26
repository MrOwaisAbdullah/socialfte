---
name: octively-research-frontier
description: Load when asked "what should Octively build next to win on cost/reliability", "where can Octively actually beat competitors technically", "is there a frontier/research angle here", or before proposing any new AI-reliability, RAG, eval-harness, WhatsApp, iframe-sandbox, or benchmark-publication work — lists the OPEN/CANDIDATE/GATED problem set under the north star "cheapest reliable AI option, Pakistan-first", each with why-SOTA-fails, Octively's specific asset, the first 3 concrete repo steps, and a falsifiable milestone. Also load when nominating a NEW frontier item, to apply the evidence bar before anyone starts building. (For GTM/customer-acquisition/growth ideas — "how do we get more customers" rather than technical R&D — use octively-paying-customers-campaign instead.)
---

# Octively Research Frontier

North star (owner-confirmed, 2026-07-06): **"cheapest reliable AI option, Pakistan-first."** Every
item below is a candidate lever for that north star — not a task list. Every item is explicitly
labeled `OPEN`, `CANDIDATE`, or `GATED`. Nothing here is validated or scheduled. Promoting any item
into actual work goes through `octively-change-control` (spec → plan → tasks) and, if it touches
claims/methodology rigor, `octively-research-methodology`.

## When NOT to use this skill

| You need | Use instead |
|---|---|
| The evidence bar / predict-numbers-first discipline for turning a hunch into an accepted change | `octively-research-methodology` |
| GTM tactics for getting paying customers (the actually-hardest live problem) | `octively-paying-customers-campaign` |
| How LLM routing economics / RAG math work today (the "as-built" domain theory) | `octively-domain-reference` |
| Why a past attempt at one of these was reverted or rejected | `octively-failure-archaeology` |
| Cost-per-conversation worked examples / margin math | `octively-unit-economics-toolkit` |
| Gating rules for spending / new deps / production changes | `octively-change-control` |

## How to read this skill

Each item has four parts, in order:
1. **Why SOTA/competitors fail here** — the gap Octively could exploit.
2. **Octively's asset** — what already exists in this repo that a competitor doesn't have.
3. **First 3 concrete steps** — file paths and commands, in THIS repo, to start investigating (research, not shipping).
4. **Result-when** — a falsifiable, measurable condition. If you can't state a number, it isn't a milestone yet.

---

## 1. Free-model reliability engineering — `OPEN`

**Problem:** Making OpenRouter `:free` model variants production-reliable enough to be the default
serving path, not just an opportunistic discount.

**Why competitors fail here:** Every direct competitor (Stammer.ai, ChatLab, ConvoCore — see
`docs/octively-usp-competitive-analysis.md:14-16`) bills per-message on top of a subscription
($0.001-$0.03/msg for Stammer). None of them have a reason to chase zero-cost inference — their
margin model depends on metered usage. Octively's model is flat-fee, so free-tier LLM calls are pure
margin, but only if they're reliable enough that "free" doesn't mean "flaky."

**Octively's asset (verified in repo):**
- `lib/ai/litellm.ts:14-32` (`FREE_VARIANTS` map) — 10 models with confirmed `:free` OpenRouter
  variants, already wired via `buildModelPayload()` (`litellm.ts:179-194`) which sends an OpenRouter
  `models: [freeVariant, paidModel]` fallback array so a 429/failure on the free tier falls through to
  paid **inside the same request** — no extra round trip for the caller.
- `lib/ai/free-quota.ts` — Redis-backed RPM/RPD counters (`FREE_RPM_LIMIT=20`, `FREE_RPD_LIMIT=1000`,
  `free-quota.ts:21-22`) that pre-empt the free attempt once quota is exhausted, avoiding the ~500ms
  429 round-trip cost noted in the comment at `litellm.ts:172-177`.
- `messages.modelUsed` (`lib/db/schema.ts:159`) already records which model **actually served** each
  request (OpenRouter returns the real served ID in the response `model` field — `litellm.ts:441`),
  so free-vs-paid-fallback is already distinguishable per message, retroactively, with zero new
  instrumentation.
- **Gap (confirmed, not built):** no success/failure health scoring per free variant, no auto-demotion
  of a variant that's degrading, no dashboard rollup of free-tier hit rate. `routing_decisions`
  (`lib/db/schema.ts:335-352`) tracks classifier routing (light/strong model choice) but does NOT
  track free-vs-paid-variant outcome — that signal currently only exists implicitly in
  `messages.modelUsed`, unaggregated.

**First 3 concrete steps (research, in this repo):**
1. Write a read-only query against `messages.modelUsed` grouped by whether the value matches a
   `FREE_VARIANTS` value (free) vs its paid key (fallback) vs neither (unrelated model), over the
   last N days. Prototype in `scripts/` (read-only, no schema change) — this is the baseline
   free-hit-rate measurement that doesn't exist today.
2. Cross-reference that query's "fallback" rows against `messages` timestamps clustered near known
   OpenRouter free-tier outage windows (if any logged) to see whether fallback correlates with time-of-day
   (many free providers throttle regionally) — this tells you whether health scoring should be
   time-aware or provider-aware.
3. Draft (do not implement) a `routing_decisions`-style extension or a new lightweight table capturing
   `{ model, variantTried, variantServed, timestamp }` per chat call, and estimate its write-path cost
   against the debit-first credits pattern (`lib/credits`) so instrumentation doesn't add latency to
   the hot path.

**Result-when:** You have a result when you can report, from real production data, a measured p95
free-tier success rate (requests served by the `:free` variant without falling to paid) across at
least 7 consecutive days, AND the platform-wide unanswered/error rate over that window is at or below
the rate measured for pure-paid-model serving over a comparable prior window. Until both numbers
exist side by side, this stays `OPEN`.

---

## 2. Hybrid RAG at zero infra cost — `CANDIDATE`

**Problem:** Retrieval today is vector-only cosine similarity on the same Neon Postgres instance
(`lib/knowledge/retriever.ts:48,56` — `ORDER BY embedding <=> ...::vector`, no minimum-threshold gate
per the comment at `retriever.ts:10`). Pure-vector retrieval misses exact keyword/entity matches
(product SKUs, proper nouns, numbers) that a lexical index would catch trivially.

**Why competitors fail here:** RAG-capable competitors either don't offer document RAG at all in the
lower tiers, or bolt on a separate vector-DB service (cost + latency + another vendor to manage).
Octively already has Postgres in the hot path for every query — a lexical index is a schema addition,
not a new service. This is a genuine "free" quality lever available specifically because of Octively's
existing zero-extra-infra stack.

**Octively's asset (verified in repo):**
- `docs/feature-difficulty-ranking.md:27` already scopes this exact idea: "Hybrid RAG (vector +
  full-text) | ~1 wk | None (Postgres only) | tsvector + GIN index + union re-rank (RRF). No third
  party, but algorithmic care + eval."
- `lib/knowledge/embedder.ts` — embeddings are Jina `jina-embeddings-v3` (default, `api.jina.ai`,
  1024-dim, `embedder.ts:62-66`) or local ONNX BGE-M3 (`EMBEDDING_PROVIDER=onnx`, `embedder.ts:11,24-26`),
  matching the `documents.embedding vector(1024)` column (`lib/db/schema.ts:280`). Note: this
  contradicts stale drift elsewhere claiming Gemini text-embedding-004/768-dim — trust the schema and
  `embedder.ts`, not old docs.
- `lib/knowledge/retriever.ts` is a single, short, readable file — the union/RRF logic has one clear
  integration point, not a scattered pipeline.

**First 3 concrete steps (research, in this repo):**
1. Read `lib/knowledge/retriever.ts` fully and confirm the exact `document_chunks` columns available
   for a `tsvector` companion column (chunk text field name, chunk table name) — needed before writing
   any migration.
2. Draft (do not run) a migration sketch adding a generated `tsvector` column + GIN index on the chunk
   text column, and a second query path doing `plainto_tsquery` ranked by `ts_rank`, kept separate from
   the existing vector query in `retriever.ts`.
3. Draft the RRF (Reciprocal Rank Fusion) union step as a pure function taking two ranked ID lists
   (vector-ranked, lexical-ranked) and returning one merged ranking — write it as a standalone,
   testable unit before touching `retriever.ts`'s call site, so item 3 (eval harness) can score it in
   isolation.

**Result-when:** You have a result when a retrieval eval set (see item 3 — doesn't exist yet, build it
first) shows a measurable recall lift (e.g., correct-chunk-in-top-k rate) for hybrid vs vector-only on
the same query set, at latency within the existing p95 budget for `retriever.ts`. No eval set, no
result — this is why item 3 is a prerequisite, not a parallel nice-to-have.

---

## 3. Retrieval/answer eval harness — `OPEN` (foundational — blocks items 1 and 2)

**Problem:** There is no golden Q/A regression harness in this repo today. Confirmed by search: no
`golden`, no eval fixture files, no automated retrieval-quality regression test. The only RAG-adjacent
test is `tests/integration/retrieval-isolation.test.ts`, which verifies **tenant isolation**
(bot A can't retrieve bot B's chunks) — it does not score answer quality or retrieval recall.

**Why this matters (why SOTA fails here too):** Competitors publish no reproducible quality numbers
either — "good RAG" claims in this market are universally unverifiable. An eval harness is not just
an internal QA tool, it's the prerequisite instrument for making any defensible "cheapest reliable"
claim (see item 6) and for A/B-ing any change to items 1 or 2 without guessing.

**Octively's asset:** `tests/vitest.config.ts` and the existing integration test pattern
(`tests/integration/chunker.test.ts`, `credits-routing.test.ts`, `retrieval-isolation.test.ts`) give a
ready-made test runner and file convention to extend — this is infrastructure reuse, not a new tool
choice.

**First 3 concrete steps (research, in this repo):**
1. Pick 2-3 existing bots with real documents (check `lib/db` via a read-only query for bots with
   `documents` rows) and hand-write 10-20 golden Q/A pairs per bot, each tagged with the expected
   source chunk(s) — store as a fixture file under `tests/integration/fixtures/` (new subfolder,
   doesn't exist yet — confirm before creating).
2. Write a scoring script (new file, e.g. `tests/integration/retrieval-eval.test.ts` following the
   existing `*.test.ts` convention in that folder) that runs each golden question through
   `lib/knowledge/retriever.ts` and checks whether the expected chunk ID appears in the top-k results —
   this is a recall metric, not an LLM-judged answer-quality metric; start with recall, it's cheaper
   and more deterministic.
3. Run `npm test` (per `tests/vitest.config.ts`) to confirm the new eval test executes cleanly
   alongside the existing 3 integration files, and capture the baseline recall number before touching
   anything in items 1 or 2.

**Result-when:** You have a result when a fixture set of at least 30 golden Q/A pairs across at least
2 real bots produces a repeatable recall score on every `npm test` run, with the baseline number
written down somewhere durable (e.g., a comment in the test file or `docs/`) so future changes can be
compared against it. Until a baseline number is captured once, this stays `OPEN`.

---

## 4. WhatsApp-first conversational commerce — `GATED`

**Problem:** Pakistani SMB buyers are on WhatsApp, not browsing website chat widgets. A widget-only
product misses the channel where the target customer's customers actually are.

**Why competitors fail here:** WhatsApp Business Solution Provider (BSP) pricing structurally excludes
Pakistani SMBs — conversation-based BSP fees plus markup make WhatsApp bots economically unviable at
Octively's price point. `docs/whatsapp-custom-integration-costing.md` and
`specs/006-whatsapp-channel/spec.md` note the design goes **direct to Meta Cloud API, no BSP**, and
every reply lands inside Meta's free 24-hour customer-service window (`spec.md` overview section) —
so the marginal cost is just LLM inference, already metered by the existing credit system.

**Status — explicitly gated, not buildable now:** `specs/006-whatsapp-channel/spec.md:5` — "**Status**:
Planned (build only after ~10 paying customers)." `docs/feature-difficulty-ranking.md:68,70` confirms
this is a deliberate GTM feature freeze: "no major new build before ~10 paying customers" and ranks
WhatsApp as Tier 4 (hardest tier) specifically because of this gate, not because it's unspecced — the
full blueprint (spec, plan, data model, contracts) already exists in `specs/006-whatsapp-channel/`.

**Octively's asset:** the spec is fully written (`specs/006-whatsapp-channel/{spec,plan,research,data-model}.md`
+ `contracts/`) and the free 24h-window reply architecture + existing credits system are both already
designed to plug in without new billing infrastructure.

**First 3 concrete steps:** None — this is intentionally not a research task right now. The correct
action if this item comes up is to check current paying-customer count (see
`octively-paying-customers-campaign`) against the ~10 threshold, not to start building.

**Result-when (the gate, not a milestone):** Re-open for research/build only after Octively has ~10
paying customers, per the owner-set threshold. Before that number is hit, treat any WhatsApp work
request as a scope violation of the GTM feature freeze — flag it, don't build it.

---

## 5. Iframe-sandboxed embed as a security differentiator — `OPEN`

**Problem:** The embed widget currently runs via direct script injection
(`<script src=".../embed.js">`), not a sandboxed iframe. Confirmed: no `sandbox` attribute anywhere in
`embed/src/embed.js`. `components/marketing/SecurityPage.tsx:193,259` already tells prospects this is
"**Coming soon**" — the product's own marketing copy has made a forward-looking promise that isn't
built yet.

**Why competitors fail here (framed correctly — this is a differentiator, not a defense):** Intercom,
Drift, and Tidio offer iframe-sandbox options as an enterprise trust signal. Most no-code chatbot
builders at Octively's price tier don't bother — it's extra engineering for a feature SMB clients
rarely ask for explicitly, but security-conscious website owners and enterprise-adjacent clients do
notice its absence.

**Octively's asset:** the target architecture is already scoped in `CLAUDE.md`'s "TODO — iframe
Sandbox Refactor (Security)" section: target `sandbox="allow-scripts allow-forms"`, null-origin
isolation, explicit file scope (`embed/src/embed.js`, `app/embed.js/route.ts`, `app/api/embed/route.ts`,
client-side install instructions). The current origin-locking + embed-key validation approach
(present-day mitigation) is a known, named, explicitly-scoped weak point, not an unknown one.

**First 3 concrete steps (research, in this repo):**
1. Read `embed/src/embed.js` end to end and list every DOM/window API it currently touches on the host
   page (it needs host-page access today for widget positioning/injection) — this is the compatibility
   surface that a sandboxed iframe with `allow-scripts allow-forms` only would have to either preserve
   via `postMessage` or drop.
2. Read `app/embed.js/route.ts` and `app/api/embed/route.ts` to map exactly what each currently serves
   and validates (embed key check, origin check) so the iframe boundary doesn't silently bypass an
   existing security check.
3. Check `docs/smoke-tests.md` section 5 (`5.1` — `/embed.js` returns JS,
   `docs/smoke-tests.md:73`) and section 12 (`12.1`/`12.2` — chat API embed-key validation,
   `docs/smoke-tests.md:168-169`) as the existing manual QA baseline the sandboxed version must still
   pass, then draft (don't build) an updated smoke-test checklist for the iframe variant.

**Result-when:** You have a result when the widget runs with `sandbox="allow-scripts allow-forms"` in
a null-origin iframe AND passes the existing embed-related smoke-test checks (`docs/smoke-tests.md`
sections 4.7, 5.1, 6.2, 12.1, 12.2, or their post-refactor equivalents) with feature parity — same
positioning, same chat flow, same lead capture. Per repo rules: after any `embed/src/embed.js` change,
`npm run build:embed` must be run before `npm run build` (non-negotiable, see CLAUDE.md's Embed Widget
Build Rule) — a sandbox refactor doesn't get a build-gate exception.

---

## 6. Cheapest-reliable benchmark publication — `CANDIDATE` (external positioning, gated on rigor)

**Problem:** Octively's pricing claim (60-80% cheaper than Stammer.ai/ConvoCore/ChatLab — see
`docs/octively-usp-competitive-analysis.md:14-16,47-49`) is currently a subscription-price comparison,
not a cost-per-conversation or reliability comparison. Competitors' real per-conversation cost
(subscription + Stammer's $0.001-$0.03/msg usage fee, `docs/octively-usp-competitive-analysis.md:76`)
is not apples-to-apples with Octively's flat-fee model without a worked, reproducible calculation.

**Why competitors fail here:** none of the three named competitors publish reproducible cost-per-conversation
methodology — pricing pages show subscription tiers only, usage fees are disclosed separately and
inconsistently. A rigorous, reproducible, published comparison would be a first in this niche.

**Octively's asset:** `docs/octively-usp-competitive-analysis.md` already has the raw pricing inputs
gathered. `octively-unit-economics-toolkit` (sibling skill) has cost-per-conversation worked-example
recipes ready to apply.

**First 3 concrete steps (research, in this repo):**
1. Re-read `docs/octively-usp-competitive-analysis.md` in full and separately list which numbers are
   sourced (pricing pages, dated) vs which are estimates, so the eventual publication can cite sources
   per line.
2. Using the eval harness from item 3 (once it exists) plus real production credit-debit data, compute
   Octively's own actual cost-per-conversation (not list price) across a real sample of bots/orgs.
3. Draft (don't publish) a side-by-side methodology doc modeling a competitor's cost-per-conversation
   from their disclosed subscription + usage-fee structure, using the same conversation-volume
   assumptions on both sides.

**Result-when:** You have a result — and only then may anything be said publicly — when the comparison
meets the reproducibility bar defined in `octively-research-methodology` AND any public-facing claim
text has passed through `octively-docs-and-copy`'s claims-discipline gate. This item produces no public
claim on its own; it produces the evidence a claim would need.

---

## How to nominate a new frontier item

A new candidate item earns a place in this file only after clearing all of the following. This bar
exists because v6 (an earlier iteration of this codebase) died of unvalidated building — the WhatsApp
gate above (item 4) is the model to imitate, not the exception.

1. **Evidence bar** — the "why SOTA fails" claim must be traceable to something concrete: a competitor
   pricing page, a support/failure pattern observed in this repo's own logs, or a documented
   spec/plan. Not a hunch, not "I think competitors probably don't do X."
2. **Asset check** — name the specific file(s)/table(s)/existing capability that gives Octively a real
   starting advantage. If there is no existing asset, the item might still be worth doing, but it is
   not a "frontier" item — it is ordinary roadmap work, and belongs in
   `docs/feature-difficulty-ranking.md`, not here.
3. **Owner sign-off** — per CLAUDE.md, no new paid dependencies/services and no pricing/plan-limit/
   public-claim decisions without explicit owner approval. Any frontier item that would require a paid
   service to even investigate needs sign-off before step 1 of its "first 3 steps," not after.
4. **YAGNI guard** — ask explicitly: would building this without a validated signal repeat the v6
   mistake? If the honest answer is "we don't know anyone wants this yet," the item must ship labeled
   `GATED` with a stated, measurable gate condition (see item 4's "~10 paying customers" as the
   template), not `OPEN` or `CANDIDATE`.
5. **Falsifiable milestone required** — if you cannot write a "you have a result when <measurable
   outcome>" sentence with a real number or a real repeatable measurement in it, the item is not ready
   to add. Rewrite it until it has one, or don't add it yet.
6. **Routing** — once validated enough to actually start work, promotion out of this file and into a
   real spec goes through `octively-change-control` (spec → plan → tasks), and any claim about results
   goes through `octively-research-methodology`'s predict-numbers-first discipline before anyone treats
   it as true.

---

## Provenance and maintenance

Date-stamped: 2026-07-06, revised 2026-07-07 (description now disambiguates vs
octively-paying-customers-campaign for GTM questions). Repo state at commit `6a9b946` and earlier,
master branch — verify against
`git log -1` before trusting file:line references below if this skill feels stale.

Re-verification commands (run from repo root, quote the path — it contains spaces):

```bash
cd "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas"

# Item 1 — confirm FREE_VARIANTS list and free-quota limits haven't drifted
grep -n "FREE_VARIANTS\|FREE_RPM_LIMIT\|FREE_RPD_LIMIT" lib/ai/litellm.ts lib/ai/free-quota.ts

# Item 1 — confirm routing_decisions schema hasn't gained free/paid outcome tracking yet
grep -n -A 20 "ROUTING DECISIONS" lib/db/schema.ts

# Item 2 — confirm retriever is still vector-only (no tsvector/GIN yet)
grep -n "tsvector\|GIN\|<=>\|embedding" lib/knowledge/retriever.ts

# Item 2 — confirm embedding provider/dimension (do NOT trust old Gemini/768-dim claims elsewhere)
grep -n "PROVIDER\|DIMENSIONS\|jina-embeddings" lib/knowledge/embedder.ts
grep -n "embedding.*vector(" lib/db/schema.ts

# Item 3 — confirm no eval harness has been added since this was written
ls tests/integration/
grep -rln "golden" tests/ 2>/dev/null

# Item 4 — confirm the WhatsApp gate status/threshold hasn't changed
grep -n "Status" specs/006-whatsapp-channel/spec.md

# Item 5 — confirm the iframe sandbox is still not built (re-check before assuming it's still open)
grep -n "sandbox=" embed/src/embed.js
grep -n "Coming soon" components/marketing/SecurityPage.tsx

# Item 6 — confirm competitor pricing figures haven't changed
grep -n "Stammer\|ConvoCore\|ChatLab" docs/octively-usp-competitive-analysis.md
```
