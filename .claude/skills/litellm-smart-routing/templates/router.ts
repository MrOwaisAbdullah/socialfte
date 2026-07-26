// Drop-in smart router. Adapt model constants + credit lib imports to your project.
// Pattern: classify query complexity with a cheap timeout-guarded model (fail-open),
// route to a light or strong model, return decision metadata for logging.

import { CLASSIFIER_MODEL, STRONG_MODEL } from '@/lib/ai/litellm'

export type RoutingClass = 'greeting' | 'faq' | 'knowledge' | 'complex'

export interface RouteResult {
  modelToUse: string
  fallbackUsed: boolean
  classification: RoutingClass
  classifierLatencyMs: number
  classifierModel: string
}

const CLASSIFIER_PROMPT = `Classify the user message into exactly one of:
- "greeting": social pleasantries, very short small-talk
- "faq": short factual question with a single right answer
- "knowledge": needs document context to answer well
- "complex": multi-step reasoning, comparisons, calculations, or coding
Respond with JSON ONLY: {"label": "<one of the four>"}`

const CLASSIFIER_TIMEOUT_MS = 1500

async function classify(text: string): Promise<{ label: RoutingClass; latencyMs: number; fallback: boolean }> {
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS)
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: CLASSIFIER_MODEL,
        messages: [
          { role: 'system', content: CLASSIFIER_PROMPT },
          { role: 'user', content: text },
        ],
        max_tokens: 20,
      }),
      signal: controller.signal,
    })
    if (!res.ok) return { label: 'knowledge', latencyMs: Date.now() - started, fallback: true }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '') as { label?: string }
    const label = parsed.label
    if (label === 'greeting' || label === 'faq' || label === 'knowledge' || label === 'complex') {
      return { label, latencyMs: Date.now() - started, fallback: false }
    }
    return { label: 'knowledge', latencyMs: Date.now() - started, fallback: true } // unknown → safe default
  } catch {
    // timeout / network / bad JSON — FAIL OPEN to a model that answers correctly, never throw
    return { label: 'knowledge', latencyMs: Date.now() - started, fallback: true }
  } finally {
    clearTimeout(timer)
  }
}

export async function route(
  text: string,
  lightModel: string,        // per-bot default (bots.model / routingLightModel)
  strongModel = STRONG_MODEL,
): Promise<RouteResult> {
  const { label, latencyMs, fallback } = await classify(text)
  const modelToUse = label === 'complex' ? strongModel : lightModel
  return {
    modelToUse,
    fallbackUsed: fallback,
    classification: label,
    classifierLatencyMs: latencyMs,
    classifierModel: CLASSIFIER_MODEL,
  }
}

// Caller responsibilities (kept OUT of the router so it stays pure):
//  1. Debit estimated credits BEFORE the model call; refund on failure (debit-first).
//  2. After the answer, insert a routing_decisions row (non-blocking, .catch(() => {})):
//     { messageId, botId, classification, classifierModel, classifierLatencyMs, chosenModel, fallbackUsed }.
