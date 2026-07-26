---
name: octively-research-methodology
description: Load before accepting ANY claim that a change, experiment, or optimization "worked" in this repo — covers the evidence bar (one mechanism must explain every observation, numbers predicted before the run, adversarial refutation before acceptance), the real idea lifecycle from hunch to spec to flag-guarded code to default-on/retirement, when an ADR is required and how the four existing ones model the form, where good ideas have historically come from here (competitor teardowns, self-critique, post-mortems, security audits, smoke tests), and the read-only/free-tier-first experiment hygiene rules for a Sonnet-class session. Trigger on "I tested this and it works", "should we ship this", "is this a real improvement", "let's try X and see", "should this be an ADR", "where did this idea come from", "run an experiment", "prove this helped", or any session about to change routing/pricing/detection logic based on a hunch.
---

# Octively Research Methodology

This skill is the discipline layer, not the content layer. It does not tell you WHAT to
investigate (see `octively-research-frontier`) or HOW to compute the numbers (see
`octively-unit-economics-toolkit`) or HOW to gate the resulting change (see
`octively-change-control` — every experiment that changes behavior still routes through it).
It tells you the standard of evidence a result must clear in this repo before anyone calls it
"proven," and the real path an idea takes here from hunch to shipped default.

## The evidence bar (non-negotiable, all four apply every time)

1. **One mechanism explains ALL observations, including the negatives.** A hypothesis that
   explains why routing v2 saved money but goes silent on why three orgs saw MORE paid-model
   calls is not accepted — the exception is the finding. Do not cherry-pick the supporting rows
   and ignore the contradicting ones.
2. **Predict numbers before running the experiment.** Write the number down first: "routing v2
   will cut paid-model calls to under 10% of traffic at unchanged unanswered-rate." Then measure.
   A number written after seeing the result is not a prediction, it is a rationalization. The repo
   already does this — `specs/002-phase-3-knowledge/spec.md` SC-003 states the number before Smart
   Routing shipped: *"average credit cost per conversation drops by >=40% ... with no measurable
   accuracy regression on the complex 40%."* That sentence was written at spec time, not after
   looking at production logs.
3. **Judge against the pre-stated number, never by eye.** "Feels faster" / "looks cheaper" /
   "seems fine" are not verdicts. If the measured value misses the predicted threshold, the
   hypothesis failed even if the direction was right. Round down in your own favor, not up.
4. **Adversarial refutation before acceptance.** Before a result is accepted, actively try to
   break it: find the alternative explanation, check for a confound, re-run under a different
   traffic mix or org. Acceptance without an attempted refutation is not acceptance, it is
   optimism. The house exemplar for this step is `specs/005-security-hardening/` (below) — an
   internal team went looking for reasons the payment flow was wrong and found two real critical
   vulnerabilities that "it works in the demo" had missed.

If a session cannot produce a written pre-registered number and a documented refutation attempt,
it has not produced evidence — it has produced a vibe. Do not let a vibe reach
`octively-change-control`.

## The idea lifecycle, as this repo actually practices it

Every surviving feature in this codebase passed through the same five stages. Skipping a stage is
how untested hunches end up in production billing code.

| Stage | Artifact | Gate to pass |
|---|---|---|
| 1. Idea | A hunch, a competitor observation, a critique finding, a user-friction note | Can you name the mechanism, in one sentence, before writing any code? |
| 2. Spec | `specs/<feature>/spec.md` (user stories, functional requirements, **Success Criteria with numbers**) | Every measurable outcome has a number and a measurement method BEFORE build starts (see SC-003 above) |
| 3. Guarded implementation | Code shipped behind an env flag or admin-configurable setting, default matching current production behavior | A single env var or DB toggle can revert to prior behavior with zero code change |
| 4. Validation | vitest coverage + measured production behavior against the spec's stated numbers | Numbers from stage 2 are re-checked against real measurements, not re-derived from memory |
| 5a. Default-on adoption | Flag's default flips to the new behavior; ADR or PHR records the decision | Stage 4's measurement met or beat the stage-2 number |
| 5b. Documented retirement | Feature stays flag-gated off, or is deferred/dropped, with the reason written down | Stage 4's measurement missed the number, or the mechanism was refuted in stage 1's adversarial check |

### Real stage-3 (guarded implementation) examples in this repo

