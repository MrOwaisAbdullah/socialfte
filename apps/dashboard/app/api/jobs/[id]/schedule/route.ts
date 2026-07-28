import { NextRequest, NextResponse } from "next/server";

// No safe hardcoded fallback for a real deployment: Dokploy runs each app as
// a Swarm service and generates its own internal hostname per app, with a
// random per-deployment suffix — check that app's Dokploy panel for its real
// name. WORKER_INTERNAL_URL MUST be set explicitly in the dashboard app's
// Dokploy env config. localhost is only correct for local dev.
const WORKER_URL = process.env.WORKER_INTERNAL_URL || "http://localhost:8000";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const secret = process.env.RENDER_INTERNAL_SECRET;

  try {
    const res = await fetch(`${WORKER_URL}/jobs/${id}/schedule`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": secret || "",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Could not reach worker" }, { status: 502 });
  }
}
