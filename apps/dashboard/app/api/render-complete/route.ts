import { NextRequest, NextResponse } from "next/server";

// Public proxy for the render-video.yml GitHub Actions callback. The worker
// has no public port (internal-only, Dokploy Docker network) — a
// GitHub-hosted runner cannot reach it directly, only the dashboard, which
// has a real domain. This route exists solely to forward the callback
// through to the worker's actual /api/render-complete over the internal
// network. See docs/github-actions-setup.md's CALLBACK_URL entry.
//
// No safe hardcoded fallback for WORKER_INTERNAL_URL in a real deployment —
// Dokploy generates a random per-deployment hostname suffix. localhost is
// only correct for local dev.
const WORKER_URL = process.env.WORKER_INTERNAL_URL || "http://localhost:8000";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-render-secret");
  if (!secret || secret !== process.env.RENDER_INTERNAL_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.text();

  try {
    const res = await fetch(`${WORKER_URL}/api/render-complete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-render-secret": secret,
      },
      body,
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Could not reach worker" }, { status: 502 });
  }
}
