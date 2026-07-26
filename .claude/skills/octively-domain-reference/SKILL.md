---
name: octively-domain-reference
description: Load when you need the domain THEORY behind a piece of Octively behavior — what a mechanism IS and how it works, step by step. This skill OWNS the mechanism-level explanations of RAG (chunking, embeddings, pgvector HNSW, cosine similarity, retrieval, dedup, cross-bot isolation), LLM routing economics (classifier-based smart routing, OpenRouter :free variants, credit multipliers), the credits accounting model (debit-first, estimate-then-reconcile, idempotent ledger, grace periods), payment gateway protocols (this is the single owner of PayFast ITN + MD5 field-ordering/signing theory and Lemon Squeezy HMAC raw-body verification theory), and the multi-tenant white-label data model (org → bot → client → portal). Trigger on "what is / how does it work" questions: "what is HNSW", "why cosine similarity", "how does smart routing decide the model", "what's a credit worth", "how does PayFast ITN verification work", "what does BYOK mean here", "how is tenant isolation enforced", or "what protocol does the widget use for streaming". Defer to octively-architecture-contract for why a design was CHOSEN, its invariants, and its known weak points (the "should I touch this / what must never break" framing), octively-change-control for HOW to change any of this, octively-debugging-playbook for symptom-driven triage, and octively-unit-economics-toolkit for margin/cost-per-conversation math and hands-on signature-recompute recipes.
---

# Octively Domain Reference

Theory as it is instantiated in THIS codebase. Every term is defined once. Every
number is sourced from a file — re-run the verification command in the table before
trusting a number that looks stale.

This skill teaches WHAT the systems are and the concepts behind them. It does not
teach how to change them (`octively-change-control`), how to debug them
(`octively-debugging-playbook`), or margin math (`octively-unit-economics-toolkit`).

**Contents**
- §1 RAG as instantiated here (1.1 chunking, 1.2 embeddings, 1.3 pgvector + HNSW, 1.4 similarity/threshold/topK/dedup, 1.5 cross-bot isolation)
- §2 LLM routing economics (2.1 smart routing flow, 2.2 OpenRouter :free variants + BYOK, 2.3 default-model choice)
- §3 Credits accounting theory (3.1 plan allocations, 3.2 grace credits, 3.3 plan limits)
- §4 Payment gateway protocols (4.1 PayFast ITN, 4.2 Lemon Squeezy HMAC, 4.3 webhook idempotency) — the library's single owner of this protocol theory
- §5 Multi-tenant white-label model
- §6 SSE streaming protocol (widget ↔ chat API)

---

## 1. RAG as instantiated here

**RAG (Retrieval-Augmented Generation)**: instead of relying on the LLM's frozen
training data, the system searches the bot's own documents for passages relevant
to the user's question and injects those passages into the system prompt before
calling the model. This lets a bot answer accurately about a client's specific
product catalog, policies, or FAQs — content the LLM never saw during training.

### 1.1 Chunking

Documents are split into overlapping text chunks before embedding, because
embedding models have limited useful input length and retrieval precision drops
on very long passages. `lib/knowledge/chunker.ts` uses a sentence-boundary
splitter first (regex on `.!?` followed by whitespace + a capital letter), packing
sentences into a chunk until it would exceed the target size. If a single sentence
itself exceeds the target, it falls back to word-boundary splitting
(`splitOversized`). Every chunk carries a trailing overlap forward into the next
chunk so a fact split across a chunk boundary is not lost in either retrieval
window.

| Parameter | Value | Source |
|---|---|---|
| Target chunk size | 1000 chars | `lib/knowledge/chunker.ts:1` (`TARGET_SIZE`) |
| Overlap | 200 chars | `lib/knowledge/chunker.ts:2` (`OVERLAP`) |
| Minimum chunk length kept | 40 chars | `lib/knowledge/chunker.ts:38` (`.filter(c => c.trim().length >= 40)`) |
| Sentence boundary regex | `/(?<=[.!?])\s+(?=[A-ZÀ-ɏ])/` | `lib/knowledge/chunker.ts:43` |
| Oversized-sentence fallback | word-boundary split, same overlap | `lib/knowledge/chunker.ts:47-67` |

Expected behavior is pinned by `tests/integration/chunker.test.ts`: exactly 1000
chars → 1 chunk; 1201 chars → 2 chunks with a verified overlapping tail; a single
1200-char run-on sentence re-splits on word boundaries with every chunk ending on
a word character.

