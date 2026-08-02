import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { posts, auditLog, concepts } from "@/lib/db/schema";
import { getDailyCap } from "@/lib/cap-limits";

const ACTIVE_STATES = ["review", "approved", "tiktok_ready"];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: { scheduledAt?: string; state?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const [existing] = await db.select().from(posts).where(eq(posts.id, id));
  if (!existing) {
    return NextResponse.json({ error: "post not found" }, { status: 404 });
  }

  // State change (approve / reject / skip)
  if (body.state) {
    const validStates = ["approved", "failed", "skipped"];
    if (!validStates.includes(body.state)) {
      return NextResponse.json({ error: `state must be one of: ${validStates.join(", ")}` }, { status: 400 });
    }
    await db
      .update(posts)
      .set({ state: body.state, updatedAt: new Date() })
      .where(eq(posts.id, id));

    await db.insert(auditLog).values({
      actor: "dashboard",
      action: `post_${body.state}`,
      subjectId: id,
      payload: { previousState: existing.state, newState: body.state },
    });

    // Retire the concept this post was composed from — an approved concept
    // used to stay in compose_batch's reusable pool forever, so the same
    // concept kept generating more posts indefinitely even after one of
    // them was already approved. Soft-retire (state='used') rather than
    // delete: the row (and its headlines/captions) stays for history, it
    // just drops out of _get_approved_concept()'s `state = 'approved'`
    // query so it can never be picked again.
    if (body.state === "approved" && existing.conceptId) {
      await db
        .update(concepts)
        .set({ state: "used", updatedAt: new Date() })
        .where(eq(concepts.id, existing.conceptId));

      await db.insert(auditLog).values({
        actor: "dashboard",
        action: "concept_retired",
        subjectId: existing.conceptId,
        payload: { reason: "post_approved", postId: id },
      });
    }

    return NextResponse.json({ id, state: body.state });
  }

  // Reschedule
  if (!body.scheduledAt) {
    return NextResponse.json({ error: "scheduledAt or state is required" }, { status: 400 });
  }

  const newScheduledAt = new Date(body.scheduledAt);
  if (Number.isNaN(newScheduledAt.getTime())) {
    return NextResponse.json({ error: "scheduledAt is not a valid date" }, { status: 400 });
  }

  const previousScheduledAt = existing.scheduledAt;

  await db
    .update(posts)
    .set({ scheduledAt: newScheduledAt, updatedAt: new Date() })
    .where(eq(posts.id, id));

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
    actor: "dashboard_calendar",
    action: "post_rescheduled",
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

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [existing] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  if (!existing) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  await db.delete(posts).where(eq(posts.id, id));

  await db.insert(auditLog).values({
    actor: "dashboard",
    action: "post_deleted",
    subjectId: id,
    payload: {
      platform: existing.platform,
      state: existing.state,
      scheduledAt: existing.scheduledAt?.toISOString() ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}