| Flag / mechanism | File | What it guards |
|---|---|---|
| `SMART_ROUTING_FORCE_OFF` | `lib/ai/router.ts:94` | Kill switch — forces every message to the bot's single default model, bypassing the classifier entirely, if set to `'true'` |
| `KNOWLEDGE_BASE_ENABLED` | `lib/knowledge/retriever.ts:31` | Returns `[]` (no retrieval) when set to `'false'`, independent of whether a bot has documents |
| `EMBEDDING_PROVIDER` | `lib/knowledge/embedder.ts:3-11` | Switches between `jina` (serverless, default) and `onnx` (local, VPS-only) embedding providers without touching call sites |
| `config:expensive_model:threshold` (Redis key, not env var) | `lib/db/queries/admin.ts`, introduced in commit `58d71e2` | Admin-tunable price threshold that decides which models trigger the "this is expensive" confirmation dialog — replaced a hardcoded badge-based guess with actual DB pricing data |

Notice the pattern: none of these shipped as "just turn it on for everyone." Each one shipped with
a lever an operator can pull without a redeploy.

### Real stage-5 examples (adopted vs retired)

- **Adopted (default-on):** Smart Routing (`specs/002-phase-3-knowledge`) — met its SC-003 number
  in practice, is on by default, `SMART_ROUTING_FORCE_OFF` exists only as an emergency kill switch.
- **Retired / deferred with a written reason:**
  - **LLM-scored uncertainty detection** — considered and rejected in `history/adr/0003-unanswered-detection-heuristic-regex-vs-llm-scoring.md`. Rejected because it doubles LLM cost and adds
    300-800ms latency per message for a Phase 2 volume that doesn't justify it; explicitly deferred
    to "Phase 3 will evaluate LLM-scored confidence... when scale justifies the cost." The regex
    heuristic (`UNCERTAINTY_RE` in `lib/ai/uncertainty.ts`) shipped instead.
  - **WhatsApp channel** — fully spec'd in `specs/006-whatsapp-channel/spec.md` but demand-gated:
    per `docs/Octively MVP Go-to-Market.md`, the trigger is explicitly "only start building after
    ~10 paying customers... until then this stays in PLANNED on the public roadmap."
  - **Voice/audio features** — CLAUDE.md "What NOT to Build": may be marketed as "upcoming" but
    "do not build it before a paying customer asks." Demand-gated the same way as WhatsApp.
  - **ONNX local embeddings** — CLAUDE.md defers to Phase 3; Jina serverless is the stage-3 default
    per `lib/knowledge/embedder.ts`'s own comment ("Set EMBEDDING_PROVIDER=onnx ONLY on the
    VPS/Docker host").
  - **Typebot's code / any FSL or copyleft OSS component** — considered during Phase 7 planning
    (`docs/Octively MVP Go-to-Market.md`, "Phase 7 — Portal CRM + Integrations") and rejected
    outright: Typebot's Functional Source License "explicitly prohibits using the code in a
    competing product," and the same section flags Twenty (AGPLv3), EspoCRM (GPLv3), n8n
    (Sustainable Use License) and Invoice Ninja (Elastic License 2.0) as license traps for the
    same reason. The retained idea from Typebot was the PRODUCT pattern (richer input blocks,
    Pro-gated analytics, overage credit-pack pricing) explicitly NOT the code. See
    "License trap" below.

## Decision-record discipline

Not every accepted result becomes an ADR. Run the three-part significance test from CLAUDE.md /
the constitution before writing one:

1. **Impact** — long-term consequence for architecture, data model, API, security, or platform?
2. **Alternatives** — were multiple viable options actually considered, with tradeoffs?
3. **Scope** — is this cross-cutting, not an isolated implementation detail?

If all three are true, suggest (never auto-create): `📋 Architectural decision detected: <brief>.
Document? Run /sp.adr <title>.` Wait for owner consent. If any are false, a PHR note under
`history/prompts/<feature>/` is the correct artifact instead — do not inflate a small decision
into an ADR.

**Template:** `.specify/templates/adr-template.md`. It scopes an ADR as a **decision cluster**, not
a single technology pick ("Frontend Stack," not three separate ADRs for framework/styling/deploy).
Required sections: Status / Date / Feature / Context, Decision, Consequences (Positive AND
Negative — an ADR that only lists upside failed the adversarial-refutation step), Alternatives
Considered (with why each was rejected), References (spec link, plan link, related ADRs).

**The four existing ADRs, read as worked examples of the form** (`history/adr/`):