### 1.2 Embeddings

An **embedding** is a fixed-length vector of floats that represents the meaning of
a text passage, positioned so that semantically similar passages sit close
together in vector space. Octively embeds every chunk once at ingestion time
(the "passage" side) and embeds the user's live query at chat time (the "query"
side), then finds the nearest passage vectors to the query vector.

There are two interchangeable embedding providers, selected by `EMBEDDING_PROVIDER`
(default `jina`, per `.env.example:123`):

| Provider | Model | Dimensions | Where it runs | Notes |
|---|---|---|---|---|
| `jina` (default) | `jina-embeddings-v3` | 1024 | Serverless-friendly (Vercel/Netlify) | Daily token quota tracked in Redis; `QuotaExhaustedError` on exhaustion — job retried next day. `lib/knowledge/embedder.ts:63-65` |
| `onnx` | Xenova/bge-m3 (q8 quantized, ~570MB) | 1024 | VPS only (needs a long-running process) | Multilingual: English + Urdu + Roman Urdu. No query-side instruction prefix needed. `lib/knowledge/embedder.ts:23-26` |

Both providers output **1024 dimensions** — this is a change from an earlier
768-dim Gemini-based design (CLAUDE.md's "Gemini text-embedding-004 (768-dim)"
line is stale drift; do not repeat it). The `document_chunks.embedding` column is
`vector(1024)` (`lib/db/schema.ts:280`), matched by migration `0014_bge_m3_1024dim.sql`
which explicitly drops and rebuilds the HNSW index for the new dimension count
(verify: `grep -n "vector(" lib/db/schema.ts`).

### 1.3 pgvector + HNSW index

**pgvector** is a Postgres extension that adds a native vector column type and
distance operators (`<=>` for cosine distance, `<->` for Euclidean, `<#>` for
inner product). **HNSW (Hierarchical Navigable Small World)** is an
approximate-nearest-neighbor graph index: it builds multiple layers of a
navigable graph over the vectors so a similarity search can skip through the
graph in roughly logarithmic steps instead of scanning every row. It trades a
small amount of recall accuracy for large speedups at scale, and — unlike its
older sibling **IVFFlat** (which partitions vectors into k-means clusters and
requires choosing a cluster count ahead of time, degrading if the data
distribution shifts) — HNSW needs no pre-training pass and generally gives better
recall/speed tradeoffs for read-heavy, insert-light workloads, which matches
Octively's ingest-once/query-often pattern.

| Parameter | Value | Source |
|---|---|---|
| Index method | `hnsw` with `vector_cosine_ops` | `lib/db/migrations/0014_bge_m3_1024dim.sql:22` |
| `m` (max graph connections per node) | 16 | same file |
| `ef_construction` (build-time search width) | 64 | same file |
| Column | `document_chunks.embedding vector(1024)` | `lib/db/schema.ts:280` |

### 1.4 Similarity, threshold, topK, dedup

`lib/knowledge/retriever.ts` embeds the query, then runs:

```sql
SELECT id, document_id, text, 1 - (embedding <=> $queryVector) AS score
FROM document_chunks
WHERE bot_id = $botId AND version = (SELECT MAX(version) ...)
ORDER BY embedding <=> $queryVector
LIMIT $topK * 2
```

`1 - cosine_distance` converts pgvector's distance operator into a similarity
score in roughly [0, 1] (1 = identical direction). The code then filters by
`score >= threshold`, takes the top `topK`, and deduplicates by exact trimmed
text match (so a chunk that was indexed twice, e.g. across re-scrapes, doesn't
show up twice in the same answer).

| Parameter | Live value | Source |
|---|---|---|
| `DEFAULT_TOP_K` | 10 | `lib/knowledge/retriever.ts:9` — comment notes it was 20, lowered because the extra chunks cost ~1,000 input tokens for negligible recall gain |
| `DEFAULT_THRESHOLD` | **0 (no floor)** | `lib/knowledge/retriever.ts:13` — comment explains generic "list all products" queries score only 0.05–0.15 against specific passages, so any real floor would exclude legitimate catalog-browse queries; topK alone caps result count |
| Candidate pool before filtering | `topK * 2` rows fetched from Postgres | `lib/knowledge/retriever.ts:57` |
| Dedup key | `text.trim()` | `lib/knowledge/retriever.ts:65-77` |
| RAG skip shortcut | messages ≤15 chars or matching a greeting/small-talk regex skip retrieval entirely | `lib/knowledge/retriever.ts:17-24` (`shouldSkipRag`) |

