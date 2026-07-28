import { NextRequest, NextResponse } from "next/server";
import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { assets, posts } from "@/lib/db/schema";
import { deleteObject } from "@/lib/r2";

// Manual cleanup for assets whose R2 object no longer exists — e.g. someone
// deleted the file directly from the R2 dashboard, bypassing the app
// entirely, leaving a DB row with a permanently 404ing r2_key (broken image
// card on the assets page, and apps/worker/jobs/retag_assets.py retrying a
// dead vision-tag call for it forever since nothing ever clears
// quality_score IS NULL for it).
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [row] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  if (!row) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  // posts.asset_id -> assets.id has no ON DELETE clause (schema.sql), so a
  // raw delete on a still-referenced asset would 500 on the FK constraint —
  // surface that as a clear 409 instead.
  const [{ value: postCount }] = await db
    .select({ value: count() })
    .from(posts)
    .where(eq(posts.assetId, id));
  if (postCount > 0) {
    return NextResponse.json(
      { error: `Asset is referenced by ${postCount} post(s) and can't be deleted` },
      { status: 409 }
    );
  }

  // r2Key is normally the bare key ("assets/uuid.png"), but the assets page
  // has always tolerated a full URL there too (see its r2Key.startsWith("http")
  // check) — strip it back to a key before calling deleteObject.
  const key = row.r2Key.startsWith("http") ? row.r2Key.split("/").slice(3).join("/") : row.r2Key;
  if (key) {
    await deleteObject(key);
  }

  await db.delete(assets).where(eq(assets.id, id));

  return NextResponse.json({ ok: true });
}
