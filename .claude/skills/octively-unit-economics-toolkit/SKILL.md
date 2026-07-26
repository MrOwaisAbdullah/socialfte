---
name: octively-unit-economics-toolkit
description: Load when asked to prove, defend, or recompute any Octively money number — cost per conversation, credit-pack or plan margin, whether smart routing is actually saving money, how close a free-tier dependency (Neon, Upstash, Resend, Brevo, R2, QStash, Jina, OpenRouter free models) is to its limit, how many website visitors/conversations a plan can support before hitting its conversation or credit ceiling, or when verifying a PayFast ITN / Lemon Squeezy webhook signature by hand. Trigger on tasks and phrasing like "what does this bot actually cost us", "are we profitable on the Starter plan", "prove the routing split is saving money", "recompute the break-even conversations", "how many visitors can the Pro plan handle", "what's the traffic capacity of each plan", "is this PayFast callback forged", "verify this webhook signature", "how close are we to a free-tier limit", "should we add this paid API", or "the master plan doc says X but does the code agree". This skill owns the ARITHMETIC and verification recipes; it does not own routing/credit/payment THEORY (see octively-domain-reference) or query mechanics for pulling the raw rows (see octively-diagnostics-and-tooling).
---

# Octively Unit Economics Toolkit

Date-stamped: 2026-07-06. Repo: `/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas` (path has spaces — quote it or `cd` first).

North star: **"cheapest reliable AI option, Pakistan-first."** Unit economics is not a
reporting exercise here — it is the moat. Every recipe below ends in a number you can
defend with a file:line citation, not an adjective.

**Contents**
- Quick reference — where every constant actually lives
- Recipe 1 — Cost-per-conversation derivation
- Recipe 2 — Credit pricing margin analysis (owns the canonical `PLAN_CREDIT_ALLOCATIONS` numbers)
- Recipe 3 — Routing decision analysis
- Recipe 4 — Free-tier headroom audit
- Recipe 5 — Payment integrity verification recipes (PayFast ITN, Lemon Squeezy HMAC)
- Recipe 6 — The "should this be paid?" decision recipe
- Recipe 7 — Visitor capacity per plan

**Ground rule for every recipe: measure, don't assume.** Where the repo has a live table
(`routing_decisions`, `messages.cost_usd`, `credit_transactions`), pull real rows — don't
reason from the plan doc's illustrative numbers. Where the plan doc and the code disagree,
say so explicitly; do not silently prefer one.

## Quick reference — where every constant actually lives

| Concept | File:line | Constant |
|---|---|---|
| Free-tier Redis credit allocation | `lib/credits/index.ts:6,12-18` | `FREE_TIER_CREDITS = 2_000_000`, `PLAN_CREDIT_ALLOCATIONS` |
| Org-wide monthly conversation cap (the real binding limit, see Recipe 7) | `lib/limits/index.ts:4-11` | `PLAN_LIMITS.<plan>.conversations` — free 200 / starter 3,000 / pro 15,000 / agency 75,000 |
| RAG retrieval size | `lib/knowledge/retriever.ts:9` | `DEFAULT_TOP_K = 10` (~1,000 input tokens when RAG fires; skipped for greetings, `shouldSkipRag()`) |
| Strong-model credit multiplier | `lib/credits/index.ts:121-126`, `lib/ai/router.ts:131` | `STRONG_MODEL_MULTIPLIER = 5` |
| Token estimate formula (pre-call) | `app/api/v1/chat/route.ts:450` | `Math.ceil(message.length / 4) * 3` |
| Real $ cost per message (post-call) | `app/api/v1/chat/route.ts:577-598` | reads `model_prices`, writes `messages.cost_usd` |
| Model price table (admin-managed) | `lib/db/schema.ts` `modelPrices`; refreshed in `lib/db/queries/admin.ts:~400-440` | `promptPricePer1M`, `completionPricePer1M` |
| Routing classifier / strong model IDs | `lib/ai/router.ts:1-4` | `CLASSIFIER_MODEL`, `STRONG_MODEL`, `FALLBACK_MODEL` |
| Free `:free` variant map | `lib/ai/litellm.ts:14-32` (aka `lib/ai/router.ts` in some branches — verify which file owns it, see note below) | `FREE_VARIANTS` |
| Free-quota Redis counters | `lib/ai/free-quota.ts:21-22` | `FREE_RPM_LIMIT = 20`, `FREE_RPD_LIMIT = 1000` |
| Routing decision log (one row/message) | `lib/db/schema.ts` `routingDecisions` (table `routing_decisions`) | `classification`, `chosenModel`, `fallbackUsed`, `creditCost` |
| Credit ledger (append-only) | `lib/db/schema.ts` `creditTransactions` (table `credit_transactions`) | `delta`, `reason`, `refId` |
| Unanswered quality flag | `lib/ai/uncertainty.ts:1-6` | `flagIfUnanswered()` regex on assistant reply |
| PayFast credit packs + plan prices | `lib/billing/payfast.ts:4-8,51-55` | `CREDIT_PACKS`, `PLAN_PRICES_PKR` |
| PayFast ITN (Instant Transaction Notification) verification | `lib/billing/payfast.ts:109-170` | `verifyItn()` |
| Lemon Squeezy HMAC verification | `lib/billing/lemon-squeezy.ts:12-22` | `verifyWebhook()` |
| Display-only PKR↔USD rate | `lib/currency.ts:5` | `USD_PKR_RATE = 300` |
| Constitution migration trigger | `.specify/memory/constitution.md:239` | "Neon > 400MB storage OR > 80 active users → Hetzner" |
| Upstash Redis free tier | `.specify/memory/constitution.md:256` | "free 500K commands/mo" |
| Resend / Brevo free tiers | `.env.example` (Resend/Brevo blocks) | Resend 3,000/mo·100/day; Brevo 9,000/mo·300/day |

