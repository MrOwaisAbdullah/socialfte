---
name: octively-config-and-flags
description: Load when adding, removing, renaming, or debugging any environment variable or feature flag in Octively — symptoms like "I set an env var and nothing changed in production", "which file reads this env var", "is this var required or optional", "what does KNOWLEDGE_BASE_ENABLED / SMART_ROUTING_FORCE_OFF / MIGRATIONS_ENABLED / EMBEDDING_PROVIDER actually do", "how do I add a NEXT_PUBLIC_* var end to end", "why is my NEXT_PUBLIC var blank/undefined in the deployed app", or "is this setting env-config, DB-config, or a hardcoded constant". Also load before editing `.env.example`, `.github/workflows/deploy.yml` build-args, `Dockerfile` ARG/ENV lines, or any `lib/billing`/`lib/limits` pricing constant.
---

# Octively Config and Flags

The full catalog of every configuration axis in Octively: env vars, feature flags, and DB/Redis-backed settings. Verified against the repo at `/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas` (path has spaces — quote it or `cd` first) as of 2026-07-07. This skill tells you WHAT each knob does and WHERE it's read. For WHY a design choice was made, see `octively-architecture-contract`; for the gate you must pass to change one, see `octively-change-control`.

---

## 1. Re-derive the ground truth (run this first, always)

Flags and env vars drift. Never trust this document's tables blindly — regenerate the two source lists and diff them against what's below:

```bash
cd "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas"

# A. every var declared in .env.example (should be ~58)
grep -o "^[A-Z_][A-Z_0-9]*=" .env.example | sed 's/=$//' | sort

# B. every var actually read by application code, with a usage count
grep -rh "process\.env\." lib app proxy.ts next.config.ts scripts components hooks embed \
  --include="*.ts" --include="*.tsx" --include="*.mjs" --include="*.js" 2>/dev/null \
  | grep -o "process\.env\.[A-Z_0-9]*" | sort | uniq -c | sort -rn

# C. vars in (A) not in (B) → declared but dead (or consumed via bracket access process.env[X])
# D. vars in (B) not in (A) → consumed but undocumented (drift, fix .env.example)
```

As of 2026-07-07: **58 vars in `.env.example`**, **~60 distinct `process.env.X` names in code** (counts differ because some vars are read via `process.env[VAR_NAME]` bracket syntax, e.g. `lib/ai/byok.ts`, which the grep in B does not catch — search for `LLM_KEY_ENCRYPTION_SECRET` by name if auditing that one).

---

## 2. Known drift (as of 2026-07-07) — do not silently "fix" without a change-control ticket

| Drift | Detail |
|---|---|
| **`FIRECRAWL_API_KEY` is dead** | Declared in `.env.example:134` and mentioned in `docs/vps-dokploy-setup.md:358`. The consumer was removed — `lib/knowledge/scraper.ts:1-4` states URL scraping was migrated from Firecrawl to Tavily (`TAVILY_API_KEY`). Grep confirms zero `process.env.FIRECRAWL_API_KEY` reads anywhere. Safe to delete from `.env.example` and the Dokploy panel once confirmed unused in any external script. |
| **`DEMO_DEV_PASSWORD` / `DEMO_CLIENT_PASSWORD` are dead** | Declared in `.env.example:184-185` with the comment "scripts/seed-demo.ts" — that script does not exist in `scripts/` (only `scripts/seed-demo-usage.ts` remains, which never reads either var). Zero code consumers. Likely leftover from a deleted seeding script. |
| **Embedding dimensionality: `.env.example` says 768, code says 1024** | `.env.example:126` comment: "Both output 768-dim vectors." The actual code (`lib/knowledge/embedder.ts:7-12`, `lib/db/schema.ts:280` `vector('embedding', { dimensions: 1024 })`) uses **1024-dim** (Jina `jina-embeddings-v3` and ONNX BGE-M3, migration 0014). CLAUDE.md's "Recent Changes" section also still says "Gemini text-embedding-004 (768-dim)" — also stale; Gemini was replaced by Jina/ONNX. Trust the code (1024-dim), not either doc. |
| **URL-resolution vars missing from `.env.example`** | `lib/url.ts` reads `APP_URL`, `PORTAL_URL`, `MARKETING_URL`, `NEXT_PUBLIC_MARKETING_URL` as non-public runtime overrides (rebuild-free alternatives to the `NEXT_PUBLIC_*` build-time versions), and `lib/queue/qstash.ts:9` reads `INTERNAL_APP_URL`. None of these five appear in `.env.example`. If you set any of them in Dokploy, document them there — `.env.example` is missing this whole "runtime URL override" mechanism. |
| **`TRANSFORMERS_CACHE` is commented out in `.env.example`** (line 126) but hardcoded directly in `Dockerfile:56` (`ENV ... TRANSFORMERS_CACHE=/app/.cache/transformers`) for the runner stage. Not a bug — the VPS never needs to override it — but don't expect setting it in Dokploy to do anything; the Docker image already pins it. |
| **`DOCKER_BUILD` and `NODE_ENV` are not in `.env.example`** | Both are system/build-tool flags, not secrets: `DOCKER_BUILD=1` is set only in `Dockerfile:29` to make `next.config.ts:69` emit `output: 'standalone'`; `NODE_ENV` is standard Node/Next.js and is set by the runtime, never by a human. Correct that they're absent — don't add them to `.env.example`. |

