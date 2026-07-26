/**
 * health-summary.ts
 *
 * Read-only combined health snapshot for Octively: routing fallback rate,
 * unanswered-message rate, credit refund rate, and orgs approaching their
 * plan's conversation limit. Prints a plain-text report. Makes NO writes.
 *
 * Part of the octively-diagnostics-and-tooling skill. Ground truth for every
 * table/column name is lib/db/schema.ts (verified 2026-07-06/07).
 *
 * Usage (always from the repo root, quoting the path since it has spaces):
 *   cd "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas"
 *   NODE_OPTIONS="--dns-result-order=ipv4first --import ./scripts/wsl-net-fix.mjs" \
 *     npx tsx .claude/skills/octively-diagnostics-and-tooling/scripts/health-summary.ts [--days 7]
 *
 * Env: requires DATABASE_URL. This script loads .env.local explicitly (NOT the
 * bare `dotenv/config` shortcut — verified that shortcut only reads a file
 * literally named `.env`, which does not exist in this repo).
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })

function parseDays(): number {
  const idx = process.argv.indexOf('--days')
  if (idx === -1) return 7
  const val = Number(process.argv[idx + 1])
  return Number.isFinite(val) && val > 0 ? val : 7
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[diagnostics] DATABASE_URL not set — see .env.local')
    process.exit(1)
  }

  const days = parseDays()
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  // Import after env is loaded so lib/db's lazy neon() singleton sees DATABASE_URL.
  const { db, schema } = await import('../../../../lib/db')
  const { and, eq, gte, sql, count } = await import('drizzle-orm')

  console.log('─────────────────────────────────────────────────────────')
  console.log(`Octively health summary — last ${days} day(s)`)
  console.log(`Window start: ${since.toISOString()}`)
  console.log('─────────────────────────────────────────────────────────\n')

  // ── 1. Routing: classification mix + fallback rate ─────────────────────────
  try {
    const rows = await db
      .select({
        classification: schema.routingDecisions.classification,
        total: count(),
        fallbacks: sql<number>`count(*) FILTER (WHERE ${schema.routingDecisions.fallbackUsed} = true)::int`,
      })
      .from(schema.routingDecisions)
      .where(gte(schema.routingDecisions.createdAt, since))
      .groupBy(schema.routingDecisions.classification)

    const totalDecisions = rows.reduce((sum, r) => sum + Number(r.total), 0)
    const totalFallbacks = rows.reduce((sum, r) => sum + Number(r.fallbacks), 0)
    const complexRow = rows.find((r) => r.classification === 'complex')
    const complexTotal = complexRow ? Number(complexRow.total) : 0
    const complexFallbackPct = complexTotal > 0
      ? ((Number(complexRow!.fallbacks) / complexTotal) * 100).toFixed(1)
      : 'n/a (0 complex messages)'

    console.log('ROUTING (routing_decisions)')
    if (totalDecisions === 0) {
      console.log('  No routing decisions in this window (smart routing may be off, or no traffic).')
    } else {
      for (const r of rows) {
        console.log(`  ${r.classification.padEnd(10)} ${String(r.total).padStart(6)} messages`)
      }
      console.log(`  Fallback used (complex → couldn't afford strong model): ${totalFallbacks}/${complexTotal} complex messages (${complexFallbackPct}%)`)
      console.log('  Read: majority fallback among "complex" messages means orgs are routinely credit-starved when they need the strong model.')
    }
  } catch (err) {
    console.log('ROUTING: query failed —', err instanceof Error ? err.message : String(err))
  }

  console.log()

  // ── 2. Unanswered rate across all bots ──────────────────────────────────────
  try {
    const [row] = await db
      .select({
        total: count(),
        unanswered: sql<number>`count(*) FILTER (WHERE ${schema.messages.flaggedUnanswered} = true)::int`,
      })
      .from(schema.messages)
      .where(and(
        eq(schema.messages.role, 'assistant'),
        gte(schema.messages.createdAt, since),
      ))

    const total = Number(row?.total ?? 0)
    const unanswered = Number(row?.unanswered ?? 0)
    const pct = total > 0 ? ((unanswered / total) * 100).toFixed(1) : 'n/a (0 assistant messages)'

    console.log('UNANSWERED RATE (messages.flagged_unanswered, all bots combined)')
    console.log(`  ${unanswered}/${total} assistant messages flagged (${pct}%)`)
    console.log('  No established baseline in this repo — track this number over multiple runs before reacting to any single value.')
  } catch (err) {
    console.log('UNANSWERED RATE: query failed —', err instanceof Error ? err.message : String(err))
  }

  console.log()

  // ── 3. Credit refund rate ───────────────────────────────────────────────────
  try {
    const [row] = await db
      .select({
        debits: sql<number>`count(*) FILTER (WHERE ${schema.creditTransactions.reason} = 'chat_debit')::int`,
        refunds: sql<number>`count(*) FILTER (WHERE ${schema.creditTransactions.reason} = 'chat_refund')::int`,
      })
      .from(schema.creditTransactions)
      .where(gte(schema.creditTransactions.createdAt, since))

    const debits = Number(row?.debits ?? 0)
    const refunds = Number(row?.refunds ?? 0)
    const pct = debits > 0 ? ((refunds / debits) * 100).toFixed(1) : 'n/a (0 debits)'

    console.log('CREDITS (credit_transactions)')
    console.log(`  chat_debit: ${debits}, chat_refund: ${refunds} (refund/debit ratio: ${pct}%)`)
    console.log('  Refunds only happen when an LLM call fails after debit (debit-first pattern). >5-10% suggests upstream LLM/provider instability — check provider status before assuming a credits bug.')
  } catch (err) {
    console.log('CREDITS: query failed —', err instanceof Error ? err.message : String(err))
  }

  console.log()

  // ── 4. Orgs approaching their plan's conversation limit ────────────────────
  try {
    // Plan limits copied from lib/limits/index.ts PLAN_LIMITS.conversations
    // (re-verify against that file if this script's output looks wrong).
    const CONVERSATION_LIMITS: Record<string, number> = {
      free: 200,
      starter: 3_000,
      pro: 15_000,
      agency: 75_000,
      // enterprise: Infinity — excluded from the "near limit" check below
    }

    const orgs = await db
      .select({
        id: schema.organizations.id,
        name: schema.organizations.name,
        plan: schema.organizations.plan,
        conversationsThisMonth: schema.organizations.conversationsThisMonth,
      })
      .from(schema.organizations)

    const nearLimit = orgs
      .map((o) => {
        const limit = CONVERSATION_LIMITS[o.plan]
        if (!limit) return null
        const pct = (o.conversationsThisMonth / limit) * 100
        return { ...o, limit, pct }
      })
      .filter((o): o is NonNullable<typeof o> => o !== null && o.pct >= 80)
      .sort((a, b) => b.pct - a.pct)

    console.log('ORGS NEAR PLAN LIMIT (>=80% of monthly conversation allocation)')
    if (nearLimit.length === 0) {
      console.log('  None found.')
    } else {
      for (const o of nearLimit.slice(0, 20)) {
        console.log(`  ${o.name.padEnd(30).slice(0, 30)} ${o.plan.padEnd(10)} ${o.conversationsThisMonth}/${o.limit} (${o.pct.toFixed(0)}%)`)
      }
      if (nearLimit.length > 20) console.log(`  ... and ${nearLimit.length - 20} more`)
    }
    console.log('  No automated alert exists for this — this is an advisory check only.')
  } catch (err) {
    console.log('PLAN LIMITS: query failed —', err instanceof Error ? err.message : String(err))
  }

  console.log('\n─────────────────────────────────────────────────────────')
  console.log('Done. No rows were modified.')
  console.log('─────────────────────────────────────────────────────────')
}

main().catch((err) => {
  console.error('[diagnostics] health-summary failed:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