**Known documentation drift, flagged so no one "fixes" it by accident**:
`tests/integration/retrieval-isolation.test.ts` (lines 32-33, 41) has comments
and mock data implying a `score >= 0.65` threshold, and its test data uses scores
in the 0.4–0.9 range to exercise that comment's assumption. The actual
`DEFAULT_THRESHOLD` in `retriever.ts` is `0`. Read the code, not the test
comment, for the live behavior — the test still passes today because its mocked
rows happen to be filtered by the unit-level assertions, not because the app
enforces 0.65. Do not treat the test comment as ground truth.

### 1.5 Cross-bot isolation

Every retrieval query is scoped with `WHERE bot_id = $botId`. Because bots belong
to orgs and clients only ever see their own bot's data through the portal, this
single filter is what prevents Bot A's ingested documents from ever leaking into
Bot B's answers — a hard multi-tenant requirement in a white-label product where
two unrelated agency clients could be adjacent rows in the same table.
`tests/integration/retrieval-isolation.test.ts` pins this behavior with mocked
`db.execute` responses (unit-level) plus a `describe.skipIf(!hasDb)` block for a
real-Neon-DB end-to-end check that must be run manually with `DATABASE_URL` set —
it is a placeholder today (`expect(true).toBe(true)`), not an executed E2E
assertion; treat automated proof of isolation as unit-level only until that
placeholder is filled in.

---

## 2. LLM routing economics

### 2.1 Smart routing decision flow

**Smart routing** classifies each incoming message by a cheap/fast model, then
picks which model actually answers it — routing simple messages to a cheap model
and reasoning-heavy messages to a stronger (more expensive) one, so the org's
credit spend tracks message complexity rather than a flat per-message cost.

`lib/ai/router.ts` implements this as `routeMessage()`:

1. If `SMART_ROUTING_FORCE_OFF=true`, routing is skipped entirely — every message
   goes to the bot's own default model at `baseEstimate` cost (`router.ts:94-103`).
2. Otherwise, `classifyMessage()` sends the message to `CLASSIFIER_MODEL`
   (`deepseek/deepseek-v4-flash`, `lib/ai/litellm.ts:1`) with a 1500ms timeout
   (`CLASSIFIER_TIMEOUT_MS`, `router.ts:30`) and a prompt asking for exactly one
   label: `greeting`, `faq`, `knowledge`, or `complex` (`router.ts:21-27`). Any
   classifier failure, timeout, or unparseable response defaults to `knowledge`
   (fail toward the safer, context-aware answer — `router.ts:55,65-67`).
3. `greeting` / `faq` → the bot's configured **light model** (`routingLightModel`
   or the bot's own default model) at `baseEstimate` cost.
4. `knowledge` → the bot's own default model at `baseEstimate` cost (no upcharge —
   RAG-context answers use the bot's normal tier).
5. `complex` → attempt the **strong model** (`routingStrongModel` or the global
   `STRONG_MODEL`, currently `anthropic/claude-haiku-4-5-20251001`,
   `lib/ai/litellm.ts:2`) at `baseEstimate * 5` credits (`STRONG_MODEL_BASE_ESTIMATE`
   naming aside, the actual multiplier applied is `STRONG_MODEL_MULTIPLIER = 5` in
   `lib/credits/index.ts:121`, matched by `router.ts:131`). If the org's balance
   can't cover the 5x estimate, or the debit itself fails, it silently falls back
   to the bot's default model (`fallbackUsed: true`) — the visitor never sees an
   error.

Smart routing itself is gated to paid plans in the chat route:
`bot.smartRoutingEnabled && ['pro','agency','enterprise'].includes(bot.orgPlan)`
(`app/api/v1/chat/route.ts:496`) — Starter and Free never pay the classifier
round-trip.

### 2.2 OpenRouter `:free` variants

**OpenRouter** is a unified API gateway in front of dozens of LLM providers.
Many popular open-weight models (Llama, DeepSeek, Gemma, Qwen, GPT-OSS, Nemotron)
have a `:free` suffix variant on OpenRouter — the same model, served free of
charge by a rotating pool of providers, subject to hard rate limits shared across
the caller's entire OpenRouter account (not per-model):

