import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { posts, auditLog } from "@/lib/db/schema";

export async function POST(request: NextRequest) {
  const { ids } = (await request.json()) as { ids?: string[] };
  if (!ids?.length) {
    return NextResponse.json({ error: "No post IDs provided" }, { status: 400 });
  }

  // Fetch posts before deleting for audit log
  const rows = await db
    .select({ id: posts.id, platform: posts.platform, state: posts.state })
    .from(posts)
    .where(inArray(posts.id, ids));

  await db.delete(posts).where(inArray(posts.id, ids));

  await db.insert(auditLog).values({
    actor: "dashboard",
    action: "posts_bulk_deleted",
    subjectId: ids.join(","),
    payload: { count: rows.length, platforms: [...new Set(rows.map((r) => r.platform))] },
  });

  return NextResponse.json({ ok: true, deleted: rows.length });
}
