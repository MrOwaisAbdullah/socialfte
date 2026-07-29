// Bootstrap status API — returns whether setup has been completed.
import { NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { join } from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  // In Docker process.cwd() is /app (the dashboard app directory).
  // BOOTSTRAP.md lives at the workspace root, which could be several
  // levels up depending on the deployment layout. Check the most
  // likely locations and return completed=true if ANY of them exist.
  const candidates = [
    join(process.cwd(), 'BOOTSTRAP.md'),             // /app/BOOTSTRAP.md
    join(process.cwd(), '..', 'BOOTSTRAP.md'),       // one level up
    join(process.cwd(), '..', '..', 'BOOTSTRAP.md'), // two levels up (monorepo root)
    '/app/BOOTSTRAP.md',
    '/BOOTSTRAP.md',
  ];
  const completed = candidates.some((p) => existsSync(p));
  return NextResponse.json({ completed });
}
