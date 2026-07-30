import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export async function GET() {
  try {
    const result = await sql`
      SELECT 
        COALESCE(target_platforms, ARRAY['facebook', 'instagram', 'youtube_shorts', 'tiktok']) as target_platforms
      FROM brand_config 
      WHERE key = 'default'
    `;

    const targetPlatforms = result.rows[0]?.target_platforms || ["facebook", "instagram", "youtube_shorts", "tiktok"];

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

    await sql`
      UPDATE brand_config 
      SET target_platforms = ${targetPlatforms},
          updated_at = NOW()
      WHERE key = 'default'
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to save settings:", error);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 }
    );
  }
}
