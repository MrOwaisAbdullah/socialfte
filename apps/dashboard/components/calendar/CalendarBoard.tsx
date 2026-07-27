'use client';

// Calendar week view — Week 5, US4 (T040-T043).
// One column per platform, one row per day. Click a post for a side-panel
// preview; drag a post card to a different day/platform cell to reschedule
// it (PATCH /api/posts/[id]). Native HTML5 drag-and-drop — no extra
// dependency needed for a grid this simple.
import { useEffect, useState } from 'react';

type PostSummary = {
  id: string;
  platform: string;
  format: string;
  state: string;
  caption: string | null;
  renderUrl: string | null;
  scheduledAt: string | null;
};

type DayColumn = {
  date: string;
  platforms: Record<string, { cap: number; count: number; posts: PostSummary[] }>;
};

type WeekData = {
  weekStart: string;
  platforms: string[];
  days: DayColumn[];
};

const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  youtube_shorts: 'YouTube',
  tiktok: 'TikTok',
};

const STATE_COLORS: Record<string, string> = {
  draft: 'bg-dark/10 text-dark',
  render: 'bg-dark/10 text-dark',
  review: 'bg-accent/20 text-dark',
  approved: 'bg-primary/15 text-primary',
  published: 'bg-primary text-light',
  failed: 'bg-red-600/15 text-red-700',
  tiktok_ready: 'bg-accent/20 text-dark',
  skipped: 'bg-dark/10 text-muted',
};

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export default function CalendarBoard({ initialWeekStart }: { initialWeekStart: string }) {
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [data, setData] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PostSummary | null>(null);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/posts?weekStart=${weekStart}`)
      .then((r) => r.json())
      .then((json: WeekData) => {
        if (!cancelled) setData(json);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [weekStart]);

  async function handleDrop(date: string, platform: string, postId: string) {
    setDragOverCell(null);
    // Keep the post's existing time-of-day, just move the calendar day.
    const existing = data?.days
      .flatMap((d) => d.platforms[platform]?.posts ?? [])
      .find((p) => p.id === postId);
    const time = existing?.scheduledAt ? existing.scheduledAt.slice(11, 19) : '12:00:00';
    const scheduledAt = `${date}T${time}Z`;

    const resp = await fetch(`/api/posts/${postId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledAt }),
    });

    if (!resp.ok) {
      setToast('Failed to reschedule post.');
      return;
    }

    const result = await resp.json();
    if (result.capStatus?.overCap) {
      setToast(
        `Rescheduled, but ${PLATFORM_LABELS[platform] ?? platform} now has ${result.capStatus.count} posts on ${date} (cap: ${result.capStatus.cap}).`
      );
    } else {
      setToast(null);
    }

    // Refetch to reflect the move (cheapest correct approach for a low-traffic
    // single-operator dashboard — no optimistic-update bookkeeping needed).
    setLoading(true);
    const refreshed = await fetch(`/api/posts?weekStart=${weekStart}`).then((r) => r.json());
    setData(refreshed);
    setLoading(false);
  }

  if (loading && !data) {
    return <p className="font-body text-muted">Loading calendar…</p>;
  }
  if (!data) {
    return <p className="font-body text-red-700">Could not load the calendar.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="rounded-md border border-dark/20 px-3 py-1.5 font-body text-sm text-dark hover:bg-dark/5"
          >
            ← Prev week
          </button>
          <button
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="rounded-md border border-dark/20 px-3 py-1.5 font-body text-sm text-dark hover:bg-dark/5"
          >
            Next week →
          </button>
        </div>
        <span className="font-body text-sm text-muted">
          Week of {formatDayLabel(data.weekStart)}
        </span>
      </div>

      {toast && (
        <div
          role="alert"
          className="rounded-md border border-accent/40 bg-accent/10 px-4 py-2 font-body text-sm text-dark"
        >
          {toast}
          <button onClick={() => setToast(null)} className="ml-3 font-semibold text-primary">
            Dismiss
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-dark/10 bg-light">
        <table className="w-full min-w-[720px] table-fixed border-collapse">
          <thead>
            <tr className="border-b border-dark/10 bg-dark/5 text-left text-xs font-semibold uppercase tracking-wider text-muted">
              <th className="w-28 px-3 py-3">Day</th>
              {data.platforms.map((platform) => (
                <th key={platform} className="px-3 py-3">
                  {PLATFORM_LABELS[platform] ?? platform}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.days.map((day) => (
              <tr key={day.date} className="border-b border-dark/5 align-top">
                <td className="px-3 py-3 font-body text-sm font-medium text-dark">
                  {formatDayLabel(day.date)}
                </td>
                {data.platforms.map((platform) => {
                  const cell = day.platforms[platform];
                  const cellKey = `${day.date}:${platform}`;
                  const fillPct = cell.cap > 0 ? Math.min(100, (cell.count / cell.cap) * 100) : 0;
                  const overCap = cell.count > cell.cap;
                  return (
                    <td
                      key={platform}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverCell(cellKey);
                      }}
                      onDragLeave={() => setDragOverCell((c) => (c === cellKey ? null : c))}
                      onDrop={(e) => {
                        e.preventDefault();
                        const postId = e.dataTransfer.getData('text/post-id');
                        const fromPlatform = e.dataTransfer.getData('text/platform');
                        if (postId && fromPlatform === platform) {
                          handleDrop(day.date, platform, postId);
                        }
                      }}
                      className={`px-2 py-2 ${dragOverCell === cellKey ? 'bg-accent/10' : ''}`}
                    >
                      <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-dark/10">
                        <div
                          className={`h-full ${overCap ? 'bg-red-600' : 'bg-primary'}`}
                          style={{ width: `${fillPct}%` }}
                          aria-hidden
                        />
                      </div>
                      <p className="mb-1 font-body text-[11px] text-muted">
                        {cell.count}/{cell.cap} {overCap && <span className="text-red-700">· over cap</span>}
                      </p>
                      <div className="flex flex-col gap-1.5">
                        {cell.posts.map((post) => (
                          <button
                            key={post.id}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/post-id', post.id);
                              e.dataTransfer.setData('text/platform', post.platform);
                            }}
                            onClick={() => setSelected(post)}
                            className={`w-full cursor-grab rounded-md border border-dark/10 px-2 py-1.5 text-left font-body text-xs ${STATE_COLORS[post.state] ?? 'bg-dark/10 text-dark'} hover:opacity-80`}
                          >
                            <span className="block truncate">{post.caption?.slice(0, 40) || post.format}</span>
                            <span className="block text-[10px] opacity-70">{post.state}</span>
                          </button>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div
          role="dialog"
          aria-label="Post details"
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col gap-4 overflow-y-auto border-l border-dark/10 bg-light p-6 shadow-xl"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-xl text-primary">Post details</h2>
            <button onClick={() => setSelected(null)} className="font-body text-sm text-muted hover:text-dark">
              Close
            </button>
          </div>
          {selected.renderUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selected.renderUrl}
              alt="Rendered post preview"
              className="w-full rounded-md border border-dark/10 object-cover"
            />
          )}
          <span
            className={`inline-block w-fit rounded-full px-2.5 py-1 font-body text-xs font-medium ${STATE_COLORS[selected.state] ?? 'bg-dark/10 text-dark'}`}
          >
            {selected.state}
          </span>
          <p className="font-body text-sm text-dark">{selected.caption || 'No caption'}</p>
          <p className="font-body text-xs text-muted">
            {PLATFORM_LABELS[selected.platform] ?? selected.platform} · {selected.format}
          </p>
        </div>
      )}
    </div>
  );
}