---

## 3. Env vars by subsystem

Legend for **Required tier**: `PROD-REQUIRED` = production breaks or silently fails closed without it; `OPTIONAL` = has a safe default/fallback; `EXPERIMENTAL/DEV-ONLY` = only used in dev tooling or non-default code paths.

### Database, auth, core URLs

| Var | Purpose | Consumer(s) | Unset behavior | Tier |
|---|---|---|---|---|
| `DATABASE_URL` | Neon Postgres connection string | `lib/db` (Drizzle client init) | App cannot start / every query throws | PROD-REQUIRED |
| `BETTER_AUTH_SECRET` | Session/cookie signing secret | `lib/auth/index.ts` | BetterAuth throws on init | PROD-REQUIRED |
| `BETTER_AUTH_URL` | Auth callback base URL; also a fallback in `lib/url.ts` URL resolution chain and used directly by `lib/db/queries/admin.ts:353` for a `forget-password` server-side fetch | `lib/auth/index.ts`, `lib/url.ts`, `lib/db/queries/admin.ts` | Falls back to `NEXT_PUBLIC_APP_URL` chain in `lib/url.ts`; the direct fetch in `admin.ts` breaks if genuinely unset | PROD-REQUIRED |
| `AFFILIATE_PORTAL_URL` | Base URL for affiliate magic-link emails | `lib/affiliates/auth.ts:50` | Falls back to hardcoded `https://affiliates.octively.com` | OPTIONAL |
| `NEXT_PUBLIC_APP_URL` | Admin dashboard base URL (build-time inlined) | `lib/url.ts` (`getAppBaseUrl`), several email templates | Falls back through `APP_URL` → `BETTER_AUTH_URL` → hardcoded `https://admin.octively.com` | PROD-REQUIRED (NEXT_PUBLIC) |
| `APP_URL` | Non-public runtime override of the above (no rebuild needed) | `lib/url.ts` | Falls through the chain above | OPTIONAL — **missing from `.env.example`**, see §2 |
| `NEXT_PUBLIC_PORTAL_URL` | Client portal base URL, for invite links | `lib/url.ts` (`getPortalBaseUrl`) | Derived from `NEXT_PUBLIC_APP_URL` by subdomain-swap (`admin.` → `app.`) | PROD-REQUIRED (NEXT_PUBLIC) |
| `PORTAL_URL` | Runtime override of the above | `lib/url.ts` | Same fallback chain | OPTIONAL — missing from `.env.example` |
| `NEXT_PUBLIC_MARKETING_URL` / `MARKETING_URL` | Marketing site base URL, used for cross-surface links from dashboard to `/tools` | `lib/url.ts` (`getMarketingBaseUrl`) | Derived from app URL by stripping `admin./app.` prefix; else hardcoded `https://octively.com` | OPTIONAL — missing from `.env.example` |
| `INTERNAL_APP_URL` | Server-side-only QStash callback target (bypasses NEXT_PUBLIC build-time baking) | `lib/queue/qstash.ts:9` | Falls back to `getAppBaseUrl()` | OPTIONAL — missing from `.env.example`; set in Dokploy to `https://admin.octively.com` per inline comment |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth social login | `lib/auth/index.ts:88-89` | Google sign-in button fails/hidden | OPTIONAL (only if Google login enabled) |

### LLM / routing

