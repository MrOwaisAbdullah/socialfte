/**
 * credits-health.ts
 *
 * Read-only deep dive into credit_transactions (the append-only money ledger):
 * totals by reason, refund/debit ratio, top orgs by debit volume. Makes NO writes.
 *
 * Part of the octively-diagnostics-and-tooling skill. Ground truth:
 * lib/db/schema.ts (creditTransactions table — reason is one of
 * 'chat_debit' | 'chat_refund' | 'purchase' | 'monthly_reset'), verified 2026-07-06/07.
 *
 * Usage (always from the repo root, quoting the path since it has spaces):
 *   cd "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas"
 *   NODE_OPTIONS="--dns-result-order=ipv4first --import ./scripts/wsl-net-fix.mjs" \
 *     npx tsx .claude/skills/octively-diagnostics-and-tooling/scripts/credits-health.ts [--days 30]
 *
 * Env: requires DATABASE_URL, loaded explicitly from .env.local (see health-summary.ts
 * header comment for why the bare `dotenv/config` shortcut does not work in this repo).
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })

function parseDays(): number {
  const idx = process.argv.indexOf('--days')
  if (idx === -1) return 30
  const val = Number(process.argv[idx + 1])
  return Number.isFinite(val) && val > 0 ? val : 30
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[diagnostics] DATABASE_URL not set — see .env.local')
    process.exit(1)
  }

  const days = parseDays()
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const { db, schema } = await import('../../../../lib/db')
  const { eq, gte, sql, count, desc } = await import('drizzle-orm')

  console.log('─────────────────────────────────────────────────────────')
  console.log(`Credits health — last ${days} day(s)`)
  console.log('─────────────────────────────────────────────────────────\n')

  // ── Totals by reason ─────────────────────────────────────────────────────
  const reasonRows = await db
    .select({
      reason: schema.creditTransactions.reason,
      count: count(),
      totalDelta: sql<number>`COALESCE(SUM(${schema.creditTransactions.delta}), 0)::bigint`,
    })
    .from(schema.creditTransactions)
    .where(gte(schema.creditTransactions.createdAt, since))
    .groupBy(schema.creditTransactions.reason)
    .orderBy(desc(count()))

  console.log('TOTALS BY REASON')
  if (reasonRows.length === 0) {
    console.log('  No credit_transactions rows in this window.')
  } else {
    for (const r of reasonRows) {
      console.log(`  ${r.reason.padEnd(15)} ${String(r.count).padStart(8)} txns   net delta: ${Number(r.totalDelta).toLocaleString()}`)
    }
  }

  const debits = reasonRows.find((r) => r.reason === 'chat_debit')
  const refunds = reasonRows.find((r) => r.reason === 'chat_refund')
  const debitCount = debits ? Number(debits.count) : 0
  const refundCount = refunds ? Number(refunds.count) : 0
  const refundRatio = debitCount > 0 ? ((refundCount / debitCount) * 100).toFixed(1) : 'n/a (0 debits)'

  console.log(`\n  Refund/debit ratio: ${refundRatio}%`)
  console.log('  Read: refunds only happen when an LLM call fails after debit (debit-first pattern,')
  console.log('  ADR-0001). A ratio above ~5-10% suggests upstream LLM/provider instability — check')
  console.log('  OpenRouter/provider status before assuming a credits code regression.')

  console.log()

  // ── Top orgs by debit volume ─────────────────────────────────────────────
  const topOrgRows = await db
    .select({
      orgId: schema.creditTransactions.orgId,
      orgName: schema.organizations.name,
      plan: schema.organizations.plan,
      debited: sql<number>`COALESCE(SUM(-${schema.creditTransactions.delta}) FILTER (WHERE ${schema.creditTransactions.reason} = 'chat_debit'), 0)::bigint`,
      refunded: sql<number>`COALESCE(SUM(${schema.creditTransactions.delta}) FILTER (WHERE ${schema.creditTransactions.reason} = 'chat_refund'), 0)::bigint`,
    })
    .from(schema.creditTransactions)
    .innerJoin(schema.organizations, eq(schema.creditTransactions.orgId, schema.organizations.id))
    .where(gte(schema.creditTransactions.createdAt, since))
    .groupBy(schema.creditTransactions.orgId, schema.organizations.name, schema.organizations.plan)
    .orderBy(sql`4 DESC`) // order by "debited" column position (orgId, orgName, plan, debited, refunded)
    .limit(15)

  console.log('TOP ORGS BY DEBIT VOLUME (top 15)')
  if (topOrgRows.length === 0) {
    console.log('  No rows.')
  } else {
    for (const r of topOrgRows) {
      console.log(`  ${(r.orgName ?? r.orgId).padEnd(30).slice(0, 30)} ${(r.plan ?? '?').padEnd(10)} debited=${Number(r.debited).toLocaleString().padStart(12)}  refunded=${Number(r.refunded).toLocaleString()}`)
    }
  }

  console.log('\n─────────────────────────────────────────────────────────')
  console.log('Done. No rows were modified.')
  console.log('─────────────────────────────────────────────────────────')
}

main().catch((err) => {
  console.error('[diagnostics] credits-health failed:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
