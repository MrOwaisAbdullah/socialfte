import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const [postCounts, assetCount, recentActivity] = await Promise.all([
    db.execute<{ state: string; count: string }>(sql`
      SELECT state, COUNT(*)::text AS count FROM posts GROUP BY state
    `),
    db.execute<{ count: string }>(sql`SELECT COUNT(*)::text AS count FROM assets`),
    db.execute<{ action: string; subject_id: string | null; created_at: string; payload: unknown }>(sql`
      SELECT action, subject_id, created_at, payload
      FROM audit_log
      ORDER BY created_at DESC
      LIMIT 10
    `),
  ]);

  const postsByState: Record<string, number> = {};
  for (const row of postCounts.rows) {
    postsByState[row.state] = parseInt(row.count, 10);
  }

  return NextResponse.json({
    totalPosts: Object.values(postsByState).reduce((a, b) => a + b, 0),
    postsByState,
    totalAssets: parseInt(assetCount.rows[0]?.count ?? "0", 10),
    recentActivity: recentActivity.rows.map((r) => ({
      action: r.action,
      subjectId: r.subject_id,
      createdAt: String(r.created_at),
      payload: r.payload,
    })),
  });
}
