import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { brandConfig } from "@/lib/db/schema";

export async function GET() {
  try {
    const config = await db.query.brandConfig.findFirst({
      where: (brandConfig, { eq }) => eq(brandConfig.key, "default"),
    });

    const targetPlatforms = config?.targetPlatforms || ["facebook", "instagram", "youtube_shorts", "tiktok"];

    return NextResponse.json({
      targetPlatforms,
    });
  } catch (error) {
    console.error("Failed to fetch settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { targetPlatforms } = body;

    if (!Array.isArray(targetPlatforms)) {
      return NextResponse.json(
        { error: "targetPlatforms must be an array" },
        { status: 400 }
      );
    }

    await db.update(brandConfig)
      .set({ targetPlatforms })
      .where(eq(brandConfig.key, "default"));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to save settings:", error);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 }
    );
  }
}