**Note on `FREE_VARIANTS`**: it is defined once, in `lib/ai/litellm.ts:14-32` (confirmed by
direct read 2026-07-06). `lib/ai/router.ts` only imports `CLASSIFIER_MODEL`/`STRONG_MODEL`
from `litellm.ts` — it does NOT define its own `FREE_VARIANTS`. If a future read finds two
copies, that is drift; flag it, don't average them.

---

## Recipe 1 — Cost-per-conversation derivation

**Question it answers:** "What does one conversation actually cost OwFlex, in dollars,
right now — not in the master plan's illustrative table?"

### Step 1: token estimate per message (pre-call, credit debit)

`app/api/v1/chat/route.ts:450`:
```ts
const estimatedTokens = Math.ceil(message.length / 4) * 3
```
This is charged as credits BEFORE the LLM call (debit-first, ADR-0001). The `*3` covers
system prompt + retrieved context + expected output — it is a deliberate overestimate, not
a token count. It has nothing to do with the real dollar cost computed in Step 2; conflating
the two is the single most common margin-analysis mistake in this codebase. Credits and
real-dollar cost are two separate ledgers — see Recipe 2.

### Step 2: real $ cost per message (post-call, informational)

`app/api/v1/chat/route.ts:577-598` — computed only AFTER the LLM responds, from the
`model_prices` table (populated from the live OpenRouter `/models` list by
`lib/db/queries/admin.ts`, not hardcoded):
```ts
const inputCost  = (inputTokens  / 1_000_000) * parseFloat(price.promptPricePer1M)
const outputCost = (outputTokens / 1_000_000) * parseFloat(price.completionPricePer1M)
costUsd = (inputCost + outputCost).toFixed(8)
```
This is stored per-message in `messages.cost_usd` — this is your ground truth for "what did
this actually cost," not the master plan's per-1M table (which is a May 2026 snapshot and
WILL drift — OpenRouter prices change without notice).

**Command to pull real average cost per conversation for a bot, last 30 days:**
```sql
SELECT AVG(conv_cost) FROM (
  SELECT c.id, SUM(m.cost_usd) AS conv_cost
  FROM conversations c
  JOIN messages m ON m.conversation_id = c.id
  WHERE c.bot_id = '<bot_id>' AND m.created_at > now() - interval '30 days'
  GROUP BY c.id
) sub;
```
(Run via whatever DB console `octively-diagnostics-and-tooling` documents — this skill owns
the math, not the connection mechanics.)

### Step 3: routing mix — measured, not assumed

Smart routing only runs when `bot.smartRoutingEnabled && bot.orgPlan IN ('pro','agency','enterprise')`
(`app/api/v1/chat/route.ts:496`). Free and Starter bots ALWAYS use `bot.model` directly —
there is no classifier call, no routing split, for 100% of Free/Starter traffic. Do not apply
the master plan's "60-80% savings from routing" claim to those plans; it does not apply.

For bots WITH routing enabled, pull the real split instead of assuming the doc's numbers:
```sql
SELECT classification, chosen_model, fallback_used, COUNT(*), AVG(credit_cost)
FROM routing_decisions
WHERE bot_id = '<bot_id>' AND created_at > now() - interval '30 days'
GROUP BY classification, chosen_model, fallback_used
ORDER BY count DESC;
```

**Hidden un-metered cost — flag this in every margin write-up:** the classifier call itself
(`lib/ai/router.ts` `classifyWithTimeout`, using `CLASSIFIER_MODEL =
deepseek/deepseek-v4-flash`) builds its OpenRouter request body directly — `model:
CLASSIFIER_MODEL, max_tokens: 20` — and does NOT go through `buildModelPayload()` /
`FREE_VARIANTS` / `canUseFree()`. Every classification call is a real, always-paid OpenRouter
request, at roughly 150 input + 20 output tokens (the fixed `CLASSIFIER_PROMPT` is ~120
tokens; verify current word count before quoting). At DeepSeek V4 Flash's May-2026 listed
price ($0.14/$0.28 per 1M, master plan §6 — **re-verify via OpenRouter before citing**), that
is roughly $0.0000266 per classification, i.e. ~$0.03 per 1,000 routed messages. This cost is
NOT debited from the org's credit balance anywhere in `routeMessage()` — it is a platform
infra cost that scales with total routed-message volume, invisible in any per-org P&L. At
scale (millions of routed messages/month) this stops being negligible; recompute it whenever
routing volume is asked about.

