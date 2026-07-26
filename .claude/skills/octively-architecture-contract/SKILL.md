---
name: octively-architecture-contract
description: Load when you need to understand WHY Octively is built the way it is before touching it — the design rationale, the invariants that must never break, and the known weak points — including the four-subdomain proxy.ts routing (octively.com, admin., app., affiliates.), the chat request pipeline in app/api/v1/chat/route.ts, the Redis+Postgres dual-store credit system, PayFast/Lemon Squeezy webhook verification, BetterAuth roles and tenant isolation, the affiliate surface's separate magic-link auth system, the lib/ai/litellm.ts LLM abstraction, the RAG pipeline (R2, QStash, Jina/BGE-M3 1024-dim, pgvector HNSW), or the embed widget contract. Also load when a change might violate an invariant (org_id scoping, debit-first credits, error shape, embed_key exposure), when CLAUDE.md seems to contradict the code (three-vs-four surfaces, Gemini embeddings, Netlify), or when assessing a known weak point such as the script-injection embed or the single-VPS deploy. For the underlying mechanism theory and definitions (what HNSW/ITN/HMAC/BYOK are, how the PayFast MD5 or LS HMAC algorithm works step by step, how debit-first accounting flows) rather than the invariants/weak-points framing, see octively-domain-reference instead.
---

# Octively Architecture Contract

The load-bearing design decisions, why they were made, the invariants that must always hold, and the weak points stated plainly. Everything below is verified against the repo at `/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas` (quote the path, it contains spaces) as of 2026-07-06. Where CLAUDE.md or the constitution disagrees with the code, this file states the code's truth and labels the drift.

**What Octively is:** a white-label AI chatbot builder (Next.js 16.2.6 App Router, one app, one repo, one deploy) sold to Pakistani freelancers/agencies. Live in production on a single Hetzner VPS via Dokploy; `master` is production.

---

## 1. Four-surface hostname architecture

CLAUDE.md says "three subdomains". That is drift. There are **FOUR** surfaces (the affiliate surface was added later, ~2026-07):

| Hostname | Rewrite target | Route group | Layout |
|---|---|---|---|
| `octively.com` | none (marketing) | `app/(marketing)` | `app/(marketing)/*` pages, root `app/layout.tsx` |
| `admin.octively.com` | `/dashboard/*` | `app/(dashboard)` | `app/(dashboard)/layout.tsx` |
| `app.octively.com` | `/portal/*` | `app/(portal)` | `app/(portal)/layout.tsx` |
| `affiliates.octively.com` | `/affiliate/*` | `app/affiliate` (plain dir, not a route group) | `app/affiliate/layout.tsx` |

Routing lives in root-level `proxy.ts` (Next.js 16 convention, replaces `middleware.ts`; it must be at project root, NOT `app/proxy.ts`). Read it in full before touching routing; it is 101 lines and every guard exists because of a past 404/CORS bug:

- `proxy.ts:19` skips any path whose last segment has a file extension, otherwise `/google-logo.png` would rewrite to `/dashboard/google-logo.png` and 404.
- `proxy.ts:21-33` admin rewrite, guarded against double-prefixing (`/dashboard/login` must not become `/dashboard/dashboard/login`) and skips `/api`, `/_next`.
- `proxy.ts:34-44` portal rewrite, same guards.
- `proxy.ts:45-61` affiliate rewrite. Extra guard at `proxy.ts:50-52`: a leaked `requireDeveloper()` redirect to `/dashboard/login?reason=expired` on the affiliates host is turned into a redirect to `/affiliate/login` instead of a 404 rewrite.
- `proxy.ts:62-92` on the bare `octively.com`, `/dashboard/*`, `/portal/*`, `/affiliate/*` 302-redirect to their canonical subdomains, and bare `/signup` and `/login` redirect to the admin origin. RSC prefetches (`?_rsc=`) are deliberately NOT redirected (`proxy.ts:72`) because the browser follows the 302 cross-origin and fails CORS.
- `proxy.ts:99-101` matcher excludes `_next/static`, `_next/image`, `favicon.ico`, `icon.svg`.