| Limit | Value | Source |
|---|---|---|
| Requests/minute per `:free` model | 20 (fixed, does not change with deposit) | `lib/ai/litellm.ts:9`, `lib/ai/free-quota.ts:2-3,21` |
| Requests/day, no deposit | 50 (per `lib/ai/litellm.ts` comment) / some docs say 200 — see drift note below | `lib/ai/litellm.ts:9` |
| Requests/day, after $10 OpenRouter deposit | 1,000 | `lib/ai/litellm.ts:9`, `lib/ai/free-quota.ts:22`, confirmed again in `docs/owflex_master_plan_v7.md` §6a |

**Drift flagged**: `lib/ai/litellm.ts:9` comment says "50 req/day (no deposit)" while
`docs/owflex_master_plan_v7.md` §6a (dated June 2026) says "200 to 1,000." Treat
the in-code comment as more likely current (it sits next to the working
`free-quota.ts` counters) but verify against OpenRouter's own docs
(`openrouter.ai/collections/free-models`) before quoting either number externally.
This is actually a THREE-way conflict: `lib/ai/free-quota.ts:22` hardcodes
`FREE_RPD_LIMIT = 1000` unconditionally — the running code never gates on deposit
status at all, so if the account has not made the $10 deposit, real-world 429s will
exceed what `canUseFree()` predicts. Full treatment:
`octively-unit-economics-toolkit` Recipe 4.

`buildModelPayload()` (`lib/ai/litellm.ts:179-194`) checks Redis-backed counters
(`lib/ai/free-quota.ts`, `canUseFree()`) before every call. If headroom exists, it
sends `models: [freeVariant, paidModel]` so OpenRouter itself tries the free
variant first and falls through to the paid model on a 429 — this fallback is
OpenRouter's own `models` array behavior, not custom retry logic. If the platform
counters show no headroom, Octively skips the free attempt entirely and goes
straight to paid, avoiding a ~500ms wasted round trip (`litellm.ts:172-177`).
`:free` IDs are never surfaced in user-facing model pickers — only the paid
canonical ID appears in `SUPPORTED_MODELS` (`litellm.ts:341-362`); the admin
`/admin/models` cost-audit view may show them.

| Concept | Definition |
|---|---|
| **BYOK** (Bring Your Own Key) | An org can supply its own encrypted LLM provider API key (`organizations.llmApiKey`, AES-GCM via `lib/ai/byok.ts`) instead of drawing on Octively's shared OpenRouter account/credits. |

### 2.3 Why the default model is a free Llama variant

| Var | Live value | Source |
|---|---|---|
| `LITELLM_DEFAULT_MODEL` | `deepseek/deepseek-v4-flash` | `.env.example:40` |
| `FALLBACK_MODEL` (hardcoded, used if the env var is unset AND as the credit-exhaustion fallback) | `meta-llama/llama-3.3-70b-instruct` | `lib/ai/litellm.ts:4` |

Note the CLAUDE.md line "Default model: `meta-llama/llama-3.3-70b-instruct:free`"
describes the code-level `FALLBACK_MODEL` / historical MVP default, not the
current `.env.example` value — both are free-tier-first choices (DeepSeek V4
Flash has a confirmed `:free` variant, `lib/ai/litellm.ts:20`), consistent with
the project's owner-confirmed "free-tier-first" rule, but they are two different
model strings; verify which one a given deployment is actually running with
`echo $LITELLM_DEFAULT_MODEL` on the target host before assuming either.

`docs/owflex_master_plan_v7.md` §6 (dated **May 2026**, updated §6a **June 2026**)
gives the full paid-tier ladder for context (all numbers as of that doc's date,
re-verify before quoting in customer-facing material):

| Tier | Example model | Input/Output per 1M (doc date: 2026-05/06) |
|---|---|---|
| 0 — Free | Llama 3.3 70B | $0 / $0 |
| 1 — Ultra Budget | DeepSeek V4 Flash | $0.14 / $0.28 |
| 2 — Budget | Gemini 2.5 Flash | $0.30 / $1.50 |
| 3 — Mid-Range | Claude Haiku 4.5 | $1.00 / $5.00 |
| 4 — Premium | Claude Opus 4.6 | $5.00 / $25.00 |

---

## 3. Credits accounting theory