### Step 4: free-model marginal cost (the near-zero tail)

The platform default (`FALLBACK_MODEL = meta-llama/llama-3.3-70b-instruct`,
`lib/ai/router.ts:4`) has a confirmed `:free` variant (`FREE_VARIANTS` map,
`lib/ai/litellm.ts:16`). When `canUseFree()` (`lib/ai/free-quota.ts:35`) has RPM/RPD
headroom, `buildModelPayload()` sends `models: [freeVariant, model]` — OpenRouter tries free
first, falls through to paid silently. **This applies to the main chat completion only** (via
`chatCompletion`/`chatCompletionStreamGen` in `lib/ai/litellm.ts`), not to the classifier
(Step 3). So: for a Free-plan bot on the default model with quota headroom, marginal LLM cost
per message is genuinely ~$0 — but the moment `canUseFree()` returns false (quota
exhausted), the SAME message silently costs the Tier-1 paid rate. Never state "$0/message"
without checking current `getFreeQuotaUsage()` headroom — see Recipe 4.

### Worked example (illustrative — recompute with real bot data before quoting to anyone)

Free-plan bot, default model, quota headroom available:
- Marginal LLM cost: ~$0 (free variant serving)
- Credit debit: `Math.ceil(msg.length/4)*3` credits, deducted from the 2,000,000/month
  `FREE_TIER_CREDITS` allocation (`lib/credits/index.ts:6`) — this caps volume, not cost.

Pro-plan bot, smart routing on, "complex" classification (5x multiplier), quota exhausted:
- Classifier cost: ~$0.0000266 (always paid, un-metered, see Step 3)
- Model cost: Claude Haiku 4.5 real tokens × May-2026 listed $1.00/$5.00 per 1M
  (master plan §6 Tier 3 — **re-verify current OpenRouter price**, this is a five-month-old
  snapshot by the time you read this)
- Credit debit: `estimatedTokens * STRONG_MODEL_MULTIPLIER (5)` (`lib/credits/index.ts:124`,
  `lib/ai/router.ts:131` — both hardcode `5`, consistent)

---

## Recipe 2 — Credit pricing margin analysis

**Question it answers:** "Does the plan price cover the expected usage cost, and at what
conversation volume does a plan stop being profitable?"

### The three places credits are defined — and they disagree

1. **Plan monthly allocations** (`lib/credits/index.ts:12-18`, `PLAN_CREDIT_ALLOCATIONS`):
   free 2,000,000 / starter 30,000,000 / pro 150,000,000 / agency 750,000,000 / enterprise
   750,000,000. **This is the library's authoritative copy of these numbers** — sibling
   skills (`octively-domain-reference` §3.1, `octively-architecture-contract` §3) point
   here; if the allocation changes, update this table first and re-verify in
   `lib/credits/index.ts:12-18`. Unit here is raw credit-units (`Math.ceil(len/4)*3` estimate units), 1:1 — NOT
   the "1 credit = 1000 micro-credits" scheme sketched in the master plan §7 SQL snippet.
   **Doc/code disagreement — flag it:** master plan §7's `credit_balances.balance BIGINT
   -- in micro-credits (1 credit = 1000)` schema sketch was never built. The real schema
   (`lib/db/schema.ts` `creditTransactions`) is a single append-only table with a Redis
   integer counter as source of truth (`lib/credits/index.ts` `creditKey()`), not the doc's
   three-table `credit_balances` + `credit_ledger` + `credit_purchases` design. Use the code,
   not the doc, when explaining the schema to anyone.

2. **Credit top-up packs** (`lib/billing/payfast.ts:4-8`, `CREDIT_PACKS`):
   ```ts
   starter: { tokens: 100_000,   pkr: 500,  usd: 2  }
   growth:  { tokens: 500_000,   pkr: 2000, usd: 8  }
   pro:     { tokens: 1_500_000, pkr: 5000, usd: 18 }
   ```
   **Major doc/code disagreement — flag it:** master plan §7's "Credit packages" table
   describes FOUR different packs with different names, different prices, and roughly
   10-20x more tokens per rupee:
   | Doc says | Code says |
   |---|---|
   | Starter Pack ₨1,000 / $4 → $4 value | `starter` ₨500 / $2 → 100K tokens |
   | Standard Pack ₨2,500 / $9 → $10 value | `growth` ₨2000 / $8 → 500K tokens |
   | Power Pack ₨5,000 / $18 → $22 value | `pro` ₨5000 / $18 → 1.5M tokens |
   | Agency Pack ₨10,000 / $36 → $50 value | *(no 4th pack in code)* |

   These are not reconcilable by unit conversion — they are a different product design
   (bonus-credit markup packs vs flat token packs). **When asked to explain top-up pricing,
   describe `CREDIT_PACKS` from the code as shipped reality; cite the doc table only as a
   stale planning artifact**, and prompt the owner per the "Changelog + Roadmap Sync Rule" /
   `octively-docs-and-copy` before treating either as authoritative going forward.

3. **Subscription plan prices** (`lib/billing/payfast.ts:51-55`, `PLAN_PRICES_PKR`):
   `starter: 2500, pro: 7500, agency: 20000` — **this one matches** the master plan §8 promo
   pricing table exactly (as of 2026-07-06). No drift here; safe to cite either source.
   (Catalog of pricing constants as env/code config: `octively-config-and-flags` §6.)

### Break-even conversations per plan — recompute, don't copy

Formula: `break_even_conversations = plan_price_usd / avg_real_cost_per_conversation_usd`.

`avg_real_cost_per_conversation_usd` must come from Recipe 1 Step 2 (`AVG(messages.cost_usd)`
grouped by conversation) for bots actually on that plan — not the master plan's "All Flash
$43/mo" / "30% Claude Sonnet $613/mo" illustrative scenarios (master plan §8, "Profitability
at Scale"), which are hypothetical mixes invented for the planning doc, not measured. If you
cannot query real data (new plan, no bots yet), label the result "projected, unmeasured" and
say so — never present a projection as a measured break-even.

Worked skeleton (fill in the blanks with real query results):
```
Starter plan price:        $15/mo (promo) or $19/mo (full) — master plan §8, matches PLAN_PRICES_PKR ₨2,500
Starter credit allocation: 30,000,000 credit-units/mo (lib/credits/index.ts:14)
Real avg cost/conversation: $____ (query Recipe 1 Step 2, filtered to plan='starter' bots)
Break-even conversations:  $15 / $____ = ____ conversations/mo
```
Do not skip the "fill in the blanks" step — a break-even number with no real query behind it
is exactly the kind of unverified claim this toolkit exists to prevent.

---

## Recipe 3 — Routing decision analysis

**Question it answers:** "Is smart routing actually saving money, and is quality holding up?"

Query mechanics (DB console, environment setup) are owned by
`octively-diagnostics-and-tooling` — this recipe owns the math and interpretation.

### Actual cheap/strong split

```sql
SELECT
  chosen_model,
  fallback_used,
  COUNT(*) AS n,
  AVG(credit_cost) AS avg_credit_cost
