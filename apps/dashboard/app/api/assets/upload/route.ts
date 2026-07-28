import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { uploadBuffer, getPublicUrl } from "@/lib/r2";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "missing file field" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop() ?? "png";
  const key = `assets/${randomUUID()}.${ext}`;
  await uploadBuffer(key, buffer, file.type || `image/${ext}`);

  const imageUrl = getPublicUrl(key);
  const { rows } = await db.execute<{ id: string }>(sql`
    INSERT INTO assets (r2_key, times_used)
    VALUES (${key}, 0)
    RETURNING id
  `);

  const assetId = rows[0].id;

  // Fire-and-forget: ask worker to tag the image (best effort)
  try {
    const workerUrl = process.env.WORKER_INTERNAL_URL;
    if (workerUrl) {
      await fetch(`${workerUrl}/vision/tag`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": process.env.RENDER_INTERNAL_SECRET ?? "",
        },
        body: JSON.stringify({ asset_id: assetId, image_url: imageUrl }),
      });
    }
  } catch {
    // non-critical
  }

  return NextResponse.json({ id: assetId, url: imageUrl });
}