A **credit**, in this codebase, is denominated in **estimated LLM tokens**, not a
separate currency unit. `estimatedTokens = Math.ceil(message.length / 4) * 3`
(`app/api/v1/chat/route.ts:450`) — roughly 4 chars/token for the input, times 3 as
a rough input+output+overhead multiplier — is debited from the org's Redis
balance *before* the LLM call, and any difference between the estimate and the
actual `tokensUsed` reported by the provider is refunded afterward
(`route.ts:571-574`). This is **estimate-then-reconcile**: fast, so the widget
never blocks on a slow provider-side usage report, but self-correcting on every
message so the balance stays accurate over time.

| Concept | Definition | Here |
|---|---|---|
| Debit-first | Balance is decremented before the expensive external call, refunded on failure | `lib/credits/index.ts:65-94` (`debit`), reconciliation at `route.ts:571-574`, full refund on stream failure at `route.ts:690` |
| Idempotency via `refId` | Each ledger row carries a unique reference (message ID or payment ID) so a retried write can't double-count | `creditTransactions.refId` has a `uniqueIndex` (`lib/db/schema.ts:225`); `logTransaction` uses `.onConflictDoNothing()` (`lib/credits/index.ts:107`); PayFast/Lemon Squeezy webhooks check for an existing row with that `refId` before crediting (`app/api/webhooks/payfast/route.ts:37,100`) |
| Source of truth split | Redis holds the live balance (fast, atomic `DECRBY`/`INCRBY`); Postgres `credit_transactions` is the append-only audit ledger | `lib/credits/index.ts` throughout |

### 3.1 Plan allocations (verify before quoting — these are business numbers)

(Authoritative copy of these numbers: `octively-unit-economics-toolkit` Recipe 2;
re-verify in `lib/credits/index.ts:12-18` — if the two skills disagree, the code wins
and both need updating.)

| Plan | Monthly credit allocation | Source |
|---|---|---|
| free | 2,000,000 | `lib/credits/index.ts:6,13` (`FREE_TIER_CREDITS`, `PLAN_CREDIT_ALLOCATIONS.free`) |
| starter | 30,000,000 | `lib/credits/index.ts:14` |
| pro | 150,000,000 | `lib/credits/index.ts:15` |
| agency | 750,000,000 | `lib/credits/index.ts:16` |
| enterprise | 750,000,000 | `lib/credits/index.ts:17` |

A one-time legacy-correction constant (`LEGACY_FREE_SEED = 50_000`,
`lib/credits/index.ts:10`) exists only for `correctLegacyOrgCredits()`, a
migration helper for orgs seeded before the free tier was raised to 2M in
May 2026 — do not reuse this constant anywhere else.

### 3.2 Grace credits (paid plans only)

`lib/credits/grace.ts` — `handleCreditExhaustion(orgId, orgPlan, botName)`:

- **Free plan**: no grace at all. On exhaustion the caller falls straight back to
  `FALLBACK_MODEL` with no email, no disable (`grace.ts:34`).
- **Paid plans**: on the *first* exhaustion in a calendar month, a 2-hour grace
  window opens (`ex: 7200` seconds, `grace.ts:51`) during which the bot keeps
  answering on the fallback model, and the org owner gets one email
  (`sendCreditGraceEmail`, fire-and-forget, `grace.ts:65`). If credits are
  exhausted again after the grace window has expired within the same month, the
  bot is disabled (`action: 'disable'`) — surfaced to visitors as "temporarily
  unavailable", never a raw error (`route.ts:489-493`). The function fails open
  (`action: 'fallback'`) on any internal error so a Redis or DB hiccup never takes
  the widget down (`grace.ts:72-76`).

| Key | TTL / purpose |
|---|---|
| `credit_grace:{orgId}:{yyyyMM}` | Set with `nx` + 2h TTL on first exhaustion; presence = grace still active |
| `credit_grace_used:{orgId}:{yyyyMM}` | Set with `nx`, no TTL for the month; presence after grace TTL expires = disable |

### 3.3 Plan limits (non-credit resource caps)

`lib/limits/index.ts` — `PLAN_LIMITS` governs bots/conversations/leads/docs/crawl
pages/storage/catalog size per plan, enforced independently of the credit
balance (e.g. a free-plan bot can be credit-rich but still blocked once it hits
its 200 conversations/month cap). See `lib/limits/index.ts:4-11` for the full
table; representative rows:

