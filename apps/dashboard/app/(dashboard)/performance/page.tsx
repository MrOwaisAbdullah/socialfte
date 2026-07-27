// Performance screen — Week 4, US4 (FR-010).
// Reads metrics joined to posts, grouped by platform and window.
// Styled per the existing dashboard conventions (forest green / gold / Instrument Serif / Archivo).
export const dynamic = "force-dynamic";

type Metric = {
  id: string;
  post_id: string;
  platform: string;
  window: string;
  reach: number | null;
  likes: number | null;
  saves: number | null;
  comments: number | null;
  shares: number | null;
  error: string | null;
  caption_preview: string | null;
  published_at: string | null;
};

async function fetchMetrics(): Promise<Metric[]> {
  const base = process.env.APP_URL || "http://localhost:3000";
  const secret = process.env.RENDER_INTERNAL_SECRET || "";
  try {
    const resp = await fetch(`${base}/api/internal/metrics`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
    if (!resp.ok) return [];
    return await resp.json();
  } catch {
    return [];
  }
}

function MetricRow({ m }: { m: Metric }) {
  return (
    <tr className="border-b border-dark/5 text-sm even:bg-dark/5">
      <td className="px-3 py-2 font-body capitalize text-primary">{m.platform}</td>
      <td className="px-3 py-2 font-body text-muted">{m.window}</td>
      <td className="px-3 py-2 font-body text-primary">{m.reach ?? "—"}</td>
      <td className="px-3 py-2 font-body text-primary">{m.likes ?? "—"}</td>
      <td className="px-3 py-2 font-body text-primary">{m.saves ?? "—"}</td>
      <td className="px-3 py-2 font-body text-primary">{m.comments ?? "—"}</td>
      <td className="px-3 py-2 font-body text-primary">{m.shares ?? "—"}</td>
      <td className="max-w-[200px] truncate px-3 py-2 font-body text-muted">
        {m.error ? <span className="text-red-600">{m.error}</span> : m.caption_preview ?? "—"}
      </td>
    </tr>
  );
}

export default async function PerformancePage() {
  const metrics = await fetchMetrics();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl text-primary">Performance</h1>
      <p className="font-body text-muted">
        Engagement metrics for published posts, collected every 6 hours.
      </p>

      {metrics.length === 0 ? (
        <p className="font-body italic text-muted">
          No metrics collected yet. Publish a post and wait for the next collection cycle.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-dark/10 bg-light">
          <table className="w-full table-auto">
            <thead>
              <tr className="border-b border-dark/10 bg-dark/5 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                <th className="px-3 py-3">Platform</th>
                <th className="px-3 py-3">Window</th>
                <th className="px-3 py-3">Reach</th>
                <th className="px-3 py-3">Likes</th>
                <th className="px-3 py-3">Saves</th>
                <th className="px-3 py-3">Comments</th>
                <th className="px-3 py-3">Shares</th>
                <th className="px-3 py-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <MetricRow key={m.id} m={m} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
