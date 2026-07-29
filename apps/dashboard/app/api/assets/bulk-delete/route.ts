import { NextRequest, NextResponse } from "next/server";
import { count, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { assets, posts } from "@/lib/db/schema";
import { deleteObject } from "@/lib/r2";

export async function POST(request: NextRequest) {
  const { ids } = (await request.json()) as { ids?: string[] };
  if (!ids?.length) {
    return NextResponse.json({ error: "No asset IDs provided" }, { status: 400 });
  }

  // Check for assets referenced by posts (can't delete)
  const [row] = await db
    .select({ value: count() })
    .from(posts)
    .where(inArray(posts.assetId, ids));
  const refCount = row?.value ?? 0;
  if (refCount > 0) {
    return NextResponse.json(
      { error: `${refCount} asset(s) are referenced by posts and can't be deleted` },
      { status: 409 }
    );
  }

  // Fetch R2 keys before deleting
  const rows = await db.select({ id: assets.id, r2Key: assets.r2Key }).from(assets).where(inArray(assets.id, ids));

  // Delete R2 objects (best-effort)
  for (const row of rows) {
    const key = row.r2Key.startsWith("http") ? row.r2Key.split("/").slice(3).join("/") : row.r2Key;
    if (key) await deleteObject(key);
  }

  await db.delete(assets).where(inArray(assets.id, ids));

  return NextResponse.json({ ok: true, deleted: rows.length });
}