| ADR | Decision | What makes it a model example |
|---|---|---|
| 0001 | Credit system: dual store (Redis live balance + Postgres append-only ledger) | Names the exact competing concerns (speed vs durability) that a single store can't satisfy, gives the debit-first flow as ordered pseudocode |
| 0002 | Platform admin access: email allowlist vs auth role | Cross-cutting security/access decision with a clear alternatives section |
| 0003 | Unanswered detection: regex heuristic vs LLM scoring | Best-documented Negative-consequences section (false-positive/negative rates stated as numbers, 10-20% estimated); explicit "Alternatives Considered" for both a second LLM call AND an embedding-similarity approach, both rejected with reasons; explicitly scoped "Phase 2 only," with a named re-evaluation trigger for Phase 3 |
| 0004 | Billing: dual payment provider (PayFast + Lemon Squeezy) | Models how to document a decision serving two disjoint markets (PKR vs USD) under one ADR instead of splitting into two |

Use ADR-0003 specifically as the template for "we chose the cheap option now, here is the exact
condition that would make us revisit it" — that is the retirement/deferral pattern this skill asks
every guarded feature to follow.

## Where good ideas have historically come from here

Mine these sources before assuming a "new" idea hasn't already been evaluated:

- **Competitor teardown** — `docs/octively-usp-competitive-analysis.md` and
  `docs/Octively MVP Go-to-Market.md` (Typebot section, researched June 2026). The discipline here
  is: steal the IDEA, never the code, and check the license FIRST. Typebot's FSL license explicitly
  bars use in a competing product; reading it for UX inspiration is fine, adapting its code is a
  license violation. The retained ideas were the input-block variety, Pro-gated analytics, and
  overage credit-pack pricing model. Same license-trap lesson recurs in Phase 7 planning for
  Twenty/EspoCRM/n8n/Invoice Ninja.
- **Self-critique** — `docs/Octively-saas-critic.md` (the `/killcritic` mode: evaluate as an
  investor, founder, and customer, not as a supporter). Its role is to find the case for why the
  plan loses money or stalls BEFORE a real customer does. Verdict on record: "the idea is viable...
  your biggest risk is not technology... customer acquisition and market validation." Use this
  document's adversarial framing as a template when self-critiquing a new idea, not just as a
  historical artifact.
- **The v6-to-v7 post-mortem** — `docs/owflex_master_plan_v7.md`, "Why v7 Exists: Lessons from v6."
  v6 died from over-engineering before a single user existed (ONNX at MVP stage, planetary-scale
  RabbitMQ thinking, no shippable unit in under two weeks). The rule that survived: "Ship the
  smallest thing a Pakistani agency owner will pay Rs 2,000/month for. Then grow." Cite this before
  proposing infrastructure a solo-maintained SaaS with no confirmed paying-customer volume doesn't
  need yet.
- **Security audit as adversarial refutation** — `specs/005-security-hardening/spec.md`. This is
  the house exemplar of "actively try to break your own result before accepting it." A defensive
  audit after MVP go-live found two CRITICAL payment vulnerabilities that "it works in the demo" had
  missed: PayFast ITN signatures were forgeable if `PAYFAST_PASSPHRASE` was unset (spec.md:34), and
  `WEBHOOK_SIGNING_SECRET` fell back to a literal hardcoded string if unset, letting anyone who read
  the source code forge webhook payloads (spec.md:152). Both were found by someone actively hunting
  for the failure mode, not by someone confirming the happy path worked.
- **User-facing friction observations** — `docs/smoke-tests.md`. A pass/fail checklist run after
  every production deploy across all three (now four, see `octively-architecture-contract`)
  surfaces. Friction found here ("this redirect is broken," "this CTA is missing") is a legitimate
  idea source for the next spec, not just a release gate.

## Experiment hygiene rules for a Sonnet-class session

- **Never run experiments against production data mutatively.** Read-only queries only. See
  `octively-diagnostics-and-tooling` for the sanctioned read-only inspection tools (Drizzle Studio,
  log queries, analytics tables) — use those, do not hand-write mutating SQL against prod to "just
  check something."
- **Measure, don't eyeball.** Every claim in the acceptance step of an experiment must resolve to a
  query result, a test output, or a log line — never a paraphrase of what you expect to be true.
