'use client';

// "Add to calendar" picker — lets an operator manually place an existing
// post (one that wasn't auto-slotted onto this week, e.g. drafted before the
// week existed, or previously rescheduled off it) onto a chosen day. Reuses
// the same PATCH /api/posts/[id] { scheduledAt } reschedule path CalendarBoard's
// drag-and-drop already uses.
import { useEffect, useState } from 'react';

type SchedulablePost = {
  id: string;
  platform: string;
  format: string;
  state: string;
  caption: string | null;
  renderUrl: string | null;
  scheduledAt: string | null;
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
  tiktok_ready: 'bg-accent/20 text-dark',
  skipped: 'bg-dark/10 text-muted',
};

export default function AddToCalendarModal({
  platforms,
  defaultDate,
  onClose,
  onAdded,
}: {
  platforms: string[];
  defaultDate: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [platformFilter, setPlatformFilter] = useState('all');
  const [date, setDate] = useState(defaultDate);
  const [posts, setPosts] = useState<SchedulablePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/posts?schedulable=1&platform=${platformFilter}`)
      .then((r) => r.json())
      .then((json: SchedulablePost[]) => {
        if (!cancelled) setPosts(json);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [platformFilter]);

  async function handleAdd(postId: string) {
    setAddingId(postId);
    setError(null);
    // Keep the post's existing time-of-day if it had one, noon UTC otherwise.
    const existing = posts.find((p) => p.id === postId);
    const time = existing?.scheduledAt ? existing.scheduledAt.slice(11, 19) : '12:00:00';
    const resp = await fetch(`/api/posts/${postId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledAt: `${date}T${time}Z` }),
    });
    setAddingId(null);
    if (!resp.ok) {
      setError('Failed to add post to calendar.');
      return;
    }
    onAdded();
  }

  return (
    <div
      role="dialog"
      aria-label="Add post to calendar"
      className="fixed inset-0 z-50 flex items-center justify-center bg-dark/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-lg bg-light p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-xl text-primary">Add post to calendar</h2>
          <button onClick={onClose} className="font-body text-sm text-muted hover:text-dark">
            Close
          </button>
        </div>

        <label className="flex items-center gap-2 font-body text-sm text-dark">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-dark/20 px-2 py-1 font-body text-sm"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setPlatformFilter('all')}
            className={`rounded-full border px-3 py-1 font-body text-xs ${
              platformFilter === 'all' ? 'border-primary bg-primary text-light' : 'border-dark/20 text-dark hover:bg-dark/5'
            }`}
          >
            All platforms
          </button>
          {platforms.map((platform) => (
            <button
              key={platform}
              onClick={() => setPlatformFilter(platform)}
              className={`rounded-full border px-3 py-1 font-body text-xs ${
                platformFilter === platform ? 'border-primary bg-primary text-light' : 'border-dark/20 text-dark hover:bg-dark/5'
              }`}
            >
              {PLATFORM_LABELS[platform] ?? platform}
            </button>
          ))}
        </div>

        {error && <p className="font-body text-sm text-red-700">{error}</p>}

        {loading ? (
          <p className="font-body text-sm text-muted">Loading posts…</p>
        ) : posts.length === 0 ? (
          <p className="font-body text-sm text-muted">No eligible posts for this filter.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {posts.map((post) => (
              <div
                key={post.id}
                className="flex items-center gap-3 rounded-md border border-dark/10 px-3 py-2"
              >
                {post.renderUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={post.renderUrl}
                    alt=""
                    className="h-12 w-12 flex-none rounded object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-body text-sm text-dark">
                    {post.caption?.slice(0, 60) || post.format}
                  </p>
                  <p className="font-body text-xs text-muted">
                    {PLATFORM_LABELS[post.platform] ?? post.platform} ·{' '}
                    <span className={`rounded px-1.5 py-0.5 ${STATE_COLORS[post.state] ?? 'bg-dark/10 text-dark'}`}>
                      {post.state}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => handleAdd(post.id)}
                  disabled={addingId === post.id}
                  className="flex-none rounded-md bg-primary px-3 py-1.5 font-body text-xs font-semibold text-light hover:opacity-90 disabled:opacity-50"
                >
                  {addingId === post.id ? 'Adding…' : 'Add'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
