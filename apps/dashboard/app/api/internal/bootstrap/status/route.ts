// Bootstrap status API — returns whether setup has been completed.
// Was existsSync(BOOTSTRAP.md), a file the worker's CLI wizard writes — the
// dashboard and worker are separate Docker containers with no shared volume
// (infra/docker-compose.yml), so this could never actually see it in
// production and always reported incomplete. brand_config.setup_complete
// (written by /api/internal/bootstrap/verify) is the real signal now.
import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { rows } = await db.execute<{ setup_complete: boolean }>(
      sql`SELECT setup_complete FROM brand_config WHERE key = 'default'`
    );
    return NextResponse.json({ completed: rows[0]?.setup_complete ?? false });
  } catch {
    // brand_config not migrated yet, or DB unreachable — treat as not set up
    // rather than 500ing the setup page.
    return NextResponse.json({ completed: false });
  }
}