**Why one Next.js app + rewrites instead of four apps:** all four surfaces share the same DB, auth config, `/lib` business logic, Drizzle schema, and `/api/v1` routes. One repo means one build gate, one Docker image, one deploy, and shared TypeScript types across surfaces. The cost (each surface must be prefix-guarded in `proxy.ts`, and CSP/subdomain bugs are a top historical failure class) was accepted for a solo maintainer. Session cookies are deliberately per-subdomain, NOT shared (see `lib/auth/index.ts:203-205`): a shared `.octively.com` session cookie caused a client login on app. to wipe the admin session. Only tiny non-sensitive UI-hint cookies (`oct_dev`/`oct_client`) are set on `.octively.com` (`lib/auth/index.ts:171-201`).

Before building ANY UI, confirm which surface you are on and use its token prefix (mkt-/adm-/prt-); see `octively-ui-surfaces`.

## 2. The chat request pipeline (the money path)

`app/api/v1/chat/route.ts` (746 lines) is the single most load-bearing file. `export const dynamic = 'force-dynamic'`, `maxDuration = 60`. Numbered flow with anchors:

1. **IP rate limit**, 30 req/min sliding window per IP via Upstash (`route.ts:120-132`, limiter defined in `lib/ratelimit.ts`, prefix `Octively:chat`). Skipped silently if Upstash env vars are absent.
2. **JSON parse + Zod** `bodySchema` = `{ embedKey, sessionId, message (max 2000 chars), pageUrl? }` (`route.ts:113-152`). Errors use the `{ error, code, status }` shape.
3. **Embed key resolution**: one joined query resolves bot + org + owner email by `embedKeyMatch(embedKey)` and `isActive` (`route.ts:155-194`). `embedKeyMatch` (`lib/bots/embed-key.ts:18-27`) also matches a rotated-out key for a 24 h grace window (`previousEmbedKey` + `embedKeyRotatedAt`). Banned org check at `route.ts:196-201`.
4. **Origin guard** (`route.ts:219-250`): if the bot has a `storeUrl`, only that exact origin (plus the app's own origin for dashboard preview) may call. If NO `storeUrl` is set, the bot is locked down by default and any external Origin gets 403 `STORE_URL_REQUIRED`; this stops a leaked embed key from burning credits from third-party sites.
5. **Conversation find-or-create by (botId, sessionId), insert user message** (`route.ts:252-277`).
6. **Live human handoff pause** (`route.ts:283-293`): if `handoffMode === 'live'` and an agent is active, return `{ live: true }`, no LLM call, no debit.
7. **Context assembly** in parallel `Promise.all` (`route.ts:295-342`): last 6 messages (3 turns; was 10, cut to save ~600 input tokens), platform prompt with `{{botName}}/{{storeName}}/{{storeUrl}}` substitution, RAG retrieval (skipped for greetings/short messages via `shouldSkipRag`), and a live KB chunk count.
8. **System prompt composition** (`route.ts:403-414`, `lib/knowledge/prompt-builder.ts`): language rule + conciseness rule FIRST (earlier instructions weigh more), then platform prompt, bot prompt, doc context, strict-mode text, lead-capture and product-card marker instructions.
9. **Plan conversation limit** (`route.ts:417-435`): on breach returns 402 `PLAN_LIMIT` with a white-label-safe message that never mentions plans (the visitor is the client's customer).
10. **Per-bot credit budget** check via a monthly Redis counter (`route.ts:438-447`, `lib/credits/index.ts:32-55`).
11. **Debit-first**: `estimatedTokens = ceil(message.length / 4) * 3`, then `creditLib.debit(orgId, estimatedTokens)` BEFORE any LLM call (`route.ts:450-451`).
12. **Credit exhaustion → grace** (`route.ts:478-495`): `handleCreditExhaustion` (`lib/credits/grace.ts:27-77`) returns `fallback` (serve on `FALLBACK_MODEL`) or `disable`. Free plan always falls back, no email. Paid plans get ONE 2 h grace window per calendar month (Redis keys `credit_grace:{orgId}:{yyyyMM}` TTL 7200 + `credit_grace_used:...`), owner emailed once; after the window, bot answers with a generic "temporarily unavailable" 200. Fails open to `fallback` if Redis errors.
13. **Smart routing** (`route.ts:496-514`, only if `bot.smartRoutingEnabled` AND plan in pro/agency/enterprise): `routeMessage` in `lib/ai/router.ts:83-167` classifies the message (greeting/faq/knowledge/complex) with `CLASSIFIER_MODEL` via a direct OpenRouter fetch with a 1500 ms abort (`router.ts:30-71`, any failure defaults to `knowledge`). greeting/faq → light model; knowledge → bot default; complex → strong model at a 5x credit estimate (router debits the 5x itself then refunds the base estimate the route already took, `router.ts:145-157`). Kill switch: `SMART_ROUTING_FORCE_OFF=true`. Also `allowedModels` clamping at `route.ts:463-468`.
14. **Streaming**: `chatCompletionStreamGen` (`lib/ai/litellm.ts:459-554`) streams SSE tokens, `maxTokens: 800`. All post-LLM work runs INSIDE the ReadableStream controller so it finishes before the stream closes (`route.ts:516-709`). Response headers include `Content-Encoding: none` + `X-Accel-Buffering: no` (`route.ts:711-724`); removing these makes replies arrive in one buffered lump instead of token-by-token.
15. **Marker extraction**: `[PRODUCTS:[...]]` parsed and stripped (`route.ts:557-569`); `[LEAD:{...}]` handling is prompt-driven and processed by the leads endpoint/widget, not here.
16. **Estimate-then-reconcile**: refund the over-estimated portion `actualDebit - tokensUsed` (`route.ts:571-574`), compute USD cost from the `model_prices` table (`route.ts:577-585`), insert the assistant message with token counts, latency, `modelUsed`, and `flaggedUnanswered` (`route.ts:588-599`).
17. **Ledger write**: `logTransaction(orgId, -tokensUsed, 'chat_debit', refId = messageId)` (`route.ts:602-606`), plus fire-and-forget per-bot counter increment and a `routing_decisions` insert (`route.ts:609-620`).
18. **Uncertainty flagging + handoff**: `flagIfUnanswered` regex (`lib/ai/uncertainty.ts`, ADR-0003); if handoff is enabled and the reply is flagged, mark `needsHuman`/`escalatedAt` and send a non-blocking notification email to developer or client (`route.ts:623-683`).
19. **Done event** carries `conversationId`, `messageId`, `needsHuman`, `handoffMode`, `products` (`route.ts:686`).
20. **Failure path**: on stream error, full refund of `estimatedTokens` and the error is pushed to the Redis list `chat:errors` (capped at 200 entries) (`route.ts:688-707`, pre-stream errors at `route.ts:725-745`).

## 3. Credits: dual store (ADR-0001)

`history/adr/0001-*.md`. Redis is the wallet, Postgres is the bank statement.

- **Redis** key `credits:{orgId}` (Upstash): atomic `DECRBY`/`INCRBY`. `debit()` (`lib/credits/index.ts:65-94`) decrements; if the result goes negative it increments back and returns `ok: false`. If the key is missing or 0 AND the org has zero `credit_transactions` rows, it re-seeds `FREE_TIER_CREDITS`.
- **Postgres** `credit_transactions` append-only ledger with a UNIQUE `refId`; `logTransaction` uses `onConflictDoNothing()` (`lib/credits/index.ts:101-108`). `refId` = messageId for chat debits, `m_payment_id` for PayFast, order/subscription id for Lemon Squeezy. The UNIQUE constraint IS the idempotency mechanism for webhook retries.
- **Allocations**: per-plan monthly amounts live in `PLAN_CREDIT_ALLOCATIONS` (`lib/credits/index.ts:6-18`); the library's authoritative copy of the numbers is `octively-unit-economics-toolkit` (Quick reference + Recipe 2) — cite that, don't restate here. 1 credit = 1 token. **Drift:** ADR-0001's text says free = 50,000; that was the legacy seed (`LEGACY_FREE_SEED`) — the live free allocation is 2,000,000, fixed May 2026 with a correction migration (`correctLegacyOrgCredits`, `lib/credits/index.ts:162-182`).
- Strong-model calls cost 5x (`STRONG_MODEL_MULTIPLIER`, `lib/credits/index.ts:121-126`).
- Plan changes use `INCRBY` of the allocation delta so accumulated balance is preserved (`upgradePlanCredits`, `lib/credits/index.ts:135-146`).
- **Why dual store:** Redis-only has no audit trail or webhook idempotency; Postgres-only adds 50-200 ms and lock contention to every chat request. Accepted cost: Redis down = chat outage, and the two stores can briefly diverge (Postgres is the reconciliation source of truth).

## 4. Billing: dual provider (ADR-0004)

`history/adr/0004-*.md`. PayFast for PKR, Lemon Squeezy for USD; both credit the same Redis+ledger flow, both idempotent via `refId`.

- **PayFast ITN** (Instant Transaction Notification, PayFast's server-to-server payment webhook — `lib/billing/payfast.ts:109-170`, webhook `app/api/webhooks/payfast/route.ts`): MD5 signature verification compared with constant-time `safeEqual` (`lib/security.ts`); the exact field-ordering/encoding algorithm is owned by `octively-domain-reference` §4.1 (hands-on recompute recipe: `octively-unit-economics-toolkit` Recipe 5). What THIS skill owns is the three hard rules born from the specs/005 security hardening: (a) **fail closed** if `PAYFAST_PASSPHRASE` is unset, because without it the MD5 is forgeable from semi-public merchant fields (`payfast.ts:148-151`); (b) **amount validation**: the outgoing checkout URL is unsigned so the payer can tamper with `amount`; `amountValid` requires `amount_gross` to match the server-side price for the pack/plan (`payfast.ts:144`); (c) `refId` (= `m_payment_id`, format `{orgId}:{packId}:{ts}` or `plan:{orgId}:{planId}:{ts}`) checked against the ledger before crediting.
- **Lemon Squeezy** (`lib/billing/lemon-squeezy.ts:12-22`, webhook `app/api/webhooks/lemon-squeezy/route.ts`): HMAC (hash-based message authentication code) SHA-256 over the RAW request body buffer, compared with `crypto.timingSafeEqual` — the invariant is "raw bytes, constant-time"; protocol details and why: `octively-domain-reference` §4.2. Order id / subscription id = `refId`. LS is merchant of record (handles international tax).
- Prices in code (verify before quoting, they are owner-only decisions): `CREDIT_PACKS` (`payfast.ts:4-8`) and `PLAN_PRICES_PKR` (`payfast.ts:51-55`) — full constant catalog in `octively-config-and-flags` §6, margin math in `octively-unit-economics-toolkit` Recipe 2.

## 5. Admin gating (ADR-0002) and unanswered detection (ADR-0003)

- **Platform admin = env email check, not a role.** `requirePlatformOwner()` (`lib/auth/session.ts:44-51`) compares session email to `PLATFORM_OWNER_EMAIL` (server-only env; a `NEXT_PUBLIC_` fallback was explicitly rejected because it would ship the admin email to attackers). Chosen over a third BetterAuth role because RBAC for N=1 admin is over-engineering; the accepted cost is that a second admin requires a code change.
- **Unanswered detection = one regex, zero latency, zero cost.** `UNCERTAINTY_RE` in `lib/ai/uncertainty.ts` matches phrases like "i don't know", "i'm not sure", "outside my knowledge". Known 10-20% false-positive rate accepted over a second LLM scoring call (would double cost and add 300-800 ms per message). The same flag drives BOTH the dashboard Unanswered tab and the human-handoff email trigger.

## 6. Auth architecture

BetterAuth (`lib/auth/index.ts`), Drizzle adapter on Neon Postgres, Upstash Redis as `secondaryStorage` so sessions/rate-limit counters survive across serverless instances.

- **Two BetterAuth roles**: `developer` (default) and `client`, stored as a user `additionalFields.role` (`lib/auth/index.ts:51-67`). Email/password (verification required) + Google OAuth.
- **Org creation on signup**: `databaseHooks.user.create.after` creates a free-plan organization for every new developer, UNLESS the email has a pending invitation (then they are a client) (`lib/auth/index.ts:95-135`).
- **Guards** (`lib/auth/session.ts`): `requireDeveloper()` (role check from session), `requireClient()` (reads role from DB directly because the 5-minute cookie cache can be stale; a developer who assigned a bot to themselves also passes), `requirePlatformOwner()`.
- **Auth rate limits**: sign-in 5/min, forget-password 3/min, sign-up 3/min, get-session 30/min per IP (`lib/auth/index.ts:141-158`).
- **Per-subdomain session cookies + parent-domain hint invariant.** Each surface (`admin.` / `app.`) gets its OWN scoped session cookie — they are intentionally separate (cross-subdomain sharing wiped the admin session when a client logged into the portal; see failure-archaeology P3). The ONE thing that writes to the parent domain `.octively.com` is the marketing hint-cookie hook (`hooks.after` in `lib/auth/index.ts`), which drops a non-sensitive `oct_dev` / `oct_client` flag the marketing nav reads to show the right login button. **Invariant (P4):** that hook MUST only fire on the main marketing host (`octively.com` / `www.octively.com`), never on `admin.` / `app.`, with a short `maxAge` (24h) and both hints cleared on sign-out. Writing parent-domain cookies from an auth subdomain pollutes the shared cookie jar and causes intermittent browser failures (works after clearing cookies, then re-breaks). `session.cookieCache` is 1 minute (was 5) so stale sessions clear fast.
- **The affiliate surface does NOT use BetterAuth.** It has its own magic-link session system: `lib/affiliates/auth.ts` (15-minute magic link, token stored in the `affiliate_sessions` table). Do not try to add affiliate logic to BetterAuth roles.
- **Tenant model**: `organizations` (owner = developer) → `bots` (each has `org_id`, optional `client_user_id`) → conversations/messages/leads/documents. Nearly every tenant table carries `org_id` or `bot_id` with indexes (`lib/db/schema.ts`).
- **Tenant isolation invariant** (constitution §V, `.specify/memory/constitution.md:124-130`): every query touching user data MUST be scoped to `org_id` AND verified via a join proving the session owns that org. **`bot_id` alone is INSUFFICIENT** for authenticated dashboard/portal queries. (The public chat path is the exception by design: there the `embed_key` itself is the credential that resolves the bot+org.)

## 7. LLM abstraction

`lib/ai/litellm.ts` is the LLM gateway. Despite the filename it is NOT the LiteLLM proxy product: it is a hand-rolled wrapper that fetches `https://openrouter.ai/api/v1/chat/completions` directly. It owns:

- Model constants (`litellm.ts:1-4`, as of 2026-07-06): `CLASSIFIER_MODEL = deepseek/deepseek-v4-flash`, `STRONG_MODEL = anthropic/claude-haiku-4-5-20251001`, `FALLBACK_MODEL = meta-llama/llama-3.3-70b-instruct`. Default model resolution: explicit arg → `LITELLM_DEFAULT_MODEL` env → `FALLBACK_MODEL` (`litellm.ts:406-407`). CLAUDE.md's "default is llama-3.3-70b:free" is close but stale: the `:free` suffix is now applied dynamically, see next point.
- **Free-variant-first economics**: `FREE_VARIANTS` maps paid model ids to their OpenRouter `:free` variants (`litellm.ts:14-32`); `buildModelPayload` (`litellm.ts:179-194`) sends `models: [freeVariant, paid]` only when the platform-wide free quota has headroom. Quota tracking in `lib/ai/free-quota.ts`: 20 req/min and 1000 req/day across the whole platform (one OpenRouter key), counted in Redis; when full, requests skip the free attempt to avoid a ~500 ms 429 round-trip.
- **Per-model provider routing** (`litellm.ts:54-160`): hand-tuned OpenRouter `provider.order`/`ignore` lists based on measured TTFT/uptime. Values must be provider SLUGS, not display names.
- `chatCompletion` (non-streaming) and `chatCompletionStreamGen` (SSE async generator with usage accounting).
- **BYOK** (Bring Your Own Key — `lib/ai/byok.ts`): AES-GCM encrypt/decrypt for customer OpenRouter keys under `LLM_KEY_ENCRYPTION_SECRET`. As of 2026-07-06 `encryptApiKey` is called from the settings save path (`lib/db/queries/account.ts`) but **`decryptApiKey` has zero callers**: BYOK keys are collected and stored but NOT yet used at inference time. Treat "BYOK works end-to-end" as **open**, not shipped.
- **Known exception to "all LLM calls go through litellm.ts"**: the smart-routing classifier in `lib/ai/router.ts:37-53` makes its own direct OpenRouter fetch (it needs the abort-timeout and a 20-token cap). It still uses `CLASSIFIER_MODEL` from litellm.ts. Any THIRD callsite is a violation.

## 8. Knowledge base / RAG

Ingestion (spec `specs/002-phase-3-knowledge/`): upload/URL routes under `app/api/v1/documents/` → file bytes to Cloudflare R2 (`lib/storage/r2.ts`) → `documents` row (status `queued`) → QStash message to `app/api/internal/qstash/ingest` → parse (`lib/knowledge/parser.ts`, unpdf/mammoth) → clean → chunk (`lib/knowledge/chunker.ts`; product catalogs get a catalog-aware chunker so one product never splits across chunks) → embed → versioned upsert into `document_chunks` (old versions deleted, `ingest/route.ts:168-180`) → status `ready`.

**Embeddings, current truth (2026-07-06):** `lib/knowledge/embedder.ts` is dual-provider via `EMBEDDING_PROVIDER`: default `jina` (jina-embeddings-v3 API, 1M-token/day self-imposed quota in Redis) or `onnx` (local Xenova/bge-m3 q8 via @huggingface/transformers, VPS only). **Both output 1024 dims**; `document_chunks.embedding` is `vector(1024)` (`lib/db/schema.ts:271-285`, migration `lib/db/migrations/0014_bge_m3_1024dim.sql`). CLAUDE.md's "Gemini text-embedding-004 768-dim" is **stale drift**; do not copy it.

Retrieval at chat time (`lib/knowledge/retriever.ts`): embed the query, cosine `<=>` search over the latest chunk version per document, HNSW index (`m=16, ef_construction=64`, cosine ops), `TOP_K = 10`, threshold 0 (deliberate: generic catalog queries score 0.05-0.15 so any floor kills them), fetch `topK*2` then dedup by text. `shouldSkipRag` skips greetings and messages ≤ 15 chars. Kill switch: `KNOWLEDGE_BASE_ENABLED=false`. The vector queries use `db.execute(sql\`...\`)` with Drizzle's parameterized `sql` tag, which is the sanctioned way to do what Drizzle's query builder cannot (pgvector operators); string-concatenated SQL is still banned.

## 9. Embed widget contract

- Client sites add one script tag pointing at `/embed.js`. The App Router route `app/embed.js/route.ts` serves the committed file **`public/embed.js`** with `Access-Control-Allow-Origin: *` and 1 h cache. It does NOT serve `embed/dist/` (gitignored). Source is `embed/src/embed.js`; `npm run build:embed` minifies AND copies to `public/embed.js`. Editing the source without rebuilding ships a stale widget; see `octively-change-control` for the gate.
- **Public bot identity is `embed_key` only**: format `pk_` + 29 hex chars (`lib/bots/embed-key.ts:9-11`). Internal UUIDs for bots are never exposed. Key rotation keeps the previous key valid 24 h (`EMBED_KEY_GRACE_MS`). (Nuance: `conversationId`/`messageId` UUIDs ARE returned in the SSE `done` event; they are per-visitor resources needed for polling/feedback, not tenant identifiers.)
- Widget boot config comes from `GET /api/v1/widget-config?key=pk_...` (`app/api/v1/widget-config/route.ts`): colors, position, welcome message, lead form, branding, theme, WhatsApp number. Public and unauthenticated by design; contains no secrets.
- Abuse protections on the public endpoints: IP rate limits (chat 30/min, leads 10/min via `lib/ratelimit.ts`), the storeUrl origin lock, locked-down-by-default bots with no storeUrl, embed key + `isActive` check, org ban check, per-bot monthly budgets, plan conversation limits.

---

## INVARIANTS (testable; breaking any of these is a P0)

1. **Tenant isolation**: every authenticated query touching user data filters by `org_id` AND joins to prove session ownership. `bot_id` alone is insufficient (constitution §V). Test exists: `tests/integration/retrieval-isolation.test.ts`.
2. **Debit-first**: credits are debited BEFORE the LLM call and refunded on failure; never debit after the call (`app/api/v1/chat/route.ts:450-451`, constitution §VII).
3. **Every credit mutation is mirrored to the `credit_transactions` ledger with a `refId`**; webhook crediting must check `refId` existence first and rely on the UNIQUE constraint.
4. **Payment webhooks verify signatures before any side effect**: PayFast MD5+passphrase (fail closed if passphrase unset) + amount validation; Lemon Squeezy HMAC over raw body with `timingSafeEqual`.
5. **Error shape** on all API routes is exactly `{ error: string, code: string, status: number }`.
6. **All API routes validate input with Zod** before auth/limit/execute.
7. **No raw SQL strings**: Drizzle query builder, or `db.execute(sql\`...\`)` parameterized template only (pgvector paths).
8. **Only `embed_key` identifies a bot publicly**; internal bot UUIDs never leave the server.
9. **All LLM calls go through `lib/ai/litellm.ts`** (single documented exception: the router classifier fetch, `lib/ai/router.ts:37`). No provider SDK imports in application code.
10. **Env-swappable services** (constitution §IX): swapping DB/Redis/storage/model must require only env var changes (`LITELLM_DEFAULT_MODEL`, `EMBEDDING_PROVIDER`, `DATABASE_URL`, ...). No hardcoded service endpoints in business logic.
11. **Free-tier-first**: no new paid dependency or service without explicit owner approval (owner-confirmed rule, 2026-07-06). Route additions through `octively-change-control`.
12. **Visitor-facing widget copy never mentions plans, limits, or Octively** (white-label promise; see the `PLAN_LIMIT` message at `route.ts:429-434`).
13. **SSE responses keep `Content-Encoding: none` and no-transform cache headers**, or streaming visibly breaks behind proxies.

## KNOWN WEAK POINTS (stated plainly; all labeled open as of 2026-07-06)

| # | Weak point | Status |
|---|---|---|
| 1 | **Embed widget is script injection, not an iframe sandbox.** The widget JS runs in the host page's DOM/cookie context. Mitigations exist (origin lock, embed key, rate limits) but iframe `sandbox` isolation is the industry standard and is only a TODO (CLAUDE.md "iframe Sandbox Refactor" section; `/security` page says "coming soon"). | open |
| 2 | **Single VPS, no HA.** One Hetzner CX33 running Docker via Dokploy serves everything. VPS down = whole product down. No replica, no failover. | open |
| 3 | **Redis is a hard dependency of the chat path.** Upstash outage = no debits possible = chat outage (accepted in ADR-0001). | accepted risk |
| 4 | **Only 3 automated test files** (`tests/integration/`: chunker, credits-routing, retrieval-isolation). Money paths (webhooks), auth guards, and proxy routing have no automated coverage; QA is the manual `docs/smoke-tests.md`. | open |
| 5 | **master is production with no staging gate.** `git push origin master` deploys via GitHub Actions → GHCR → Dokploy. The only gates are local (`npm run build`, smoke tests). See `octively-change-control`. | accepted risk |
| 6 | **Docs drift.** CLAUDE.md still says: three subdomains (there are four), Next.js 15 (it is 16.2.6), Gemini 768-dim embeddings (Jina/BGE-M3 1024-dim), Netlify budget section (Netlify is decommissioned per `docs/production-deployment.md`). The constitution mentions Netlify hosting, a deepseek default model, and "Tri-Surface". ADR-0001 says free tier = 50k (now 2M). Trust the code; when citing docs, verify first. | open |
| 7 | **BYOK is half-built**: keys are encrypted and stored, but `decryptApiKey` has no callers, so customer keys are not used at inference time. Marketing must not claim BYOK works end-to-end. | open |
| 8 | **Stream-failure refund asymmetry**: on LLM stream failure the route refunds `estimatedTokens` (`route.ts:690`), but a smart-routed complex message was net-debited `5 * estimatedTokens` by the router. A failed strong-model call under-refunds by 4x the base estimate. Small per-event impact; verify and fix through change control if touching this code. | open, candidate bug |
| 9 | **Uncertainty regex brittleness** (ADR-0003 accepted): 10-20% false positives, misses paraphrased deflection, breaks silently if models change phrasing. | accepted risk |
| 10 | **Free-variant quota counters are platform-global and best-effort** (`lib/ai/free-quota.ts`): slight over/under-counting under concurrency is accepted; failure mode is "pay for the paid variant", never an outage. | accepted risk |

## When NOT to use this skill

- **Making/committing/pushing a change, or classifying its risk** → `octively-change-control` (mandatory gates live there).
- **Debugging a live symptom** (CSP errors, deploy failures, webhook rejects, WSL weirdness) → `octively-debugging-playbook`.
- **"Did we already try X / why was Y reverted"** → `octively-failure-archaeology`.
- **RAG math, routing economics, credit accounting theory, payment protocol details** → `octively-domain-reference`.
- **Env var catalog, flag defaults, NEXT_PUBLIC build-arg pipeline** → `octively-config-and-flags`.
- **Setting up the dev machine or running builds on WSL** → `octively-build-and-env`; running/deploying/rollback → `octively-run-and-operate`.
- **UI tokens, per-surface design rules** → `octively-ui-surfaces` (and `DESIGN.md`).
- **Writing or extending tests** → `octively-validation-and-qa`.

## Provenance and maintenance

Authored 2026-07-06, revised 2026-07-07 (payment-protocol theory deduplicated in favor of `octively-domain-reference` §4; credit-allocation numbers now cited from `octively-unit-economics-toolkit`; ITN/HMAC/BYOK glossed on first use; description sharpened vs domain-reference) against the live repo (branch `master`). Every path, line anchor, constant, and claim above was read from the code on that date. Line anchors drift with edits; re-verify with these one-liners (run from the repo root, `cd "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas"` first):

| Volatile fact | Re-verify command |
|---|---|
| Four-surface rewrites + guards | `grep -n "startsWith('admin\.\|startsWith('app\.\|startsWith('affiliates\." proxy.ts` |
| Chat route length / pipeline anchors | `wc -l app/api/v1/chat/route.ts && grep -n "creditLib.debit\|routeMessage\|retrieveContext\|flagIfUnanswered" app/api/v1/chat/route.ts` |
| Model constants (classifier/strong/fallback) | `sed -n '1,4p' lib/ai/litellm.ts` |
| Default model env override | `grep -n "LITELLM_DEFAULT_MODEL" lib/ai/litellm.ts` |
| Credit allocations + free tier | `grep -n "FREE_TIER_CREDITS\|PLAN_CREDIT_ALLOCATIONS" -A 8 lib/credits/index.ts \| head -20` |
| Grace window (7200 s, once per month) | `grep -n "ex: 7200\|graceUsed" lib/credits/grace.ts` |
| PayFast fail-closed + amount check | `grep -n "PAYFAST_PASSPHRASE\|amountValid" lib/billing/payfast.ts` |
| LS HMAC timingSafeEqual | `grep -n "timingSafeEqual" lib/billing/lemon-squeezy.ts` |
| Admin email gate | `grep -n "PLATFORM_OWNER_EMAIL" lib/auth/session.ts` |
| Uncertainty regex | `cat lib/ai/uncertainty.ts` |
| Embedding provider + dimensions | `grep -n "EMBEDDING_PROVIDER\|DIMENSIONS = " lib/knowledge/embedder.ts && grep -n "dimensions: " lib/db/schema.ts` |
| TOP_K / threshold / skip-RAG | `grep -n "DEFAULT_TOP_K\|DEFAULT_THRESHOLD\|<= 15" lib/knowledge/retriever.ts` |
| Embed key format + 24 h rotation grace | `grep -n "pk_\|GRACE_MS" lib/bots/embed-key.ts` |
| embed.js serving path | `cat app/embed.js/route.ts && grep -n "build:embed" package.json` |
| BYOK still unconsumed? | `grep -rn "decryptApiKey" --include="*.ts" --include="*.tsx" app lib components` (only `lib/ai/byok.ts` = still open) |
| Rate limits (chat 30/min etc.) | `grep -n "slidingWindow" lib/ratelimit.ts` |
| Test file count | `ls tests/integration/` |
| Next.js version | `node -e "console.log(require('./package.json').dependencies.next)"` |
| Credit pack / plan prices | `sed -n '4,8p;51,55p' lib/billing/payfast.ts` |
