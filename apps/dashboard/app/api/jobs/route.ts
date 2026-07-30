import { NextRequest, NextResponse } from "next/server";

// Dashboard needs to reach the worker - use WORKER_SERVICE_URL to avoid confusion
// with the worker's own WORKER_INTERNAL_URL (which points to the dashboard).
// In Dokploy: set WORKER_SERVICE_URL to the worker's internal service hostname.
const WORKER_URL = process.env.WORKER_SERVICE_URL || "http://socialfte-worker-2s66t5:8000";

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