| Var | Purpose | Consumer(s) | Unset behavior | Tier |
|---|---|---|---|---|
| `OPENROUTER_API_KEY` | OpenRouter API auth for all chat completions | `lib/ai/litellm.ts` | Every chat request fails | PROD-REQUIRED |
| `LITELLM_DEFAULT_MODEL` | Global default model ID, no code change needed to switch | `lib/ai/litellm.ts` | **`.env.example` currently ships `deepseek/deepseek-v4-flash`** as the example value — cross-check against CLAUDE.md, which states the intended default is `meta-llama/llama-3.3-70b-instruct:free`. Verify which one is actually set in Dokploy before assuming either is live. | PROD-REQUIRED |
| `LLM_KEY_ENCRYPTION_SECRET` | AES-GCM key for BYOK (Bring Your Own Key — org-supplied LLM keys), read via bracket syntax `process.env[ENC_KEY_ENV]` | `lib/ai/byok.ts` | `encryptApiKey`/`decryptApiKey` throw `"LLM_KEY_ENCRYPTION_SECRET not set"` — BYOK feature breaks, but non-BYOK orgs are unaffected | OPTIONAL (required only if any org uses Settings → BYOK) |

### Feature flags (see §4 for full semantics)

| Var | Purpose | Tier |
|---|---|---|
| `KNOWLEDGE_BASE_ENABLED` | Global RAG kill switch | OPTIONAL kill switch, default ON |
| `SMART_ROUTING_FORCE_OFF` | Force every request onto the bot's default model | OPTIONAL kill switch, default OFF |
| `MIGRATIONS_ENABLED` | Enables the DDL-executing `/api/internal/migrate` endpoint | OPTIONAL, default OFF (fail-closed) |
| `EMBEDDING_PROVIDER` | Selects `jina` (serverless) vs `onnx` (VPS-only) | PROD-REQUIRED to be correct per environment |

### Credits / rate limiting

| Var | Purpose | Consumer(s) | Unset behavior | Tier |
|---|---|---|---|---|
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Redis REST client for credits ledger, rate limiting, and Redis-backed settings (e.g. `config:expensive_model:threshold`) | 17 call sites each across `lib/credits`, `lib/limits`, rate-limit middleware | App-wide credit checks and rate limits throw | PROD-REQUIRED |

### Email

| Var | Purpose | Consumer(s) | Unset behavior | Tier |
|---|---|---|---|---|
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Transactional email: welcome, password reset, invites, handoff, credit grace | `lib/email` (Resend client) | Transactional emails silently fail to send | PROD-REQUIRED |
| `BREVO_API_KEY` / `BREVO_FROM_EMAIL` | Usage warnings, onboarding nudges | `lib/email` (Brevo client) | Nudge emails fail | OPTIONAL (degrades gracefully — product still works) |
| `BREVO_DIGEST_EMAIL` | Weekly digest sender address | `lib/email` (Brevo digest) | Digest cron fails to send | OPTIONAL |
| `BREVO_TOOLS_LIST_ID` | Brevo contact list ID for `/tools` newsletter capture | `app/api/v1/tools/subscribe/route.ts:45` | Defaults to `'2'` via `?? '2'` | OPTIONAL |

### Billing — PKR (PayFast)