| Plan | Bots | Conversations/mo | Docs | Crawl pages |
|---|---|---|---|---|
| free | 1 | 200 | 3 | 0 |
| starter | 2 | 3,000 | 20 | 20 |
| pro | 8 | 15,000 | 50 | 100 |
| agency | unlimited | 75,000 | 500 | 1,000 |

---

## 4. Payment gateway protocols

### 4.1 PayFast ITN (Pakistan, PKR)

**ITN (Instant Transaction Notification)** is PayFast's server-to-server webhook:
after a customer completes checkout, PayFast POSTs form-encoded transaction data
to the merchant's `notify_url`. The *outgoing* checkout request
(`generatePaymentUrl` / `generatePlanPaymentUrl`, `lib/billing/payfast.ts:19-89`)
is an unsigned GET-style redirect built from plain query params — nothing stops
a user from editing `amount` in the browser URL bar before paying. That is why
`verifyItn()` (`lib/billing/payfast.ts:109-170`) never trusts the posted
`amount_gross` as authorization to grant credits; it **independently recomputes
the expected price** server-side from the plan/pack ID embedded in
`m_payment_id` and compares:

```
amountValid = expectedAmount !== null && Math.abs(amountGross - expectedAmount) < 0.01
```

(`payfast.ts:144`) — this is the concrete defense against amount tampering
described in `specs/005` (security hardening).

**MD5 signature**: PayFast's ITN payload includes a `signature` field computed by
the merchant side re-deriving the same MD5 hash and comparing. Per PayFast's
spec, the signature is computed by concatenating all posted fields **in the
order they were received** (not alphabetically sorted), URL-encoding each value
with `+` for spaces, appending `&passphrase=<encoded passphrase>`, then taking
the MD5 hex digest of the whole string (`payfast.ts:154-164`). Without a
configured `PAYFAST_PASSPHRASE`, the ITN is rejected outright — the code
comments explain why: absent a passphrase, the hash is computable from
semi-public merchant fields, making forged ITNs trivial (`payfast.ts:146-152`).
The final comparison uses a constant-time `safeEqual()` (`lib/security`) rather
than `===`, and requires `payment_status === 'COMPLETE'` (`payfast.ts:166`).

`m_payment_id` is overloaded to carry both purchase types in one string format,
parsed positionally:

| Layout | Format | Example |
|---|---|---|
| Credit pack | `{orgId}:{packId}:{timestamp}` | `org_123:growth:1751000000000` |
| Plan upgrade | `plan:{orgId}:{planId}:{timestamp}` | `plan:org_123:agency:1751000000000` |

(`payfast.ts:119-139`)

### 4.2 Lemon Squeezy webhooks (international, USD)

**Merchant of Record (MoR)**: Lemon Squeezy legally sells the product on
Octively's behalf, handling global tax/VAT compliance itself — Octively never
has to register for sales tax in every buyer's country. In exchange LS takes a
larger cut than a pure payment processor.

**HMAC-SHA256** verification: `verifyWebhook(rawBody, signature)`
(`lib/billing/lemon-squeezy.ts:12-22`) computes `HMAC-SHA256(rawBody,
LEMON_SQUEEZY_WEBHOOK_SECRET)` and compares it to the `signature` header using
Node's `timingSafeEqual` — a constant-time byte comparison that prevents a
timing side-channel attack from letting an attacker guess the correct signature
byte-by-byte (a plain `===` string comparison short-circuits on the first
mismatched byte, leaking length/prefix information via response latency).
Critically, this hashes the **raw, unparsed request body** — hashing a
re-serialized JSON object would produce a different digest than what LS signed,
since JSON key ordering/whitespace isn't guaranteed to round-trip identically.

Order and subscription payloads carry `custom_data.org_id` (and optionally
`coupon_id`) set at checkout time (`generateCheckoutUrl` /
`generatePlanCheckoutUrl`, `lemon-squeezy.ts:60-67,97-106`) — this is how the
webhook maps an anonymous LS purchase back to an Octively org without needing a
shared session.

### 4.3 Webhook idempotency (both gateways)

Both webhook handlers check for a prior `credit_transactions` row with the same
`refId` (the PayFast `m_payment_id` or the LS order/subscription ID) before
crediting anything — this is what makes a retried/duplicated webhook delivery
(both gateways retry on non-2xx or timeout) a safe no-op instead of a double
credit. See `app/api/webhooks/payfast/route.ts:37,100` and the `refId` unique
index at `lib/db/schema.ts:225`.