FROM routing_decisions
WHERE bot_id = '<bot_id>' AND created_at > now() - interval '30 days'
GROUP BY chosen_model, fallback_used;
```
`fallback_used = true` means the classifier picked "complex" but the org's credit balance
couldn't cover the 5x strong-model estimate (`lib/ai/router.ts:134-143`) or the debit itself
failed (`:145-155`) — in both cases it silently downgrades to `botDefaultModel` rather than
erroring. A high `fallback_used` rate is a credit-balance problem, not a routing-quality
problem; don't conflate the two when reporting.

### Cost saved vs. all-strong baseline

```
cost_saved = (total_messages × strong_model_cost_per_message) - actual_total_cost
```
Pull `actual_total_cost` from `SUM(messages.cost_usd)` for the same bot/window (Recipe 1
Step 2), and `strong_model_cost_per_message` from the current `model_prices` row for
`STRONG_MODEL` (`anthropic/claude-haiku-4-5-20251001`) × the bot's actual average
input/output token counts. Do not use the master plan's "60-80%" figure as the saved amount —
that is a claim about a hypothetical mix, not this bot's measured mix.

**Remember to add back the always-paid classifier cost** (Recipe 1 Step 3) on BOTH sides of
the comparison — it runs regardless of which model is chosen, so it nets out, but state
explicitly that you accounted for it rather than silently omitting a real cost line.

### Quality proxy — unanswered-flag rate per model

`messages.flagged_unanswered` is set by `lib/ai/uncertainty.ts` `flagIfUnanswered()`, a regex
match against phrases like "I don't know" / "I'm not sure" / "outside my knowledge" in the
assistant's own reply (`lib/ai/uncertainty.ts:1-6`) — it is a heuristic proxy, not a real
quality score. It cannot detect a confidently wrong answer, only a self-reported "I can't
help." State that ceiling whenever you report this number.

```sql
SELECT model_used, COUNT(*) AS total,
       SUM(CASE WHEN flagged_unanswered THEN 1 ELSE 0 END) AS unanswered,
       ROUND(100.0 * SUM(CASE WHEN flagged_unanswered THEN 1 ELSE 0 END) / COUNT(*), 2) AS unanswered_pct
