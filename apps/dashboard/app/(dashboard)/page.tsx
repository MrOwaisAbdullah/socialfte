"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface ActivityEntry {
  actor: string;
  action: string;
  subjectId: string | null;
  createdAt: string;
  payload: Record<string, unknown> | null;
}

interface Stats {
  totalPosts: number;
  postsByState: Record<string, number>;
  totalAssets: number;
  recentActivity: ActivityEntry[];
  activityHasMore: boolean;
}

const ACTIVITY_PAGE_SIZE = 20;

function actorLabel(actor: string): string {
  const map: Record<string, string> = {
    compose_batch: "Compose batch",
    create_concepts: "Generate concepts",
    publish_due: "Publish approved posts",
    collect_metrics: "Collect performance metrics",
    weekly_digest: "Weekly performance digest",
    process_footage: "Process uploaded footage",
    retag_assets: "Retag assets",
    refresh_tokens: "Refresh platform tokens",
    notify_review: "Discord approval notify",
  };
  return map[actor] ?? actor.replace(/_/g, " ");
}

// Short inline summary of a payload's own fields — was rendering nothing at
// all beyond the action label, so a "batch_shortfall" entry with 14 real
// reasons in its payload looked identical to an empty one. Full JSON stays
// available on hover (title attr) for anyone who needs the raw shape.
function payloadSummary(payload: Record<string, unknown> | null): string | null {
  if (!payload || Object.keys(payload).length === 0) return null;
  const parts = Object.entries(payload).map(([k, v]) => {
    const value = Array.isArray(v) ? `${v.length} item${v.length === 1 ? "" : "s"}` : String(v);
    return `${k}: ${value.length > 60 ? value.slice(0, 60) + "…" : value}`;
  });
  const joined = parts.join(" · ");
  return joined.length > 140 ? joined.slice(0, 140) + "…" : joined;
}

const STATE_COLORS: Record<string, string> = {
  draft: "bg-dark/10 text-dark",
  render: "bg-blue-100 text-blue-700",
  review: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  publish: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  skipped: "bg-dark/20 text-muted",
};

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" /><polyline points="21 3 21 9 15 9" />
    </svg>
  );
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    post_composed: "Post composed",
    post_approved: "Post approved",
    post_skipped: "Post skipped",
    post_deleted: "Post deleted",
    posts_bulk_deleted: "Posts bulk deleted",
    post_rescheduled: "Post rescheduled",
    caption_generated: "Caption generated",
    caption_humanizer_rejected: "Caption rejected",
    caption_reviewed: "Caption reviewed",
    asset_tagged: "Asset tagged",
    asset_quality_checked: "Asset quality checked",
    asset_marked_missing: "Asset marked missing",
    cover_frame_selected: "Cover frame selected",
    caption_edited: "Caption edited",
    manual_trigger: "Manual trigger",
    batch_shortfall: "Batch shortfall",
    dispatch_render: "Video render dispatched",
    render_complete: "Render complete",
  };
  return map[action]?.replace(/_/g, " ") ?? action.replace(/_/g, " ");
}

function actionColor(action: string): string {
  if (action.includes("failed") || action.includes("rejected") || action.includes("missing")) return "bg-red-100 text-red-700";
  if (action.includes("approved") || action.includes("composed") || action.includes("tagged") || action.includes("complete")) return "bg-green-100 text-green-700";
  if (action.includes("deleted") || action.includes("skipped")) return "bg-dark/10 text-dark";
  return "bg-blue-100 text-blue-700";
}

// recentActivity arrives as a flat, newest-first list with no link between
// entries from the same job run — was rendered as one long undifferentiated
// list, so a compose_batch run's 6 sub-events (caption generated, anti-repeat
// checked, post composed...) read identically to 6 unrelated things
// happening. `actor` (already written by every write_audit() call, just
// never selected by this page before) is the natural "which pipeline"
// grouping key — bucket consecutive same-actor entries together instead.
function groupByActor(entries: ActivityEntry[]): { actor: string; entries: ActivityEntry[] }[] {
  const groups: { actor: string; entries: ActivityEntry[] }[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.actor === entry.actor) {
      last.entries.push(entry);
    } else {
      groups.push({ actor: entry.actor, entries: [entry] });
    }
  }
  return groups;
}