| Var | Purpose | Consumer(s) | Unset behavior | Tier |
|---|---|---|---|---|
| `PAYFAST_MERCHANT_ID` / `PAYFAST_MERCHANT_KEY` | PayFast merchant credentials | `lib/billing/payfast.ts` | Payment URL generation includes empty strings — checkout breaks | PROD-REQUIRED (if PKR billing live) |
| `PAYFAST_PASSPHRASE` | ITN (Instant Transaction Notification, PayFast's payment webhook) signature secret | `lib/billing/payfast.ts` (signature verification) | **Fails closed** — comment in `.env.example:96-98` confirms the ITN handler rejects ALL callbacks if unset, because the signature would otherwise be forgeable | PROD-REQUIRED |

### Billing — USD (Lemon Squeezy)

| Var | Purpose | Consumer(s) | Unset behavior | Tier |
|---|---|---|---|---|
| `LEMON_SQUEEZY_WEBHOOK_SECRET` | HMAC (hash-based message authentication code) webhook verification | `lib/billing/lemon-squeezy.ts` | Webhook verification fails, credits/plan changes don't apply | PROD-REQUIRED (if USD billing live) |
| `LEMON_SQUEEZY_STORE_ID` | Store scoping for checkout URLs | `lib/billing/lemon-squeezy.ts:61,100` | Falls back to `''` — checkout URL malformed | PROD-REQUIRED |
| `LS_VARIANT_STARTER` / `LS_VARIANT_GROWTH` / `LS_VARIANT_PRO` | One-time credit-pack variant IDs | `lib/billing/lemon-squeezy.ts:7`, `app/api/billing/ls-url/route.ts:14` | Falls back to the literal string `'starter'`/etc as the map key — breaks the reverse lookup | PROD-REQUIRED |
| `LS_VARIANT_PLAN_STARTER` / `LS_VARIANT_PLAN_PRO` / `LS_VARIANT_PLAN_AGENCY` | Monthly subscription plan variant IDs | `lib/billing/lemon-squeezy.ts` | Same as above | PROD-REQUIRED |

### Knowledge base / RAG (Phase 3)

| Var | Purpose | Consumer(s) | Unset behavior | Tier |
|---|---|---|---|---|
| `R2_ENDPOINT` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` | Cloudflare R2 object storage for uploaded documents | `lib/storage/r2.ts`, `app/api/v1/documents/upload/route.ts` | Document upload fails | PROD-REQUIRED (if KB feature used) |
| `QSTASH_TOKEN` / `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` | Background job queue (ingestion pipeline) client + webhook signature verification | `lib/queue/qstash.ts` | Publishing/verifying jobs throws (uses `!` non-null assertion — hard crash, not a soft fallback) | PROD-REQUIRED (if KB feature used) |
| `EMBEDDING_PROVIDER` | `jina` or `onnx` — see §4 | `lib/knowledge/embedder.ts:11` | Defaults to `'jina'` for any value other than exactly `'onnx'` | PROD-REQUIRED to match environment |
| `JINA_API_KEY` | Jina Embeddings v5/v3 API auth | `lib/knowledge/embedder.ts` (jina path) | Embedding calls fail when `EMBEDDING_PROVIDER=jina` | PROD-REQUIRED unless `EMBEDDING_PROVIDER=onnx` |
| `TRANSFORMERS_CACHE` | Local ONNX model cache directory (only used when `EMBEDDING_PROVIDER=onnx`) | `Dockerfile:56` runner stage | Hardcoded in the image already; see §2 drift note | DEV-ONLY / VPS-only, not user-settable in practice |
| `FIRECRAWL_API_KEY` | **Dead** — see §2 | none | n/a | DEAD |
| `TAVILY_API_KEY` | URL scraping (replaced Firecrawl) AND the public Website Readiness Checker tool (`/tools/website-chatbot-readiness-checker`) | `lib/knowledge/scraper.ts`, `lib/tools/tavily-extract.ts` | Scraping/readiness-checker throws `"TAVILY_API_KEY is not set"`; readiness checker returns "temporarily unavailable" per `.env.example:139` comment | PROD-REQUIRED (if KB URL-scrape or readiness checker used) |

### Analytics / marketing pixels

| Var | Purpose | Consumer(s) | Unset behavior | Tier |
|---|---|---|---|---|
| `NEXT_PUBLIC_GTM_ID` | Google Tag Manager container ID | marketing layout GTM script | GTM script omitted | OPTIONAL |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | GA4 measurement ID | marketing layout GA script | GA script omitted | OPTIONAL |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | WhatsApp contact number on billing upgrade buttons | 5 call sites in billing/upgrade UI | Buttons link to a malformed `wa.me/undefined`-style URL — verify a fallback exists before assuming this is safe unset | PROD-REQUIRED (NEXT_PUBLIC) |
| `NEXT_PUBLIC_DEMO_VIDEO_URL` | Hero "Watch demo" video link | marketing hero component | Falls back to the published link hardcoded in code per `.env.example:79` comment | OPTIONAL |

### Sanity CMS (blog)

| Var | Purpose | Consumer(s) | Unset behavior | Tier |
|---|---|---|---|---|
| `NEXT_PUBLIC_SANITY_PROJECT_ID` / `NEXT_PUBLIC_SANITY_DATASET` / `NEXT_PUBLIC_SANITY_API_VERSION` | Sanity client config | `sanity/env.ts:5-7` | Each falls back to a literal default (`'2024-01-01'`, `'production'`, `''`) — an empty `projectId` means the Sanity client silently fails to fetch | PROD-REQUIRED (NEXT_PUBLIC) if blog is served |
| `SANITY_API_WRITE_TOKEN` | Write access for the blog seed script only | `scripts/seed-blog.mjs`, `scripts/push-blog-drafts.mjs` | Seed scripts fail; does not affect the running app | DEV-ONLY |
| `SANITY_REVALIDATE_SECRET` | Webhook secret for on-demand ISR revalidation | `app/api/revalidate/route.ts:12` | Revalidation webhook rejects all requests | PROD-REQUIRED (if blog uses on-demand revalidation) |

### Cron / internal endpoints

| Var | Purpose | Consumer(s) | Unset behavior | Tier |
|---|---|---|---|---|
| `CRON_SECRET` | Bearer-token auth for `/api/cron/monthly-reset`, `/api/cron/weekly-digest`, and (double-gated) `/api/internal/migrate` | `app/api/cron/monthly-reset/route.ts`, `app/api/cron/weekly-digest/route.ts`, `app/api/internal/migrate/route.ts` via `verifyBearer()` in `lib/security.ts` | Every request with an `Authorization` header fails `verifyBearer` (compares against `undefined`) — endpoints become effectively unreachable, not open | PROD-REQUIRED |
| `MIGRATIONS_ENABLED` | Kill switch — see §4 | `app/api/internal/migrate/route.ts:11` | Endpoint returns 404 regardless of the bearer token | OPTIONAL, default OFF |
| `PLATFORM_OWNER_EMAIL` | Grants `/dashboard/admin/platform` access to a single owner account | `app/api/dashboard/is-admin/route.ts:10`, `lib/auth/session.ts:48` | Nobody can access platform admin — stays server-side only, never bundled | PROD-REQUIRED (for platform admin access) |

### Webhooks (outbound)

| Var | Purpose | Consumer(s) | Unset behavior | Tier |
|---|---|---|---|---|
| `WEBHOOK_SIGNING_SECRET` | HMAC-SHA256 signs every outbound per-bot lead webhook | `lib/webhooks/outbound.ts:77` | Logs `"WEBHOOK_SIGNING_SECRET not configured — skipping delivery"` and skips delivery entirely (soft-fail, not a crash) | OPTIONAL (only needed if any bot has `webhookUrl` set) |

### Demo seed data

| Var | Purpose | Consumer(s) | Unset behavior | Tier |
|---|---|---|---|---|
| `DEMO_DEV_PASSWORD` / `DEMO_CLIENT_PASSWORD` | **Dead** — see §2 | none found | n/a | DEAD |

---

## 4. Feature flags — exact semantics

All four read `process.env.X` directly at call time (not cached at boot), so a Dokploy env change takes effect on next request after container restart — no rebuild needed (none of these four are `NEXT_PUBLIC_*`).

### `KNOWLEDGE_BASE_ENABLED`
- **Checked at:** `lib/knowledge/retriever.ts:31` — `if (process.env.KNOWLEDGE_BASE_ENABLED === 'false') return []`
- **On/off values:** only the exact string `'false'` disables it. Unset, `'true'`, or any other string leaves RAG retrieval **on**.
- **Blast radius:** global, all bots, all orgs. When off, `retrieveContext()` returns an empty chunk array — every bot silently falls back to prompt-only (system prompt + FAQs), no error surfaced to the end user.
- **Use case:** emergency kill switch if pgvector queries are degrading chat latency platform-wide.

### `SMART_ROUTING_FORCE_OFF`
- **Checked at:** `lib/ai/router.ts:94` — `if (process.env.SMART_ROUTING_FORCE_OFF === 'true')`
- **On/off values:** only the exact string `'true'` forces it off. Unset or anything else leaves per-bot smart routing behavior intact (each bot's `smartRoutingEnabled` DB column still governs whether routing runs at all).
- **Blast radius:** global override that suppresses the classifier call and routes every request straight to `params.botDefaultModel`, skipping the light/strong model split entirely. Does not touch the per-bot `smartRoutingEnabled` DB flag — it's a platform-wide emergency override layered on top.
- **Use case:** the classifier model (OpenRouter) is down or misbehaving and you need to force deterministic default-model routing everywhere without touching every bot's settings.

### `MIGRATIONS_ENABLED`
- **Checked at:** `app/api/internal/migrate/route.ts:11` (`migrationsEnabled()` helper), gates both `GET` (schema diagnosis) and `POST` (DDL execution) handlers.
- **On/off values:** only the exact string `'true'` enables it. Unset, `'false'`, or anything else → both handlers return `404` **before even checking `CRON_SECRET`** — this is a fail-closed default, not fail-open.
- **Blast radius:** this endpoint can execute arbitrary DDL against production Postgres. Double-gated by design (flag AND bearer token) — comment at `app/api/internal/migrate/route.ts:8-9` states "Even a leaked CRON_SECRET can't reach it while disabled."
- **Operational discipline:** set `MIGRATIONS_ENABLED=true` in Dokploy, run the one-shot migration, then **unset it again immediately**. Never leave it on.

### `EMBEDDING_PROVIDER`
- **Checked at:** `lib/knowledge/embedder.ts:11` — `process.env.EMBEDDING_PROVIDER === 'onnx' ? 'onnx' : 'jina'`
- **On/off values:** exact string `'onnx'` selects the local ONNX BGE-M3 model; anything else (including unset) selects Jina's hosted API.
- **Blast radius:** this is not a toggle you can flip freely — `'onnx'` requires a long-running process (the VPS/Docker host) because it loads a ~570MB quantized model into memory; it **cannot run on a serverless function**. The inline comment is explicit: "Set `EMBEDDING_PROVIDER=onnx` ONLY on the VPS/Docker host." Both providers must output the same 1024 dimensions (`lib/db/schema.ts` `document_chunks.embedding` is a fixed `vector(1024)` column) — switching providers on an existing dataset without re-embedding would corrupt similarity search silently (no schema-level guard against dimension mismatch across providers, only a runtime assertion in `embedder.ts:55` that throws if a single call returns the wrong length).
- **Current production value:** the `Dockerfile:53` runner stage hardcodes `ENV ... EMBEDDING_PROVIDER=onnx` — so on the VPS this is always `onnx` regardless of Dokploy panel settings (a Dockerfile `ENV` wins over anything not passed as `-e` at container run time only if Dokploy doesn't override it; verify in the Dokploy panel which one wins if you need to change this).

---

## 5. The `NEXT_PUBLIC_*` build-time trap (read this before touching any public var)

**The core trap:** `NEXT_PUBLIC_*` vars are inlined into the JS bundle at `next build` time (inside the Docker `builder` stage), not read at container runtime. Setting them in the Dokploy panel does **nothing** — Dokploy env vars only affect the running container, and by the time the container runs, the value is already baked into static JS.

**The real pipeline (`.github/workflows/deploy.yml`):**

```
GitHub Actions secret  →  build-args in deploy.yml  →  Dockerfile ARG  →  Dockerfile ENV  →  npm run build  →  baked into .next/static JS
```

Confirmed current `NEXT_PUBLIC_*` build-args wired in `deploy.yml` (9 vars) and mirrored as `ARG`/`ENV` pairs in `Dockerfile:33-49`:

```
NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_PORTAL_URL, NEXT_PUBLIC_SANITY_PROJECT_ID,
NEXT_PUBLIC_SANITY_DATASET, NEXT_PUBLIC_SANITY_API_VERSION, NEXT_PUBLIC_WHATSAPP_NUMBER,
NEXT_PUBLIC_DEMO_VIDEO_URL, NEXT_PUBLIC_GA_MEASUREMENT_ID, NEXT_PUBLIC_GTM_ID
```

This count drifts easily — re-derive it before quoting a number in any other doc:

```bash
grep -c "^\s*NEXT_PUBLIC_" "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas/.github/workflows/deploy.yml"
```

**The second trap layered on top:** BuildKit's layer cache does NOT automatically invalidate when only a build-arg value changes if the layer's other inputs are unchanged — so changing a GitHub secret alone can deploy a container that still has the OLD baked value, silently. `deploy.yml`'s `docker/build-push-action@v6` step sets `no-cache-filters: builder` specifically to force the `builder` stage to always re-run (see the inline comment at `deploy.yml` and the historical incident commits `bb6b66c`/`ac4e5d6` referenced in the authoring brief). **Never remove `no-cache-filters: builder`** without understanding this.

### Checklist: adding a new env var end-to-end

**Case A — server-only (never read by browser JS):**
1. Add to `.env.local` for local dev.
2. Document in `.env.example` with a comment: what it is, where to get it, what breaks if unset.
3. Add the `process.env.YOUR_VAR` read in the consuming `/lib` file.
4. Add the same key/value in the Dokploy panel (Application → Environment).
5. Redeploy (`git push origin master` triggers the pipeline) — Dokploy picks up the new runtime env on container restart, no Docker rebuild args needed.

**Case B — `NEXT_PUBLIC_*` (read by browser JS, must be in the bundle):**
1. Add to `.env.local` for local dev, and to `.env.example` (documented).
2. Add the `process.env.NEXT_PUBLIC_YOUR_VAR` read in the consuming component/file.
3. Add a new GitHub Actions secret: repo → Settings → Secrets and variables → Actions → New repository secret, named exactly `NEXT_PUBLIC_YOUR_VAR`.
4. Add it to the `build-args:` block in `.github/workflows/deploy.yml`.
5. Add a matching `ARG NEXT_PUBLIC_YOUR_VAR` and `ENV NEXT_PUBLIC_YOUR_VAR=$NEXT_PUBLIC_YOUR_VAR` pair in the `builder` stage of `Dockerfile` (verify the exact lines — currently `Dockerfile:33-49`).
6. Confirm `no-cache-filters: builder` is still present in `deploy.yml` (see trap above) — it is what makes a build-arg change actually take effect.
7. Push to `master` and confirm the new value renders in the deployed bundle (view page source or `curl` the JS chunk) — do not trust "the deploy succeeded" as proof the value landed.

**Do NOT** try to set a `NEXT_PUBLIC_*` var only in the Dokploy panel expecting it to work — this is the single most common config mistake in this repo per the failure-archaeology history (see `octively-failure-archaeology` for the exact incident writeups, e.g. "NEXT_PUBLIC var empty / hostless http:/// link").

---

## 6. DB-config vs Redis-config vs code constants (not env vars — don't confuse these)

Not everything configurable lives in an env var. Three other axes exist:

### Per-org / per-bot settings (Postgres, `lib/db/schema.ts`)

| Table.column | Governs | Who edits it |
|---|---|---|
| `organizations.plan` | Which `PLAN_LIMITS` tier applies (free/starter/pro/agency/enterprise) | Set by billing webhook on successful payment |
| `organizations.creditCap` | Platform-admin override cap on an org's credits (`null` = unlimited, draws from plan allocation) | Platform admin only, via `/dashboard/admin` |
| `organizations.llmApiKey` | BYOK — AES-GCM encrypted org-level LLM key (`iv:ciphertext` hex), decrypted via `lib/ai/byok.ts` using `LLM_KEY_ENCRYPTION_SECRET` | Org owner, via Settings → BYOK |
| `bots.model` | Default model for a bot | Bot owner, per bot |
| `bots.smartRoutingEnabled`, `routingLightModel`, `routingStrongModel` | Per-bot smart-routing config (nulls fall back to bot default / global `STRONG_MODEL` constant) | Bot owner |
| `bots.monthlyConvLimit`, `monthlyLeadLimit`, `monthlyCreditBudget` | Per-bot resource caps layered under the org-level plan pool (`null` = no bot-level cap) | Bot owner |
| `bots.allowedModels` (jsonb array) | Restricts which model IDs a bot may use (`null` = all models the org plan permits) | Bot owner or platform admin |
| `bots.widgetConfig` / `bots.portalConfig` (jsonb) | Widget appearance + portal display settings | Bot owner, via dashboard forms |
| `bots.webhookUrl` / `slackWebhookUrl` | Outbound lead notification targets (`null` = disabled) | Bot owner |

### Platform-wide settings (Postgres, singleton row)

| Table | Purpose |
|---|---|
| `platformConfig` (`id` always `'default'`) | `systemPrompt` (platform-wide prompt prefix override), `modelPricePriority` (jsonb map of `{ [modelId]: 'manual' | 'openrouter-api' }` — which price source wins per model) | Platform admin, via `/dashboard/admin/platform` |
| `modelPrices` | Append-only price history per model (USD/1M tokens, `source: 'manual' | 'openrouter-api'`) — feeds the credit-cost math | Synced from OpenRouter or manually entered by platform admin |

### Redis-backed runtime settings (not env vars, not DB rows)

| Redis key | Purpose | Set/read at |
|---|---|---|
| `config:expensive_model:threshold` | Admin-configurable USD/1M-token threshold above which the dashboard shows an "expensive model" confirmation dialog before saving a bot's model choice. Defaults to the average combined price across all models when no override is set. | `lib/db/queries/admin.ts:608,625,816,818` — set via `ExpensiveThresholdForm` on `/dashboard/admin/models` (introduced commit `58d71e2`, verified present) |

This is the pattern to follow for any new "admin-tunable number that shouldn't require a redeploy": a Redis key with a documented default, read at call time, editable from an admin UI — NOT a new env var.

### Hardcoded code constants (require a code change + build + deploy to alter)

| Constant | File | Values (as of 2026-07-07) |
|---|---|---|
| `PLAN_LIMITS` | `lib/limits/index.ts:4-11` | Per-plan bots/conversations/leads/docs/crawlPages/storageMb/catalogProducts caps for free/starter/pro/agency/enterprise |
| `PLAN_PRICES_PKR` | `lib/billing/payfast.ts:51-55` | `starter: 2500, pro: 7500, agency: 20000` (Rs, PayFast) |
| `CREDIT_PACKS` | `lib/billing/payfast.ts:4-8` | `starter`/`growth`/`pro` one-time token packs, each with `tokens`, `pkr`, `usd` |
| `STRONG_MODEL`, `CLASSIFIER_MODEL` | `lib/ai/router.ts` | Fallback strong-tier model and the classifier model used for smart routing when a bot doesn't override them |

**Owner-approval rule (from CLAUDE.md/authoring brief):** pricing numbers and plan limits are owner-only decisions — never change `PLAN_PRICES_PKR`, `CREDIT_PACKS`, or `PLAN_LIMITS` without explicit owner sign-off, regardless of how small the change looks.

---

## 7. When NOT to use this skill

- Deploying the change (Docker build, GHCR push, Dokploy trigger, DNS/rollback) → `octively-run-and-operate`.
- WSL-specific dev environment setup (npm installs, Neon CLI IPv6 fix) → `octively-build-and-env`.
- Whether a config change requires a spec/ADR, or is gated by an owner-approval rule → `octively-change-control`.
- Debugging a symptom like "I changed an env var and nothing happened in prod" step by step → `octively-debugging-playbook` (this skill tells you WHAT the var does and WHERE; that skill tells you HOW to triage a live symptom).
- The domain theory behind WHY credits are debit-first, WHY RAG uses HNSW, etc. → `octively-domain-reference`.
- Historical incidents that already happened around a specific var (e.g. the NEXT_PUBLIC blank-value incident) → `octively-failure-archaeology` for the full story with commit evidence.

---

## 8. Provenance and maintenance

Date-stamped: 2026-07-07, revised 2026-07-07 (glossed ITN/HMAC/BYOK acronyms on first use). All facts above were derived by reading `.env.example`, grepping `process.env.` usage across `lib/ app/ proxy.ts next.config.ts scripts/ components/ hooks/ embed/`, reading `.github/workflows/deploy.yml`, `Dockerfile`, `lib/db/schema.ts`, `lib/billing/*.ts`, `lib/limits/index.ts`, and `lib/ai/router.ts` / `lib/knowledge/*.ts` directly — not from memory.

Re-verification commands (run before trusting any table above — flags and vars drift fast):

```bash
cd "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas"

# Full env var re-derivation (see §1) — the single most important re-check
grep -o "^[A-Z_][A-Z_0-9]*=" .env.example | wc -l
grep -rh "process\.env\." lib app proxy.ts next.config.ts scripts components hooks embed \
  --include="*.ts" --include="*.tsx" --include="*.mjs" --include="*.js" 2>/dev/null \
  | grep -o "process\.env\.[A-Z_0-9]*" | sort | uniq -c | sort -rn

# NEXT_PUBLIC build-arg count in the deploy pipeline
grep -c "^\s*NEXT_PUBLIC_" .github/workflows/deploy.yml
grep -n "^ARG NEXT_PUBLIC\|^ENV NEXT_PUBLIC" Dockerfile

# Feature flag consumer lines (confirm exact string comparisons haven't changed)
grep -n "KNOWLEDGE_BASE_ENABLED\|SMART_ROUTING_FORCE_OFF\|MIGRATIONS_ENABLED\|EMBEDDING_PROVIDER" \
  lib/knowledge/retriever.ts lib/ai/router.ts app/api/internal/migrate/route.ts lib/knowledge/embedder.ts

# Embedding dimensions (confirm still 1024, and .env.example still wrongly says 768)
grep -n "dimensions" lib/db/schema.ts | grep -i embedding
grep -n "768-dim\|1024-dim" .env.example lib/knowledge/embedder.ts

# Plan pricing / limits constants (owner-approval-gated — confirm no silent drift)
grep -n "PLAN_PRICES_PKR\|CREDIT_PACKS" -A6 lib/billing/payfast.ts
grep -n "PLAN_LIMITS" -A8 lib/limits/index.ts

# Redis-backed admin settings
grep -rn "config:expensive_model:threshold" lib/db/queries/admin.ts
```

If any of these commands produce a different count or different consumer file than stated above, the drift table in §2 and the subsystem tables in §3 are stale — update this file before relying on it further.
