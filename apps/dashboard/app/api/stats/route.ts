import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

// Activity feed is paginated separately from the aggregate counts above it —
// `activityLimit`/`activityOffset` let the dashboard's "See more" button
// fetch additional pages without needing its own endpoint. Also now selects
// `actor` (e.g. "compose_batch", "create_concepts") which audit_log already
// had but this route never returned — it's the natural "which pipeline
// produced this" grouping key the dashboard's activity feed was missing.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const activityLimit = Math.min(Number(searchParams.get("activityLimit")) || 20, 100);
  const activityOffset = Math.max(Number(searchParams.get("activityOffset")) || 0, 0);

  const [postCounts, assetCount, recentActivity, activityCount] = await Promise.all([
    db.execute<{ state: string; count: string }>(sql`
      SELECT state, COUNT(*)::text AS count FROM posts GROUP BY state
    `),
    db.execute<{ count: string }>(sql`SELECT COUNT(*)::text AS count FROM assets`),
    db.execute<{ actor: string; action: string; subject_id: string | null; created_at: string; payload: unknown }>(sql`
      SELECT actor, action, subject_id, created_at, payload
      FROM audit_log
      ORDER BY created_at DESC
      LIMIT ${activityLimit} OFFSET ${activityOffset}
    `),
    db.execute<{ count: string }>(sql`SELECT COUNT(*)::text AS count FROM audit_log`),
  ]);

  const postsByState: Record<string, number> = {};
  for (const row of postCounts.rows) {
    postsByState[row.state] = parseInt(row.count, 10);
  }

  const totalActivity = parseInt(activityCount.rows[0]?.count ?? "0", 10);

  return NextResponse.json({
    totalPosts: Object.values(postsByState).reduce((a, b) => a + b, 0),
    postsByState,
    totalAssets: parseInt(assetCount.rows[0]?.count ?? "0", 10),
    recentActivity: recentActivity.rows.map((r) => ({
      actor: r.actor,
      action: r.action,
      subjectId: r.subject_id,
      createdAt: String(r.created_at),
      payload: r.payload,
    })),
    activityHasMore: activityOffset + recentActivity.rows.length < totalActivity,
  });
}
