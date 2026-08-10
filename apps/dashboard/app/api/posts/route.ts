// GET /api/posts — list all posts (with optional state filter).
// GET /api/posts?weekStart=YYYY-MM-DD — Calendar week data (Week 5, US4, T039/T040).
// GET /api/posts?schedulable=1&platform=<platform|all> — posts eligible to be
// manually placed on the calendar (Add to Calendar picker): excludes
// published and failed (the state the dashboard's "Reject" button writes).
import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, gte, lt, ne, or } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { posts, templates } from '@/lib/db/schema';
import { getDailyCap } from '@/lib/cap-limits';

// A post's calendar day: the day it actually went out (publishedAt) if it
// has, otherwise the day it's scheduled for, otherwise the day it was
// drafted. NULL scheduledAt is common (compose_batch.py doesn't always set
// one, and manually-reconciled/cross-posted rows never get one) — bucketing
// on scheduledAt alone made every such post invisible on every week view,
// forever, including ones that had already published. Same NULL-comparison
// trap already fixed twice on the worker side (publish_due.py,
// notify_review.py): `column >= x` is NULL, not true, when column IS NULL.
function displayDate(p: { scheduledAt: Date | null; publishedAt: Date | null; createdAt: Date | null }): Date | null {
  return p.publishedAt ?? p.scheduledAt ?? p.createdAt;
}

const PLATFORMS = ['facebook', 'instagram', 'youtube_shorts', 'tiktok'];
// Counted toward the day's cap-progress bar: queued/slotted posts that will
// consume capacity (review/approved/tiktok_ready) plus posts that already
// did (published) — matches what publish_due.py's _check_platform_cap()
// actually counts (today's published rows) instead of only showing queue
// depth and silently excluding posts that already went out.
const ACTIVE_STATES = ['review', 'approved', 'tiktok_ready', 'published'];

function mondayOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

export async function GET(request: NextRequest) {
  const weekStartParam = request.nextUrl.searchParams.get('weekStart');
  const stateFilter = request.nextUrl.searchParams.get('state');
  const schedulable = request.nextUrl.searchParams.get('schedulable');

  if (schedulable) {
    const platformFilter = request.nextUrl.searchParams.get('platform');
    const conditions = [ne(posts.state, 'published'), ne(posts.state, 'failed')];
    if (platformFilter && platformFilter !== 'all') {
      conditions.push(eq(posts.platform, platformFilter));
    }
    const schedulablePosts = await db
      .select({
        id: posts.id,
        platform: posts.platform,
        format: posts.format,
        state: posts.state,
        caption: posts.caption,
        renderUrl: posts.renderUrl,
        scheduledAt: posts.scheduledAt,
        createdAt: posts.createdAt,
        templateId: posts.templateId,
        templateSlug: templates.slug,
        templateDisplayName: templates.displayName,
      })
      .from(posts)
      .leftJoin(templates, eq(posts.templateId, templates.id))
      .where(and(...conditions))
      .orderBy(desc(posts.createdAt))
      .limit(200);
    return NextResponse.json(
      schedulablePosts.map((p) => ({
        ...p,
        scheduledAt: p.scheduledAt?.toISOString() ?? null,
        createdAt: p.createdAt?.toISOString() ?? null,
      }))
    );
  }

  // If no weekStart param, return all posts (for the /posts management page)
  if (!weekStartParam && !stateFilter) {
    const allPosts = await db
      .select({
        id: posts.id,
        platform: posts.platform,
        format: posts.format,
        state: posts.state,
        caption: posts.caption,
        renderUrl: posts.renderUrl,
        scheduledAt: posts.scheduledAt,
        externalId: posts.externalId,
        error: posts.error,
        createdAt: posts.createdAt,
        templateId: posts.templateId,
        assetId: posts.assetId,
        templateSlug: templates.slug,
        templateDisplayName: templates.displayName,
      })
      .from(posts)
      .leftJoin(templates, eq(posts.templateId, templates.id))
      .orderBy(desc(posts.createdAt))
      .limit(100);
    return NextResponse.json(allPosts.map(p => ({ ...p, scheduledAt: p.scheduledAt?.toISOString() ?? null, createdAt: p.createdAt?.toISOString() ?? null })));
  }

  // If state filter, return filtered posts
  if (stateFilter) {
    const filteredPosts = await db
      .select({
        id: posts.id,
        platform: posts.platform,
        format: posts.format,
        state: posts.state,
        caption: posts.caption,
        renderUrl: posts.renderUrl,
        scheduledAt: posts.scheduledAt,
        externalId: posts.externalId,
        error: posts.error,
        createdAt: posts.createdAt,
        templateId: posts.templateId,
        assetId: posts.assetId,
        templateSlug: templates.slug,
        templateDisplayName: templates.displayName,
      })
      .from(posts)
      .leftJoin(templates, eq(posts.templateId, templates.id))
      .where(eq(posts.state, stateFilter))
      .orderBy(desc(posts.createdAt))
      .limit(100);
    return NextResponse.json(filteredPosts.map(p => ({ ...p, scheduledAt: p.scheduledAt?.toISOString() ?? null, createdAt: p.createdAt?.toISOString() ?? null })));
  }

  // Calendar week view
  const weekStart = mondayOf(new Date(weekStartParam!));
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  // Over-fetches slightly (a row matching only on createdAt when its real
  // displayDate() falls elsewhere gets pulled in) — harmless at this
  // dashboard's scale, and every row is re-filtered by its actual
  // displayDate() below, so nothing incorrect reaches the client.
  const weekPosts = await db
    .select({
      id: posts.id,
      platform: posts.platform,
      format: posts.format,
      state: posts.state,
      caption: posts.caption,
      renderUrl: posts.renderUrl,
      scheduledAt: posts.scheduledAt,
      publishedAt: posts.publishedAt,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .where(
      or(
        and(gte(posts.publishedAt, weekStart), lt(posts.publishedAt, weekEnd)),
        and(gte(posts.scheduledAt, weekStart), lt(posts.scheduledAt, weekEnd)),
        and(gte(posts.createdAt, weekStart), lt(posts.createdAt, weekEnd))
      )
    );

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setUTCDate(date.getUTCDate() + i);
    const dateStr = date.toISOString().slice(0, 10);

    const platforms = Object.fromEntries(
      PLATFORMS.map((platform) => {
        const dayPlatformPosts = weekPosts.filter((p) => {
          if (p.platform !== platform) return false;
          const d = displayDate(p);
          return d ? d.toISOString().slice(0, 10) === dateStr : false;
        });
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