---

## 5. Multi-tenant white-label model

```
organizations (1)  ──ownerId──>  users (role='developer')
      │
      ├──> bots (N)  ──clientUserId──>  users (role='client', nullable)
      │        │
      │        ├── embedKey (public identity, "pk_" + 29 hex chars)
      │        ├── widgetConfig (jsonb — chat behavior)
      │        └── portalConfig (jsonb — what the client portal shows)
      │
      └──> orgMembers (N)  — additional team members with role, e.g. agency staff
```

(`lib/db/schema.ts:75-126,322-334`)

**org → bot → client → portal**: one `organizations` row is owned by one
developer (`ownerId`). Each `bots` row belongs to exactly one org (`orgId`) and
*optionally* one client user (`clientUserId`, nullable — set only when the
developer invites a client to view that bot's portal). The client only ever sees
the bots they've been explicitly attached to; the developer sees every bot under
their org.

**`embed_key` as public identity**: internal bot UUIDs are never exposed to the
browser. All public embed traffic (`/api/v1/chat`, `/api/v1/chat/poll`) resolves
the bot by `embed_key` (`pk_` + 29 hex chars, `lib/bots/embed-key.ts:9-11`), via
`embedKeyMatch()` which also honors a 24-hour grace window on the *previous* key
after a rotation (`embed-key.ts:18-27`) so an already-deployed widget script
doesn't break mid-rotation.

**BetterAuth roles**: two application roles, `developer` and `client`
(`lib/db/schema.ts:31`). `requireDeveloper()` (`lib/auth/session.ts`) gates every
dashboard server action; client-role users are routed to the portal surface only.
A developer who invited themselves for testing purposes keeps `role='developer'`
but is still treated specially in some portal-access checks
(`lib/auth/session.ts:30-32`) — read that file directly if working on
role-boundary code.

**What "white-label" concretely means here (verified, not assumed)**:
`portalConfig` (`lib/db/schema.ts:102`, shape in
`lib/db/queries/portal-config.ts:7-15`) lets a developer toggle which portal tabs
a client sees (`showConversations`, `showLeads`, `showSettings`), whether contact
details are revealed (`showLeadContacts`) and whether the client can take over a
live chat (`allowLiveReply`). **However**, the portal chrome itself still shows
"Octively" branding in multiple places today — `components/portal/TopNav.tsx:101`
renders the literal text "Octively" next to the `OctivelyMark` logo, and
`app/(portal)/portal/invite/page.tsx:161` does the same. There is currently no
per-org logo/name override wired into the portal shell. Do not describe the
client portal as "no Octively mentions" without re-verifying this — as of
2026-07-06 the product name is visible to the end client, and full white-label
(client-branded portal chrome) is not yet built.

---

## 6. SSE streaming protocol (widget ↔ chat API)

The embed widget and `/api/v1/chat` speak a minimal hand-rolled **SSE
(Server-Sent Events)** protocol over a plain `fetch()` + `ReadableStream` (not
the browser's native `EventSource`, which only supports GET). Each event is one
line `data: <json>\n\n`; the client splits on `\n`, looks for lines prefixed
`data: `, and `JSON.parse`s the remainder.

| Event `type` | Payload | Emitted when |
|---|---|---|
| `token` | `{ type: 'token', delta: string }` | Once per streamed token/chunk from the LLM provider | `app/api/v1/chat/route.ts:542`, consumed at `embed/src/embed.js:714-722` |
| `done` | `{ type: 'done', conversationId, messageId, needsHuman, handoffMode, products }` | Once, after the full LLM response is captured, message persisted, credits reconciled | `route.ts:686`, consumed at `embed/src/embed.js:723-726` |
| `error` | `{ type: 'error' }` | On any exception inside the stream body (LLM failure, DB failure mid-stream) — full credit refund happens first | `route.ts:691` (with `creditLib.refund` at `route.ts:690`), consumed at `embed/src/embed.js:727` |

Response headers deliberately disable buffering end-to-end so tokens visibly
stream instead of arriving all at once: `Content-Encoding: none` (skip gzip,
which would buffer the whole body before decompression),
`Cache-Control: no-cache, no-store, no-transform`, and `X-Accel-Buffering: no`
(disables nginx/Traefik proxy buffering) — `route.ts:711-723`.

On the client, incoming tokens are pushed into a small queue and drained at a
capped visual rate (~200 tok/s via `requestAnimationFrame`,
`embed/src/embed.js:678,693-702`) — this decouples the *actual* network delivery
rate (real providers can burst 200-400 tok/s) from the *visual* typing rate, so
replies don't appear to "flash" onto the screen in one paint.

**Live human handoff carve-out**: if a conversation has an active human agent
(`conversations.agentActiveAt` set), the chat route skips the LLM entirely and
returns plain JSON (not SSE) with `{ live: true, conversationId }`
(`route.ts:283-293`). The widget detects the JSON content-type
(`embed.js:666-670`) and switches to polling `/api/v1/chat/poll` every 4 seconds
(`embed.js:614`, `startLivePolling()`) for new `role='agent'` messages — this is
plain request/response polling, not a second SSE stream, and it stops
automatically once `agentActiveAt` clears server-side (`poll/route.ts:93`,
checked at `embed.js:610`).

---

## When NOT to use this skill

| If you need to... | Use instead |
|---|---|
| Change a chunking/threshold/model/credit parameter, or add a new one | `octively-change-control` (gates + owner-approval list for pricing/model/limit changes) |
| Understand WHY a design was chosen, or its known weak points/invariants | `octively-architecture-contract` |
| Debug a symptom (retrieval returning nothing, credits stuck, webhook rejected) | `octively-debugging-playbook` |
| Check whether a fix/idea has already been tried and rejected/reverted | `octively-failure-archaeology` |
| Compute cost-per-conversation, plan margin, or routing ROI | `octively-unit-economics-toolkit` |
| Find/add an env var or feature flag | `octively-config-and-flags` |
| Add or extend a vitest test for RAG/credits/routing | `octively-validation-and-qa` |

---

## Provenance and maintenance

Date-stamped 2026-07-06 (repo commit graph at time of authoring: `6a9b946`); revised
2026-07-07 (added contents index; sharpened frontmatter split vs
`octively-architecture-contract`; §2.2 now points at the fuller three-way OpenRouter
free-RPD conflict in `octively-unit-economics-toolkit` Recipe 4; §3.1 notes the
authoritative allocation copy lives in that same skill).
Re-run these before trusting any volatile number in this file:

```bash
cd "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas"

# Chunking params
grep -n "TARGET_SIZE\|OVERLAP" lib/knowledge/chunker.ts

# Embedding provider + dims
grep -n "DIMENSIONS\|PROVIDER" lib/knowledge/embedder.ts
grep -n "vector(" lib/db/schema.ts

# HNSW index params (find the newest migration touching the index)
grep -rn "USING hnsw" lib/db/migrations/*.sql

# Retrieval topK/threshold
grep -n "DEFAULT_TOP_K\|DEFAULT_THRESHOLD" lib/knowledge/retriever.ts

# Classifier + strong model + free variants
grep -n "CLASSIFIER_MODEL\|STRONG_MODEL\|FALLBACK_MODEL" lib/ai/litellm.ts
grep -n "STRONG_MODEL_MULTIPLIER" lib/credits/index.ts

# Default model env var (per-deployment — check the actual host, not just .env.example)
grep -n "LITELLM_DEFAULT_MODEL" .env.example

# OpenRouter free-tier rate limits (also check openrouter.ai/collections/free-models live)
grep -n "FREE_RPM_LIMIT\|FREE_RPD_LIMIT" lib/ai/free-quota.ts

# Plan credit allocations + plan resource limits
grep -n "PLAN_CREDIT_ALLOCATIONS" -A6 lib/credits/index.ts
grep -n "PLAN_LIMITS" -A6 lib/limits/index.ts

# Grace period TTLs
grep -n "ex: 7200\|graceKey\|graceUsedKey" lib/credits/grace.ts

# PayFast pricing + passphrase requirement
grep -n "PLAN_PRICES_PKR\|CREDIT_PACKS\|PAYFAST_PASSPHRASE" lib/billing/payfast.ts

# Lemon Squeezy webhook secret + HMAC
grep -n "LEMON_SQUEEZY_WEBHOOK_SECRET\|timingSafeEqual" lib/billing/lemon-squeezy.ts

# Portal branding — re-check before claiming full white-label
grep -rn "Octively" components/portal "app/(portal)"
```