FROM messages
WHERE model_used IS NOT NULL AND created_at > now() - interval '30 days'
GROUP BY model_used
ORDER BY total DESC;
```
Also cross-reference `messages.rating` (`1` thumbs up / `-1` thumbs down / `NULL`) per model
where available — it is a stronger signal than the regex flag when the sample size is large
enough to matter (small samples of thumbs data are noise, say so if n is low).

---

## Recipe 4 — Free-tier headroom audit

**Question it answers:** "At what point does each free-tier dependency run out, and which
one runs out first?"

| Dependency | Stated limit | Source | Confidence |
|---|---|---|---|
| Neon Postgres | Migration trigger: >400MB storage OR >80 active users → Hetzner | `.specify/memory/constitution.md:239` | Verified (explicit threshold, not a raw quota number) |
| Upstash Redis | 500K commands/mo | `.specify/memory/constitution.md:256` | Verified |
| Resend (transactional email) | 3,000/month, 100/day | `.env.example` Resend block | Verified |
| Brevo (marketing digest email) | 9,000/month, 300/day | `.env.example` Brevo block; master plan §... corroborates | Verified |
| Cloudflare R2 (document storage) | 10 GB free | master plan (multiple citations, e.g. "Object Storage \| Cloudflare R2 (free 10GB)") | Verified in docs, not in `.env.example` |
| Jina AI embeddings | **CONFLICTING**: `.env.example` says "1M tokens/month"; master plan says "1M tokens/day" (e.g. "jina-embeddings-v5-text-small (1M tokens/day free)") | `.env.example` `JINA_API_KEY` comment vs master plan | **UNVERIFIED — reconcile with Jina's current pricing page before using either number in a claim** |
| Upstash QStash (job queue) | Not stated anywhere in repo | — | **UNVERIFIED — do not invent a number** |
| OpenRouter free models (`:free` variants) | **CONFLICTING three ways**: `lib/ai/free-quota.ts:22` hardcodes `FREE_RPD_LIMIT = 1000` unconditionally (no deposit-gated tiering in code); `lib/ai/router.ts:8-10` comment says "50/day (no deposit) / 1,000/day (after $10 deposit)"; master plan §6a says "200/day without credits, 1,000/day after $10 deposit". All three numbers for the "no deposit" case differ (50 vs 200 vs implicit-1000-always-in-code) | See three files cited | **UNVERIFIED — the running code always assumes 1,000/day is available; if the account has not actually made the $10 deposit, real-world 429s will be more frequent than `canUseFree()` predicts. Re-check against `openrouter.ai/collections/free-models` and the account's actual deposit status before trusting `FREE_RPD_LIMIT`.** |
| Tavily (readiness-checker tool only) | "Generous free tier... 1 credit per 5 URLs" (no numeric monthly cap stated) | `.env.example` Tavily block | Partially verified — no hard number to audit against |
| Gemini text-embedding-004 | CLAUDE.md's "Active Technologies" section still lists Gemini text-embedding-004 (768-dim) as the embeddings choice, but the live `.env.example` default is `EMBEDDING_PROVIDER=jina` (**1024-dim** via Jina jina-embeddings-v3, matching the ONNX BGE-M3 alternative and the `vector(1024)` schema column — `lib/knowledge/embedder.ts:12`, `lib/db/schema.ts:280`) with ONNX as the VPS-only alternative — Gemini is not the active default. **Documented drift** — do not audit a "Gemini free tier" limit as if it gates current production; audit Jina's instead. | `.env.example` `EMBEDDING_PROVIDER` block vs CLAUDE.md Active Technologies | Confirmed drift |

### The "who exhausts first" recipe

1. Get current usage for each dependency that has an actual usage-tracking mechanism in
   repo: Redis command count is not directly exposed (ask Upstash console); R2 storage bytes
   (ask Cloudflare dashboard or `documents.byte_size` sum in Postgres); Neon storage (ask Neon
   console, compare to the 400MB constitution threshold); OpenRouter free-quota usage via
   `getFreeQuotaUsage()` (`lib/ai/free-quota.ts:68-82`, exposed on the admin dashboard).
2. Compute a growth rate per dependency from real usage over the last N days (do not assume
   linear growth from a single data point).
3. `bots_until_exhaustion = (limit - current_usage) / (usage_per_active_bot_per_month)`.
   Get `usage_per_active_bot_per_month` from real query results, not a guess — e.g. for R2,
   `SELECT AVG(byte_size) FROM documents GROUP BY bot_id` gives a per-bot storage rate.
4. Report the dependency with the SMALLEST `bots_until_exhaustion` as the binding constraint.
   Cross-check it against the constitution's explicit Neon/Hetzner migration trigger — if
   Neon's own trigger (§239) fires before any other dependency's limit, that is the answer
   regardless of what the other columns say.

---

## Recipe 5 — Payment integrity verification recipes

**Purpose:** defensive verification when debugging "was this webhook forged or legitimate,"
not payment feature-building. ITN = Instant Transaction Notification (PayFast's
server-to-server payment webhook); HMAC = hash-based message authentication code. This
recipe owns the hands-on recompute steps only — the protocol THEORY (why MD5, why
HMAC-SHA256, why the checkout URL is tamperable, why constant-time compares) is owned by
`octively-domain-reference` §4. For "webhook returned 401 / credits not granted" symptom
triage, see `octively-debugging-playbook`.

### PayFast ITN — recompute the MD5 signature by hand

`lib/billing/payfast.ts:109-170`, `verifyItn()`. Exact algorithm as implemented:

1. Take the posted form fields, delete `signature` from the set.
2. Concatenate remaining fields **in the order PayFast sent them** (NOT alphabetically
   sorted — this is the #1 way people get this wrong when reimplementing by hand):
   `key1=value1&key2=value2&...`, URL-encoding each value, then replacing `%20` with `+`
   (PayFast's own quirk, not standard `encodeURIComponent` output).
3. Append `&passphrase=<encoded passphrase>` (same `%20`→`+` treatment).
4. `MD5(that string)`, compare hex digest against the posted `signature` field using
   `safeEqual()` (`lib/security.ts:8`, constant-time compare — never use `===` for this).
5. Also require `payment_status === 'COMPLETE'`. Both conditions must hold for `valid: true`.

**Fails closed if `PAYFAST_PASSPHRASE` is unset** (`lib/billing/payfast.ts:148-152`) —
deliberate: without it the signature is forgeable (rationale: `octively-domain-reference`
§4.1). If you see ITNs being rejected in a debugging session, check this env var FIRST
before assuming a signature bug.

**Amount-tampering check is separate from the signature check** — `amountValid`
(`lib/billing/payfast.ts:144`) compares `amount_gross` against the server-side expected price
looked up from `CREDIT_PACKS`/`PLAN_PRICES_PKR` by parsing `m_payment_id` (why the outgoing
checkout URL is tamperable: `octively-domain-reference` §4.1). Never treat `valid: true`
alone as sufficient; a forged-amount payment with a genuine signature (i.e., a legitimately
COMPLETE payment for the WRONG amount) still needs `amountValid` checked separately by the
caller.

**Manual recompute snippet** (paste captured form fields, keeping their original POST order):
```ts
import { createHash } from 'crypto'
const passphrase = '<from PAYFAST_PASSPHRASE>'
const orderedFields = { /* paste in the exact order PayFast POSTed them */ }
const qs = Object.keys(orderedFields)
  .map((k) => `${k}=${encodeURIComponent(orderedFields[k]).replace(/%20/g, '+')}`)
  .join('&') + `&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, '+')}`
