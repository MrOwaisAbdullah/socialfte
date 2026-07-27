// Bootstrap status API — returns whether setup has been completed.
import { NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { join } from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const bootstrapMd = join(process.cwd(), '..', '..', 'BOOTSTRAP.md');
  return NextResponse.json({ completed: existsSync(bootstrapMd) });
}