export default function HomePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activityOffset, setActivityOffset] = useState(ACTIVITY_PAGE_SIZE);

  const fetchStats = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const res = await fetch(`/api/stats?activityLimit=${ACTIVITY_PAGE_SIZE}&activityOffset=0`);
      if (res.ok) {
        setStats(await res.json());
        setActivityOffset(ACTIVITY_PAGE_SIZE);
      }
    } catch {}
    setRefreshing(false);
  }, []);

  const loadMoreActivity = useCallback(async () => {
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/stats?activityLimit=${ACTIVITY_PAGE_SIZE}&activityOffset=${activityOffset}`);
      if (res.ok) {
        const data: Stats = await res.json();
        setStats((prev) =>
          prev
            ? { ...prev, recentActivity: [...prev.recentActivity, ...data.recentActivity], activityHasMore: data.activityHasMore }
            : data
        );
        setActivityOffset((prev) => prev + ACTIVITY_PAGE_SIZE);
      }
    } catch {}
    setLoadingMore(false);
  }, [activityOffset]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl text-primary">Dashboard</h1>
          <p className="mt-1 font-body text-sm text-muted">
            Overview of your social media automation system.
          </p>
        </div>
        <button
          onClick={() => fetchStats(true)}
          className="flex items-center gap-1.5 rounded bg-dark/10 px-3 py-1.5 font-body text-sm text-dark hover:bg-dark/20"
        >
          <RefreshIcon spinning={refreshing} />
          Refresh
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-dark/10 bg-light p-5">
          <p className="font-body text-xs uppercase tracking-wider text-muted">Total Posts</p>
          <p className="mt-1 font-heading text-3xl text-primary">{stats?.totalPosts ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-dark/10 bg-light p-5">
          <p className="font-body text-xs uppercase tracking-wider text-muted">Total Assets</p>
          <p className="mt-1 font-heading text-3xl text-primary">{stats?.totalAssets ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-dark/10 bg-light p-5">
          <p className="font-body text-xs uppercase tracking-wider text-muted">Ready to Publish</p>
          <p className="mt-1 font-heading text-3xl text-green-700">
            {stats ? (stats.postsByState["approved"] ?? 0) + (stats.postsByState["review"] ?? 0) : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-dark/10 bg-light p-5">
          <p className="font-body text-xs uppercase tracking-wider text-muted">Failed</p>
          <p className="mt-1 font-heading text-3xl text-red-600">
            {stats?.postsByState["failed"] ?? "—"}
          </p>
        </div>
      </div>

      {/* Posts by state breakdown */}
      {stats && Object.keys(stats.postsByState).length > 0 && (
        <div className="rounded-lg border border-dark/10 bg-light p-5">
          <h2 className="font-heading text-lg text-primary">Posts by State</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            {Object.entries(stats.postsByState)
              .sort(([, a], [, b]) => b - a)
              .map(([state, count]) => (
                <div key={state} className="flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${STATE_COLORS[state] ?? "bg-dark/10 text-dark"}`}>
                    {state}
                  </span>
                  <span className="font-body text-sm text-dark">{count}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/posts"
          className="rounded-lg border border-dark/10 bg-light p-5 transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          <h2 className="font-heading text-xl text-primary">Posts</h2>
          <p className="mt-1 font-body text-sm text-muted">
            View, filter, and manage all drafted and published posts across every platform.
          </p>
        </Link>
        <Link
          href="/assets"
          className="rounded-lg border border-dark/10 bg-light p-5 transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          <h2 className="font-heading text-xl text-primary">Assets</h2>
          <p className="mt-1 font-body text-sm text-muted">
            Upload and manage your product photos and video clips.
          </p>
        </Link>
        <Link
          href="/calendar"
          className="rounded-lg border border-dark/10 bg-light p-5 transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          <h2 className="font-heading text-xl text-primary">Calendar</h2>
          <p className="mt-1 font-body text-sm text-muted">
            See what&apos;s scheduled across every platform this week, drag to reschedule.
          </p>
        </Link>
        <Link
          href="/performance"
          className="rounded-lg border border-dark/10 bg-light p-5 transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          <h2 className="font-heading text-xl text-primary">Performance</h2>
          <p className="mt-1 font-body text-sm text-muted">
            Engagement metrics for published posts, collected every 6 hours.
          </p>
        </Link>
        <Link
          href="/jobs"
          className="rounded-lg border border-dark/10 bg-light p-5 transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          <h2 className="font-heading text-xl text-primary">Jobs</h2>
          <p className="mt-1 font-body text-sm text-muted">
            View cron schedules, run jobs on demand, and edit schedules.
          </p>
        </Link>
        <Link
          href="/setup"
          className="rounded-lg border border-dark/10 bg-light p-5 transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          <h2 className="font-heading text-xl text-primary">Setup</h2>
          <p className="mt-1 font-body text-sm text-muted">
            Configure brand colors, fonts, platform connections, and more.
          </p>
        </Link>
      </div>

      {/* Recent activity */}
      {stats && stats.recentActivity.length > 0 && (
        <div className="rounded-lg border border-dark/10 bg-light p-5">
          <h2 className="font-heading text-lg text-primary">Recent Activity</h2>
          <div className="mt-3 flex flex-col gap-3">
            {groupByActor(stats.recentActivity).map((group, gi) => (
              <div key={gi} className="rounded-md border border-dark/5 bg-dark/[0.02] p-3">
                <div className="flex items-center gap-2">
                  <span className="font-body text-xs font-semibold uppercase tracking-wide text-primary">
                    {actorLabel(group.actor)}
                  </span>
                  <span className="font-body text-xs text-muted">
                    {group.entries.length} event{group.entries.length === 1 ? "" : "s"}
                  </span>
                  <span className="ml-auto shrink-0 font-body text-xs text-muted">
                    {new Date(group.entries[0].createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="mt-2 flex flex-col gap-1.5">
                  {group.entries.map((entry, i) => {
                    const summary = payloadSummary(entry.payload);
                    return (
                      <div key={i} className="flex flex-wrap items-start gap-2 text-sm">
                        <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${actionColor(entry.action)}`}>
                          {actionLabel(entry.action)}
                        </span>
                        {entry.subjectId && (
                          <span className="font-body text-xs text-muted">{entry.subjectId.slice(0, 8)}...</span>
                        )}
                        {summary && (
                          <span
                            className="max-w-[420px] truncate font-body text-xs text-muted/80"
                            title={JSON.stringify(entry.payload)}
                          >
                            {summary}
                          </span>
                        )}
                        <span className="ml-auto shrink-0 font-body text-xs text-muted">
                          {new Date(entry.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {stats.activityHasMore && (
            <button
              onClick={loadMoreActivity}
              disabled={loadingMore}
              className="mt-4 w-full rounded bg-dark/10 px-3 py-1.5 font-body text-sm text-dark hover:bg-dark/20 disabled:opacity-50"
            >
              {loadingMore ? "Loading..." : "See more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
