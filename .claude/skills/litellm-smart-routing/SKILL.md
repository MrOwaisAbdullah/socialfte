---
name: litellm-smart-routing
description: |
  Build per-request smart model routing for an LLM app: classify each user message by
  complexity with a cheap fast model, then route to a light or strong model to cut cost
  without hurting quality, logging every routing decision. This skill should be used when
  implementing model selection/routing, a query-complexity classifier, LiteLLM/OpenRouter
  multi-model setup, or cost-optimized inference with credit accounting.
---

# LiteLLM Smart Model Routing

Route cheap queries to a cheap model and hard queries to a strong model, decided per message
by a fast classifier. The goal: 60–80% of traffic on the light model, strong model only when
it changes the answer.

## Before Implementation

| Source | Gather |
|--------|--------|
| Codebase | `lib/ai/litellm.ts` (model constants, the call wrapper), `lib/ai/router.ts`, the `routing_decisions` table, the credits lib |
| Conversation | Which models are light vs strong? Is routing per-bot opt-in? What's the latency budget? |
| References | Provider docs via Context7 (LiteLLM / OpenRouter) for model IDs + pricing |

## Clarifications

**Required (ask before building):**
1. Which model is the light default and which is the strong fallback?
2. Is routing per-bot opt-in, or global?

**Optional (infer if unstated):**
3. Latency budget for the classifier (default ~1.5s timeout)?
4. Should greetings skip RAG too (recommended yes)?

If the user doesn't answer, default to: per-bot opt-in, 1.5s classifier timeout, greetings skip RAG, `complex`→strong / everything-else→light.

## Documentation & sources

| Resource | URL | Use for |
|----------|-----|---------|
| OpenRouter API | https://openrouter.ai/docs | Model IDs, request shape, pricing |
| LiteLLM | https://docs.litellm.ai | Provider abstraction, routing config |
| Context7 (MCP) | resolve-library-id → query-docs | Current LiteLLM/provider API |

Fetch current model IDs + pricing before hardcoding — they change often.

## Architecture

```
user message → classify(message) → pick model → debit credits → call model → log decision
                    ↑ cheap, fast, timeout-guarded, fail-open
```

Three model roles (constants in one place, e.g. `lib/ai/litellm.ts`):
- **CLASSIFIER_MODEL** — tiny/fast, JSON-only, ~20 max tokens
- **light model** — the per-bot default (handles greetings/FAQs/most knowledge)
- **STRONG_MODEL** — for multi-step reasoning / comparisons / code

## The classifier (fail-open is non-negotiable)

```ts
const CLASSIFIER_PROMPT = `Classify the user message into exactly one of:
- "greeting": social pleasantries, very short small-talk
- "faq": short factual question with a single right answer
- "knowledge": needs document context to answer well
- "complex": multi-step reasoning, comparisons, calculations, or coding
Respond with JSON ONLY: {"label": "<one of the four>"}`

const CLASSIFIER_TIMEOUT_MS = 1500
// AbortController + setTimeout; on ANY failure (timeout, non-200, bad JSON, unknown label)
// return a SAFE DEFAULT ('knowledge'), never throw. A misroute is cheaper than a crash.
```

Rules:
- **Timeout-guard** the classifier with `AbortController` (~1.5s). If it's slow, you've lost the cost savings anyway — fall back.
- **Fail open** to the model that gives a correct answer (`knowledge` → light/strong per your map), never to an error.
- Keep `max_tokens` tiny (~20) and force JSON to keep classifier cost negligible.

## Routing map

```
greeting → light model (skip RAG too)
faq      → light model
knowledge→ light model (with RAG context)
complex  → STRONG_MODEL
```

Make routing **per-bot opt-in** (`bots.smartRoutingEnabled`) with overridable light/strong model columns (`routingLightModel`, `routingStrongModel`, null = fall back to bot.model / global STRONG_MODEL).

## Credit accounting: debit-first

Debit the estimated cost BEFORE the model call; refund on failure. Never debit after. Estimate
strong-model cost higher (e.g. base estimate 500) so you never over-serve a depleted balance.

## Log every decision

Insert a `routing_decisions` row (messageId, botId, classification, classifierModel,
classifierLatencyMs, chosenModel, fallbackUsed, creditCost) — **non-blocking** (`.catch(() => {})`),
so analytics never breaks chat. This data tells you whether routing is actually saving money.

## Routing vs cascading (know both)

Two paradigms — this skill implements **routing**; cascading is the stronger upgrade.

| | Routing (this skill) | Cascading |
|--|----------------------|-----------|
| When | Classify BEFORE generating, send to one model | Answer with the cheap model FIRST, escalate only if a confidence/verification check fails |
| Cost | Pays for one model | Pays for cheap always + strong on the long tail only |
| Catch | Classifier can mis-route | Adds latency when it escalates; needs confidence calibration |

The cascade is the pattern that can genuinely beat a single frontier model on **both** cost and
quality, because it spends strong-model tokens only on requests that provably needed them. In
practice teams **layer**: a cheap rule pass for obvious cases (your `shouldSkipRag`/greeting check
is exactly this), a classifier for the ambiguous middle, and a cascade for the long tail. Published
routers (e.g. RouteLLM, ICLR 2025) report ~85% cost cut at ~95% of frontier quality with only ~14%
of queries reaching the strong model.

**Router overhead is small and worth it:** rule match <1 ms, embedding ~5 ms, an LLM/ML classifier
~50–100 ms — single-digit % of a 500–2000 ms generation. If you already have an uncertainty signal
(e.g. a handoff/"I don't know" detector), reuse it as the cascade's escalation trigger.

## Anti-patterns

- ❌ Classifier that can throw / has no timeout → one slow call stalls every chat.
- ❌ Failing closed (error) when the classifier fails → outage instead of a slightly-pricier answer.
- ❌ Routing everything through the strong model "to be safe" → defeats the purpose.
- ❌ Debiting credits after the call → can't refund cleanly on failure.
- ❌ Awaiting the routing-decision log in the hot path → adds latency; fire-and-forget.
- ❌ Hardcoding model IDs across files → centralize in one module; switch via env.

## Validation
- Greetings/FAQs measurably hit the light model; complex prompts hit the strong model.
- Classifier timeout path returns a usable answer (kill the classifier endpoint and confirm).
- `routing_decisions` rows populate; a dashboard can show light/strong split + cost.