console.log(createHash('md5').update(qs).digest('hex'))
```
Compare the printed hex against the `signature` field from the captured payload.

### Lemon Squeezy — recompute the HMAC-SHA256 signature

`lib/billing/lemon-squeezy.ts:12-22`, `verifyWebhook()`:
```ts
const computed = createHmac('sha256', secret).update(rawBody).digest('hex')
timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(signature, 'hex'))
```
Critical detail: it hashes the **raw request body bytes** (`Buffer`), not a re-serialized JSON
object — if you're debugging by hand and re-`JSON.stringify()` the parsed payload before
hashing, whitespace/key-order differences will make your recomputed signature not match even
though the webhook is legitimate. Always work from the literal captured body bytes. Secret
comes from `LEMON_SQUEEZY_WEBHOOK_SECRET`; a missing/empty secret hashes against `''`
(`?? ''` fallback, line 13) which will simply never match a real signature — that reads as
"all webhooks rejected," not a forgeable-open-door state like PayFast's missing passphrase.

### Credit ledger consistency vs. Redis balance

Redis is the fast-path source of truth for the live balance (`creditKey(orgId)` =
`credits:${orgId}`, `lib/credits/index.ts:27-29`); Postgres `credit_transactions` is the
append-only audit trail (`logTransaction()`, `lib/credits/index.ts:101-108`, values inserted
with `onConflictDoNothing()` keyed by `refId` for idempotency). These CAN drift — Redis writes
happen synchronously in the debit path, Postgres logging is not guaranteed atomic with it.
Reconciliation check:
```sql
-- Sum of all ledger deltas should approximate (allocation - current Redis balance),
-- for orgs where the ledger has ever been written (empty ledger ⇒ org never debited,
-- see the "reinitialize on current===0" branch, lib/credits/index.ts:76-86)
SELECT org_id, SUM(delta) AS ledger_total
FROM credit_transactions
GROUP BY org_id
HAVING org_id = '<org_id>';
```
Compare `ledger_total` against `PLAN_CREDIT_ALLOCATIONS[plan] - <live Redis GET credits:orgId>`.
A material mismatch means either a Redis write succeeded without its paired
`logTransaction()` call completing (fire-and-forget, non-blocking by design — see
`app/api/v1/chat/route.ts` usage, "Async write to Postgres (non-blocking)" pattern described
in master plan §7), or the one-time legacy-correction / admin "Sync Credits" paths
(`correctLegacyOrgCredits()`, `resetToPlantAllocation()`, `lib/credits/index.ts:162-194`) were
invoked and are not reflected as ledger rows. Don't treat a mismatch as fraud by default — it
is far more often one of these known non-atomic-write paths; check those first.

---

## Recipe 6 — The "should this be paid?" decision recipe

**Owner-confirmed hard rule (2026-07-06): no new paid dependency without explicit owner
approval. Free-tier-first is law.** This recipe is the analysis a session MUST produce and
present BEFORE proposing any paid service, tier upgrade, or API key that costs money — it
does not grant permission to add one; approval still routes through
`octively-change-control`.

Before proposing anything paid, produce all four of these, in writing, in the same message
that proposes it:

1. **Cost per month at current scale** — get the actual current usage number (bot count,
   message volume, storage bytes — whatever the dependency scales with) and the paid tier's
   real price at that usage, not a round-number guess. Cite the pricing page or the repo's
   existing citation of it (many are already in master plan §"free tier limits" table).

2. **Per-customer unit impact** — divide the monthly cost by current active-org count (or
   projected count for a decision that only matters at future scale) and state it as
   "$X/customer/month" — compare that against the plan price it would eat into (Starter
   $15-19/mo, Pro $29-39/mo, Agency $79-99/mo, master plan §8) to show whether it threatens
   margin or is noise.

3. **Free alternative tried and measured** — name the specific free alternative that was
   actually attempted (not "we could probably..."), what limit it hit, and the real usage
   number that proves the limit was hit (link back to Recipe 4's headroom audit — this is
   the connective tissue between the two recipes: Recipe 4 tells you WHEN you're close to a
   wall, Recipe 6 is what you present once you've decided you need to go through it).

4. **Reversibility** — state whether adopting the paid tier is a one-line env var swap
   (per the constitution's infra-abstraction rule, `.specify/memory/constitution.md:225-233`,
   "swapping any service requires changing env vars only") or a deeper lock-in. Prefer
   dependencies that stay swappable.

If any of the four is missing, the proposal is incomplete — do not present it to the owner
as ready for a yes/no decision; go get the missing number first.

---

## Recipe 7 — Visitor capacity per plan

**Question it answers:** "How many website visitors/month can each plan realistically
support before hitting a ceiling?" First verified 2026-07-12 by direct file read; the
conversation-limit numbers and the 10,000-credits/conversation threshold are measured facts —
the visitor-to-conversation conversion is necessarily an assumption (traffic isn't tracked in
this repo) and must always be presented as a labeled range, not a point estimate.

### Step 1: confirm which ceiling actually binds — conversations, not credits

`PLAN_LIMITS.conversations` (`lib/limits/index.ts:4-11`) is an **org-wide** monthly pool
(`checkConversationLimit`, same file, compares against `org.conversationsThisMonth` —
not a per-bot count unless the bot also has its own `monthlyConvLimit` set):

```
free 200 · starter 3,000 · pro 15,000 · agency 75,000 · enterprise ∞
```

Divide each plan's `PLAN_CREDIT_ALLOCATIONS` (Recipe 2) by its conversation limit — every
plan lands on the same **10,000 credits/conversation threshold** (2M/200 = 30M/3,000 =
150M/15,000 = 750M/75,000 = 10,000). This is deliberate proportional design, not
coincidence. A typical conversation (4-8 messages, ~60-150 chars/message, debit formula
`Math.ceil(len/4)*3` from Recipe 1 Step 1, ×5 on Pro/Agency if the classifier picks
"complex") debits roughly 180-1,600 credits — 6-16% of the threshold. **Conclusion: for any
realistic conversation length, the conversation-count cap binds before the credit budget
does, on all four plans.** Only abnormally long/heavy conversations (dozens of long
messages) would flip this — recompute the 10,000 threshold check first if a bot's
`bot.systemPrompt` or expected message length is unusually large before trusting this
conclusion for that specific bot.

The optional per-bot `monthlyCreditBudget` (`lib/db/schema.ts:119`, checked by
`checkBotCreditBudget`, `lib/credits/index.ts:40-45`) defaults to `null` → unlimited
(`if (!monthlyCreditBudget) return { allowed: true }`). It only binds tighter than the above
if a developer manually sets a low per-bot cap — don't assume it's active without checking
the specific bot row.

No tool/function-calling overhead exists in the chat pipeline (verified: no `tools:` /
`function_call` construct anywhere in `app/api/v1/chat/route.ts` or `lib/ai/*.ts`) — RAG
context injection into the system prompt is the only variable-size addition, and it's
already covered by the credit formula's `*3` overestimate multiplier, not a separate cost
line for this recipe's purposes.

### Step 2: the visitor-to-conversation ratio — state the assumption, don't hide it

Widget engagement rate (% of site visitors who open and start chatting) is not measurable
from this repo — it depends on widget placement, proactive triggers, and industry, all
outside the codebase. Use a **3-8% range** (conservative-passive to engaged-proactive
widget, standard chat-widget industry benchmarks) and always show both ends. Treat
`conversations/month ≈ engaging visitors/month` (1 conversation per engaging visitor;
returning-visitor and multi-session effects are a second-order refinement, not worth
modeling without real analytics data — flag this simplification if precision matters to the
audience).

```
visitors/month = conversation_limit / engagement_rate
```

### Worked numbers (recompute if `PLAN_LIMITS.conversations` or the assumed rate changes)

| Plan | Conversations/mo (org-wide) | Visitors/mo @ 8% | Visitors/mo @ 3% |
|---|---|---|---|
| Free (1 bot) | 200 | ~2,500 | ~6,700 |
| Starter (2 bots) | 3,000 | ~37,500 | ~100,000 |
| Pro (8 bots) | 15,000 | ~187,500 | ~500,000 |
| Agency (unlimited bots) | 75,000 | ~937,500 | ~2,500,000 |

**Multi-bot caveat — always state this for Pro/Agency:** the pool is shared across every bot
on the account (`bots` limit in the same `PLAN_LIMITS` table: pro=8, agency=∞). An agency
running N active client bots divides its pool N ways — e.g. Agency plan with 15 client bots
active gives each site ~5,000 conversations/mo (~62K-167K visitors/mo/site), not the
937K-2.5M single-site figure. Always ask or state the assumed active-bot count when
presenting a per-site number for Pro or Agency.

---

## When NOT to use this skill

- Need the THEORY of why routing/credits/payments work the way they do (RAG math, HNSW,
  cosine similarity, debit-first rationale, PayFast/LS protocol shape) → `octively-domain-reference`.
- Need to actually RUN a DB query (connection setup, which console, Drizzle Studio, script
  scaffolding) → `octively-diagnostics-and-tooling`. This skill assumes you already have a
  way to execute the SQL shown above and focuses on what to compute and how to interpret it.
- A webhook is returning an error code and you need step-by-step triage (401, wrong amount,
  credits not granted) → `octively-debugging-playbook`.
- Deciding IF a change is allowed, which gate it needs, or how to get owner sign-off →
  `octively-change-control`.
- Writing up a past incident where a payment/credit bug already happened →
  `octively-failure-archaeology`.
- Campaign/growth math (CAC, funnel conversion, acquisition cost) rather than cost/margin
  math → `octively-paying-customers-campaign`.
- Open research questions about the AI-cost frontier itself (why SOTA pricing keeps
  dropping, what's next) → `octively-research-frontier`.

---

## Provenance and maintenance

Date-stamped: 2026-07-06, revised 2026-07-07 (corrected Recipe 4's Jina dimension 768 → 1024;
added contents index; marked Recipe 2 as the authoritative `PLAN_CREDIT_ALLOCATIONS` copy;
trimmed Recipe 5 protocol theory in favor of `octively-domain-reference` §4), revised 2026-07-12
(added Recipe 7 — visitor capacity per plan; added `PLAN_LIMITS.conversations` and RAG
`DEFAULT_TOP_K` to the quick reference table; confirmed no tool/function-calling exists in the
chat pipeline). Every fact above was verified by direct file read on that date
except where marked UNVERIFIED/CONFLICTING. Re-verify before relying on this skill if any of
the following have since changed:

- **Model prices** (Recipe 1, master plan §6): re-verify at `openrouter.ai` directly, or read
  the live `model_prices` table (`SELECT * FROM model_prices ORDER BY effective_from DESC`) —
  it is refreshed from the OpenRouter API by `lib/db/queries/admin.ts` and is more current
  than the master plan doc's May-2026 snapshot.
- **`FREE_VARIANTS` map and `:free` model list** (Recipe 1/4): `grep -n "FREE_VARIANTS" -A20
  lib/ai/litellm.ts` — OpenRouter adds/removes free variants; check
  `openrouter.ai/collections/free-models` monthly per the comment at `lib/ai/router.ts:13`.
- **`CREDIT_PACKS` / `PLAN_PRICES_PKR`**: `grep -n "CREDIT_PACKS\|PLAN_PRICES_PKR" -A6
  lib/billing/payfast.ts` — these are pricing decisions, changeable only by the owner; if
  they've changed, the doc/code disagreement noted in Recipe 2 may have been resolved —
  re-check master plan §7/§8 too before repeating the "flag it" language verbatim.
- **`PLAN_CREDIT_ALLOCATIONS`**: `grep -n "PLAN_CREDIT_ALLOCATIONS" -A6 lib/credits/index.ts`.
- **Free-tier limits table (Recipe 4)**: `grep -n "free\|Free" .env.example` and re-read
  `.specify/memory/constitution.md` lines 220-260 — these drift whenever a vendor changes
  its free tier or the constitution gets updated; the constitution itself is known to have
  other stale sections (Netlify, deepseek default, Next.js 15) per
  `octively-architecture-contract`, so don't assume the whole file is current just because
  one line was verified here.
- **Routing/credit schema shape** (Recipe 2/3): `grep -n "routingDecisions\|creditTransactions"
  -A15 lib/db/schema.ts` — if these tables are ever split or renamed, every SQL snippet above
  needs updating.
- **PayFast/Lemon Squeezy verification logic** (Recipe 5): re-read
  `lib/billing/payfast.ts:109-170` and `lib/billing/lemon-squeezy.ts:12-22` directly before
  trusting the algorithm description above — payment integrity code is exactly the kind of
  thing that gets patched after an incident without every doc being updated.
- **`PLAN_LIMITS.conversations` / `bots`** (Recipe 7): `grep -n "PLAN_LIMITS" -A8
  lib/limits/index.ts` — if these change, the 10,000-credits/conversation threshold
  coincidence should be recomputed too (divide the new `PLAN_CREDIT_ALLOCATIONS` by the new
  conversation limits; it may no longer be a clean round number). The 3-8% visitor engagement
  range is an external assumption, not a repo fact — it never goes stale from a code change,
  only from someone actually measuring real widget open rates, at which point replace the
  assumption with `octively-diagnostics-and-tooling`-sourced GA4/GTM data if that's ever wired
  up for widget-open events.