- **Cost experiments respect free-tier-first.** No paid API burns without explicit owner approval —
  this is an unwritten-rule-now-codified project rule (owner-confirmed 2026-07-06): NO new paid
  dependencies or services without explicit approval. If an experiment requires spending real money
  (LLM tokens beyond OpenRouter's free tier, a paid embedding call, a paid SMS/WhatsApp send), stop
  and ask first. Free-tier ceilings that matter today: OpenRouter `:free` model variants, Jina
  serverless embeddings, Gemini `text-embedding-004` free quota (~1M input tokens/day per
  `specs/002-phase-3-knowledge/spec.md` Assumptions).
- **Time-box dead ends and record them.** If an experiment doesn't pan out within its allotted time,
  stop and write it up in `octively-failure-archaeology`'s entry format (symptom → root cause →
  evidence → status) so the next session doesn't re-run the same dead end. A dead end that isn't
  recorded gets re-discovered at full cost next time.

## One-page experiment proposal template (copy this before running anything)

```markdown
## Experiment: <name>

**Hypothesis (one mechanism):**
<state the single mechanism you believe explains the effect>

**Predicted numbers (write BEFORE running anything):**
- Metric: <e.g. paid-model call rate, credits/conversation, unanswered-rate>
- Predicted value: <e.g. "under 10%", "drops by >=40%">
- Baseline / control value: <what it is today, with a source query or file:line>

**Measurement query (read-only, exact command):**
<the literal SQL/query/test command that will produce the number, e.g. via
octively-diagnostics-and-tooling's sanctioned read paths>

**Kill criteria (stop the experiment if hit):**
- <e.g. "unanswered-rate rises above baseline by more than 2 points">
- <e.g. "any paid API spend beyond free tier without prior owner approval">

**Rollback:**
- <name the exact env var / config toggle that reverts to current behavior, e.g.
  SMART_ROUTING_FORCE_OFF=true, KNOWLEDGE_BASE_ENABLED=false>

**Adversarial refutation attempted:**
- Alternative explanation checked: <what else could explain this result?>
- Confound checked: <traffic mix, org size, time-of-day, model version drift, etc.>
- Re-run performed: <yes/no, with what varied>

**Verdict (fill in AFTER measuring, judged against the predicted number, not by eye):**
- Met / missed prediction: <...>
- Next stage: 5a (propose default-on via octively-change-control) or 5b (retire/defer, record in
  octively-failure-archaeology)
```

## When NOT to use this skill

- Deciding WHICH problem is worth attacking next (frontier prioritization, falsifiable milestones
  for "cheapest reliable AI, Pakistan-first") → `octively-research-frontier`.
- Doing the actual cost/margin/routing math for an experiment's measurement step →
  `octively-unit-economics-toolkit`.
- Running the read-only queries/scripts referenced in the experiment template →
  `octively-diagnostics-and-tooling`.
- Deciding how a validated result gets promoted into production (commit/push/build gates, owner
  sign-off list, changelog/roadmap sync) → `octively-change-control` (every experiment that changes
  behavior still routes through it, even after this skill's evidence bar is cleared).
- Checking whether a hunch has already been tried and rejected before → `octively-failure-archaeology`
  (check this FIRST — do not re-run a settled experiment).
- Writing the actual vitest coverage for a validated change → `octively-validation-and-qa`.

## Provenance and maintenance

Date-stamped as of 2026-07-06/07. Re-verify these facts if this skill feels stale:

- ADR count and filenames: `ls history/adr/` (expect 4 as of this writing; if a 5th exists, add it
  to the worked-examples table above).
- Flag/env var lines cited above still exist at these locations:
  `grep -n "SMART_ROUTING_FORCE_OFF" lib/ai/router.ts`,
  `grep -n "KNOWLEDGE_BASE_ENABLED" lib/knowledge/retriever.ts`,
  `grep -n "EMBEDDING_PROVIDER" lib/knowledge/embedder.ts`.
- Commit `58d71e2` still exists and still describes the price-threshold change:
  `git show 58d71e2 --stat`.
- SC-003's stated number still matches the spec: `grep -n "SC-003" specs/002-phase-3-knowledge/spec.md`.
- WhatsApp/voice demand-gating still holds (not yet built): `ls app/api/v1 | grep -i whatsapp`
  should be empty; re-check `docs/Octively MVP Go-to-Market.md` and CLAUDE.md "What NOT to Build"
  for any change in the gating condition.
- ADR template path unchanged: `ls .specify/templates/adr-template.md`.
- Security-hardening spec still describes the two critical findings:
  `grep -n "forgeable\|hardcoded" specs/005-security-hardening/spec.md`.
