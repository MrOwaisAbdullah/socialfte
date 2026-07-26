/**
 * routing-health.ts
 *
 * Read-only deep dive into lib/ai/router.ts's decisions: classification mix,
 * fallback rate, chosen-model breakdown, classifier latency. Makes NO writes.
 *
 * Part of the octively-diagnostics-and-tooling skill. Ground truth:
 * lib/db/schema.ts (routingDecisions table) and lib/ai/router.ts (RoutingClass
 * union + fallback semantics), verified 2026-07-06/07.
 *
 * Usage (always from the repo root, quoting the path since it has spaces):
 *   cd "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas"
 *   NODE_OPTIONS="--dns-result-order=ipv4first --import ./scripts/wsl-net-fix.mjs" \
 *     npx tsx .claude/skills/octively-diagnostics-and-tooling/scripts/routing-health.ts [--days 30] [--bot <botId>]
 *
 * Env: requires DATABASE_URL, loaded explicitly from .env.local (see health-summary.ts
 * header comment for why the bare `dotenv/config` shortcut does not work in this repo).
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  if (idx === -1) return undefined
  return process.argv[idx + 1]
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[diagnostics] DATABASE_URL not set — see .env.local')
    process.exit(1)
  }

  const days = Number(parseArg('--days')) || 30
  const botId = parseArg('--bot')
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const { db, schema } = await import('../../../../lib/db')
  const { and, eq, gte, sql, count, desc } = await import('drizzle-orm')

  console.log('─────────────────────────────────────────────────────────')
  console.log(`Routing health — last ${days} day(s)${botId ? ` — bot ${botId}` : ' — all bots'}`)
  console.log('─────────────────────────────────────────────────────────\n')

  const baseWhere = botId
    ? and(gte(schema.routingDecisions.createdAt, since), eq(schema.routingDecisions.botId, botId))
    : gte(schema.routingDecisions.createdAt, since)

  // ── Classification mix ───────────────────────────────────────────────────
  const classRows = await db
    .select({
      classification: schema.routingDecisions.classification,
      total: count(),
      fallbacks: sql<number>`count(*) FILTER (WHERE ${schema.routingDecisions.fallbackUsed} = true)::int`,
      avgClassifierMs: sql<number>`ROUND(AVG(${schema.routingDecisions.classifierLatencyMs}))::int`,
    })
    .from(schema.routingDecisions)
    .where(baseWhere)
    .groupBy(schema.routingDecisions.classification)
    .orderBy(desc(count()))

  const totalDecisions = classRows.reduce((s, r) => s + Number(r.total), 0)

  console.log(`CLASSIFICATION MIX (${totalDecisions} total decisions)`)
  if (totalDecisions === 0) {
    console.log('  No routing decisions found in this window/scope.')
    console.log('  Possible causes: smart routing disabled for the bot(s), SMART_ROUTING_FORCE_OFF=true, or no chat traffic.')
  } else {
    for (const r of classRows) {
      const pct = ((Number(r.total) / totalDecisions) * 100).toFixed(1)
      console.log(`  ${r.classification.padEnd(10)} ${String(r.total).padStart(6)}  (${pct}%)  fallback=${r.fallbacks}  avg classifier latency=${r.avgClassifierMs}ms`)
    }
  }

  console.log()

  // ── Chosen model breakdown ──────────────────────────────────────────────
  const modelRows = await db
    .select({
      model: schema.routingDecisions.chosenModel,
      total: count(),
      avgCreditCost: sql<number>`ROUND(AVG(${schema.routingDecisions.creditCost}))::int`,
    })
    .from(schema.routingDecisions)
    .where(baseWhere)
    .groupBy(schema.routingDecisions.chosenModel)
    .orderBy(desc(count()))
    .limit(15)

  console.log('CHOSEN MODEL BREAKDOWN (top 15)')
  if (modelRows.length === 0) {
    console.log('  No rows.')
  } else {
    for (const r of modelRows) {
      console.log(`  ${(r.model ?? 'unknown').padEnd(45)} ${String(r.total).padStart(6)} decisions  avg credit cost=${r.avgCreditCost}`)
    }
  }

  console.log('\n  Interpretation: fallback_used=true means a "complex"-classified message could not\n  afford the 5x strong-model credit estimate and used the bot default model instead.\n  It is unrelated to the separate OpenRouter :free-variant fallback in lib/ai/litellm.ts,\n  which is not logged to this table at all.')

  console.log('\n─────────────────────────────────────────────────────────')
  console.log('Done. No rows were modified.')
  console.log('─────────────────────────────────────────────────────────')
}

main().catch((err) => {
  console.error('[diagnostics] routing-health failed:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
