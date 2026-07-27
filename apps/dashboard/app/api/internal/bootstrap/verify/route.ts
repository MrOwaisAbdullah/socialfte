// Bootstrap verification API — runs Step 6 checks server-side.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest) {
  const results: { test: string; passed: boolean; detail: string }[] = [];

  // Database check
  try {
    const { rows } = await db.execute<{ cnt: string }>(sql`SELECT COUNT(*) AS cnt FROM audit_log`);
    results.push({
      test: 'Database',
      passed: true,
      detail: `${rows[0].cnt} audit log rows found`,
    });
  } catch (e: unknown) {
    results.push({ test: 'Database', passed: false, detail: String(e).slice(0, 200) });
  }

  const allOk = results.every((r) => r.passed);
  return NextResponse.json({ ok: allOk, results });
}
