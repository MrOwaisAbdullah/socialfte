// GET /api/posts?weekStart=YYYY-MM-DD — Calendar week data (Week 5, US4, T039/T040).
// Returns one column per platform per day, with posts and the daily-cap fill
// status already computed server-side (single source, same cap values
// publish_due.py enforces at actual publish time — see lib/cap-limits.ts).
import { NextRequest, NextResponse } from 'next/server';
import { and, gte, lt } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { posts } from '@/lib/db/schema';
import { getDailyCap } from '@/lib/cap-limits';

const PLATFORMS = ['facebook', 'instagram', 'youtube_shorts', 'tiktok'];
const ACTIVE_STATES = ['review', 'approved', 'tiktok_ready'];

function mondayOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

export async function GET(request: NextRequest) {
  const weekStartParam = request.nextUrl.searchParams.get('weekStart');
  const weekStart = mondayOf(weekStartParam ? new Date(weekStartParam) : new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const weekPosts = await db
    .select({
      id: posts.id,
      platform: posts.platform,
      format: posts.format,
      state: posts.state,
      caption: posts.caption,
      renderUrl: posts.renderUrl,
      scheduledAt: posts.scheduledAt,
    })
    .from(posts)
    .where(and(gte(posts.scheduledAt, weekStart), lt(posts.scheduledAt, weekEnd)));

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setUTCDate(date.getUTCDate() + i);
    const dateStr = date.toISOString().slice(0, 10);

    const platforms = Object.fromEntries(
      PLATFORMS.map((platform) => {
        const dayPlatformPosts = weekPosts.filter(
          (p) =>
            p.platform === platform &&
            p.scheduledAt &&
            p.scheduledAt.toISOString().slice(0, 10) === dateStr
        );
        const count = dayPlatformPosts.filter((p) => ACTIVE_STATES.includes(p.state)).length;
        // Cap depends on format (Instagram stories differ) — use the most
        // common format among today's posts, or the platform default format.
        const cap = getDailyCap(platform, dayPlatformPosts[0]?.format ?? '');
        return [
          platform,
          {
            cap,
            count,
            posts: dayPlatformPosts.map((p) => ({
              ...p,
              scheduledAt: p.scheduledAt?.toISOString() ?? null,
            })),
          },
        ];
      })
    );

    return { date: dateStr, platforms };
  });

  return NextResponse.json({ weekStart: weekStart.toISOString().slice(0, 10), platforms: PLATFORMS, days });
}
