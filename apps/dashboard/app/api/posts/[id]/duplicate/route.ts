// POST /api/posts/[id]/duplicate — cross-publish an existing post onto another
// platform. A post's render is platform/format-specific (TikTok/Shorts are
// vertical, Facebook/Instagram feed differ too), so cross-publishing can't be
// a plain reschedule like drag-and-drop — it creates a second post row on the
// target platform, reusing the same render/caption, and leaves the source
// post's own slot untouched. Only allowed when the target platform actually
// supports the source post's format (see lib/platform-formats.ts) — no
// wrong-aspect renders reaching a real account. Starts in state='review', not
// auto-approved: it's a distinct post going out to a distinct platform/audience,
// and "human approval before publish, no exceptions" applies per-post.
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { posts, auditLog } from "@/lib/db/schema";
import { isFormatCompatible } from "@/lib/platform-formats";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: { platform?: string; scheduledAt?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!body.platform || !body.scheduledAt) {
    return NextResponse.json({ error: "platform and scheduledAt are required" }, { status: 400 });
  }
  const scheduledAt = new Date(body.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ error: "scheduledAt is not a valid date" }, { status: 400 });
  }

  const [source] = await db.select().from(posts).where(eq(posts.id, id));
  if (!source) {
    return NextResponse.json({ error: "post not found" }, { status: 404 });
  }
  if (source.platform === body.platform) {
    return NextResponse.json(
      { error: "target platform matches the source post's platform — reschedule it instead of cross-publishing" },
      { status: 400 }
    );
  }
  if (!isFormatCompatible(body.platform, source.format)) {
    return NextResponse.json(
      { error: `${source.format} isn't a supported format on ${body.platform}` },
      { status: 400 }
    );
  }

  const [created] = await db
    .insert(posts)
    .values({
      platform: body.platform,
      format: source.format,
      state: "review",
      templateId: source.templateId,
      assetId: source.assetId,
      conceptId: source.conceptId,
      caption: source.caption,
      renderUrl: source.renderUrl,
      scheduledAt,
    })
    .returning();

  await db.insert(auditLog).values({
    actor: "dashboard_calendar",
    action: "post_cross_published",
    subjectId: created.id,
    payload: {
      sourcePostId: id,
      sourcePlatform: source.platform,
      targetPlatform: body.platform,
      scheduledAt: scheduledAt.toISOString(),
    },
  });

  return NextResponse.json({ id: created.id, platform: created.platform, state: created.state, scheduledAt: scheduledAt.toISOString() });
}
