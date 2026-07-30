import { NextRequest, NextResponse } from "next/server";

// Dashboard → Worker URL. In Dokploy each service has its own env,
// so WORKER_INTERNAL_URL on the dashboard points to the worker.
const WORKER_URL = process.env.WORKER_INTERNAL_URL || "http://localhost:8000";

export async function GET() {
  try {
    const res = await fetch(`${WORKER_URL}/jobs`, {
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Worker returned ${res.status}: ${res.statusText}` },
        { status: res.status }
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    console.error("Jobs API error:", e);
    return NextResponse.json(
      {
        error: "Could not reach worker",
        message: "Make sure WORKER_INTERNAL_URL is set and the worker is running",
        jobs: []
      },
      { status: 502 }
    );
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
