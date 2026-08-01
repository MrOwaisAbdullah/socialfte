import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { concepts, assets } from '@/lib/db/schema';
import { eq, desc, sql } from 'drizzle-orm';

// GET /api/concepts - List concepts with optional state filter
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const state = searchParams.get('state'); // draft, approved, rejected
  const limit = parseInt(searchParams.get('limit') || '50');

  const conditions = state && state !== 'all' ? eq(concepts.state, state) : undefined;

  const results = await db
    .select({
      id: concepts.id,
      assetId: concepts.assetId,
      conceptType: concepts.conceptType,
      headlines: concepts.headlines,
      captions: concepts.captions,
      creativeDirection: concepts.creativeDirection,
      suggestedTemplates: concepts.suggestedTemplates,
      animationStyle: concepts.animationStyle,
      state: concepts.state,
      usageCount: concepts.usageCount,
      performanceScore: concepts.performanceScore,
      createdAt: concepts.createdAt,
      assetFilename: assets.originalFilename,
      assetKind: assets.kind,
    })
    .from(concepts)
    .leftJoin(assets, eq(concepts.assetId, assets.id))
    .where(conditions || sql`TRUE`)
    .orderBy(desc(concepts.createdAt))
    .limit(limit)
    .execute();

  return NextResponse.json(
    results.map(r => ({
      ...r,
      createdAt: r.createdAt?.toISOString() ?? null,
      headlines: r.headlines ?? [],
      captions: r.captions ?? [],
      suggestedTemplates: r.suggestedTemplates ?? [],
    }))
  );
}