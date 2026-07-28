import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { assets } from "@/lib/db/schema";

export async function GET() {
  const allAssets = await db
    .select()
    .from(assets)
    .orderBy(desc(assets.createdAt))
    .limit(200);

  return NextResponse.json(
    allAssets.map((a) => ({
      ...a,
      createdAt: a.createdAt?.toISOString() ?? null,
    }))
  );
}
