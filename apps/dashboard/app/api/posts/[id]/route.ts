// PATCH /api/posts/[id] — Calendar drag-to-reschedule (Week 5, US4, T039).
// Session-gated by proxy.ts (this path isn't in its exclusion list), so only
// a logged-in dashboard session can move a post's scheduled_at.
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, lt } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { posts, auditLog } from '@/lib/db/schema';
import { getDailyCap } from '@/lib/cap-limits';

// Posts still on their way to publishing — what the calendar's cap fill bar
// counts against. Not 'draft'/'failed'/'skipped' (won't publish) or
// 'published' (already counted for a past day, not a scheduling conflict).
const ACTIVE_STATES = ['review', 'approved', 'tiktok_ready'];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: { scheduledAt?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  if (!body.scheduledAt) {
    return NextResponse.json({ error: 'scheduledAt is required' }, { status: 400 });
  }

  const newScheduledAt = new Date(body.scheduledAt);
  if (Number.isNaN(newScheduledAt.getTime())) {
    return NextResponse.json({ error: 'scheduledAt is not a valid date' }, { status: 400 });
  }

  const [existing] = await db.select().from(posts).where(eq(posts.id, id));
  if (!existing) {
    return NextResponse.json({ error: 'post not found' }, { status: 404 });
  }

  const previousScheduledAt = existing.scheduledAt;

  await db
    .update(posts)
    .set({ scheduledAt: newScheduledAt, updatedAt: new Date() })
    .where(eq(posts.id, id));

  // Same-day window in UTC — good enough for a fill-bar warning (FR-015);
  // this isn't the source of truth for what actually publishes (publish_due.py is).
  const dayStart = new Date(newScheduledAt);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const sameDayPosts = await db
    .select({ id: posts.id, state: posts.state })
    .from(posts)
    .where(
      and(
        eq(posts.platform, existing.platform),
        gte(posts.scheduledAt, dayStart),
        lt(posts.scheduledAt, dayEnd)
      )
    );

  const count = sameDayPosts.filter((p) => ACTIVE_STATES.includes(p.state)).length;
  const cap = getDailyCap(existing.platform, existing.format);

  await db.insert(auditLog).values({
    actor: 'dashboard_calendar',
    action: 'post_rescheduled',
    subjectId: id,
    payload: {
      previousScheduledAt: previousScheduledAt?.toISOString() ?? null,
      newScheduledAt: newScheduledAt.toISOString(),
    },
  });

  return NextResponse.json({
    id,
    scheduledAt: newScheduledAt.toISOString(),
    capStatus: { count, cap, overCap: count > cap },
  });
}
