import { NextRequest, NextResponse } from "next/server";

const WORKER_URL = process.env.WORKER_INTERNAL_URL || "http://socialfte-worker:8000";

export async function GET() {
  try {
    const res = await fetch(`${WORKER_URL}/jobs`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: "Could not reach worker" }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const { job_id } = await request.json();
  const secret = process.env.RENDER_INTERNAL_SECRET;

  try {
    const res = await fetch(`${WORKER_URL}/jobs/${job_id}/run`, {
      method: "POST",
      headers: { "x-internal-secret": secret || "" },
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: "Could not reach worker" }, { status: 502 });
  }
}
