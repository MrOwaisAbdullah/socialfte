'use client';

// "Add to calendar" picker — opened from a specific day×platform cell on the
// calendar grid, so the target date and platform are fixed by which cell you
// clicked, not picked separately (a separate date/platform picker let you
// schedule a post onto a week you weren't looking at, so a successful
// reschedule could look like nothing happened). Two sections:
//  - Reschedule: same-platform posts not yet published/rejected, moved onto
//    this exact date via the same PATCH /api/posts/[id] path drag-and-drop uses.
//  - Cross-publish: posts from OTHER platforms whose render format this
//    platform actually supports (see lib/platform-formats.ts) — duplicates
//    the post onto this platform/date via POST /api/posts/[id]/duplicate
//    instead of moving it, since the source post's own slot must stay put.
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

function formatScheduled(iso: string | null): string {
  if (!iso) return 'Not yet scheduled';
  const d = new Date(iso);
  return `Currently: ${d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`;
}

function PostRow({
  post,
  busy,
  onAdd,
  crossPublish,
}: {
  post: SchedulablePost;
  busy: boolean;
  onAdd: () => void;
  crossPublish?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-dark/10 px-3 py-2">
      {post.renderUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.renderUrl} alt="" className="h-12 w-12 flex-none rounded object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-body text-sm text-dark">{post.caption?.slice(0, 60) || post.format}</p>
        <p className="font-body text-xs text-muted">
          {crossPublish ? `From ${PLATFORM_LABELS[post.platform] ?? post.platform} · ` : ''}
          <span className={`rounded px-1.5 py-0.5 ${STATE_COLORS[post.state] ?? 'bg-dark/10 text-dark'}`}>{post.state}</span>
          {' · '}
          {formatScheduled(post.scheduledAt)}
        </p>
      </div>
      <button
        onClick={onAdd}
        disabled={busy}
        className="flex-none rounded-md bg-primary px-3 py-1.5 font-body text-xs font-semibold text-light hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'Adding…' : crossPublish ? 'Cross-publish' : 'Add'}
      </button>
    </div>
  );
}

export default function AddToCalendarModal({
  date,
  platform,
  onClose,
  onAdded,
}: {
  date: string;
  platform: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [posts, setPosts] = useState<SchedulablePost[]>([]);
  const [crossPosts, setCrossPosts] = useState<SchedulablePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(`/api/posts?schedulable=1&platform=${platform}`).then((r) => r.json()),
      fetch(`/api/posts?schedulable=1&crossPublishTo=${platform}`).then((r) => r.json()),
    ])
      .then(([same, cross]: [SchedulablePost[], SchedulablePost[]]) => {
        if (!cancelled) {
          setPosts(same);
          setCrossPosts(cross);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [platform]);

  async function handleReschedule(post: SchedulablePost) {
    setBusyId(post.id);
    setError(null);
    const time = post.scheduledAt ? post.scheduledAt.slice(11, 19) : '12:00:00';
    const resp = await fetch(`/api/posts/${post.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledAt: `${date}T${time}Z` }),
    });
    setBusyId(null);
    if (!resp.ok) {
      setError('Failed to add post to calendar.');
      return;
    }
    onAdded();
  }

  async function handleCrossPublish(post: SchedulablePost) {
    setBusyId(post.id);
    setError(null);
    const time = post.scheduledAt ? post.scheduledAt.slice(11, 19) : '12:00:00';
    const resp = await fetch(`/api/posts/${post.id}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, scheduledAt: `${date}T${time}Z` }),
    });
    setBusyId(null);
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      setError(body.error || 'Failed to cross-publish post.');
      return;
    }
    onAdded();
  }

  const dateLabel = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

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
          <h2 className="font-heading text-xl text-primary">
            Add to {PLATFORM_LABELS[platform] ?? platform} · {dateLabel}
          </h2>
          <button onClick={onClose} className="font-body text-sm text-muted hover:text-dark">
            Close
          </button>
        </div>

        {error && <p className="font-body text-sm text-red-700">{error}</p>}

        {loading ? (
          <p className="font-body text-sm text-muted">Loading posts…</p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <h3 className="font-body text-xs font-semibold uppercase tracking-wider text-muted">
                {PLATFORM_LABELS[platform] ?? platform} posts
              </h3>
              {posts.length === 0 ? (
                <p className="font-body text-sm text-muted">No eligible posts for this platform.</p>
              ) : (
                posts.map((post) => (
                  <PostRow key={post.id} post={post} busy={busyId === post.id} onAdd={() => handleReschedule(post)} />
                ))
              )}
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="font-body text-xs font-semibold uppercase tracking-wider text-muted">
                Cross-publish from another platform
              </h3>
              {crossPosts.length === 0 ? (
                <p className="font-body text-sm text-muted">
                  No other-platform posts with a format {PLATFORM_LABELS[platform] ?? platform} supports.
                </p>
              ) : (
                crossPosts.map((post) => (
                  <PostRow
                    key={post.id}
                    post={post}
                    busy={busyId === post.id}
                    onAdd={() => handleCrossPublish(post)}
                    crossPublish
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
