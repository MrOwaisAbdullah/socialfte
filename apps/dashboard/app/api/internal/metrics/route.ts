// Internal metrics API — serves the Performance screen (FR-010).
// Secured by RENDER_INTERNAL_SECRET (same auth scheme as /api/internal/render).
import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type MetricRow = {
  id: string;
  post_id: string;
  window: string;
  reach: number | null;
  likes: number | null;
  saves: number | null;
  comments: number | null;
  shares: number | null;
  error: string | null;
  platform: string;
  caption_preview: string | null;
  published_at: string | null;
};

export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!secret || secret !== process.env.RENDER_INTERNAL_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { rows } = await db.execute<MetricRow>(sql`
    SELECT
      m.id,
      m.post_id,
      m.window,
      m.reach,
      m.likes,
      m.saves,
      m.comments,
      m.shares,
      m.error,
      p.platform,
      LEFT(p.caption, 80) AS caption_preview,
      p.published_at
    FROM metrics m
    JOIN posts p ON p.id = m.post_id
    ORDER BY m.collected_at DESC
    LIMIT 200
  `);

  return NextResponse.json(rows);
}
