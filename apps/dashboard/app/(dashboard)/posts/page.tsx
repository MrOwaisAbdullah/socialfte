"use client";

import { useCallback, useEffect, useState } from "react";

interface Post {
  id: string;
  platform: string;
  format: string;
  state: string;
  caption: string | null;
  renderUrl: string | null;
  scheduledAt: string | null;
  externalId: string | null;
  error: string | null;
  createdAt: string | null;
  templateId: string | null;
  assetId: string | null;
  templateSlug: string | null;
  templateDisplayName: string | null;
}

const STATES = ["draft", "render", "review", "approved", "publish", "failed"];
const VIDEO_FORMATS = new Set(["reel", "short", "video"]);

function stateColor(state: string): string {
  const map: Record<string, string> = {
    draft: "bg-dark/10 text-dark",
    render: "bg-blue-100 text-blue-700",
    review: "bg-yellow-100 text-yellow-700",
    approved: "bg-green-100 text-green-700",
    publish: "bg-emerald-100 text-emerald-700",
    failed: "bg-red-100 text-red-700",
  };
  return map[state] || "bg-dark/10 text-dark";
}

function platformIcon(p: string): string {
  const map: Record<string, string> = {
    facebook: "f",
    instagram: "\u25cf",
    youtube_shorts: "\u25b6",
    tiktok: "\u266b",
  };
  return map[p] || "?";
}

function isVideo(post: Post): boolean {
  return VIDEO_FORMATS.has(post.format) || (post.renderUrl?.endsWith(".mp4") ?? false);
}

function PostMedia({ post, className }: { post: Post; className: string }) {
  if (!post.renderUrl) {
    return (
      <div className={`${className} flex items-center justify-center bg-dark/5 text-2xl text-dark/30`}>
        {platformIcon(post.platform)}
      </div>
    );
  }
  return isVideo(post) ? (
    <video src={post.renderUrl} className={className} muted playsInline preload="metadata" />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={post.renderUrl} alt="" className={className} />
  );
}

function PostDetailModal({ post, onClose, onDelete }: { post: Post; onClose: () => void; onDelete: (id: string) => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-dark/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col gap-4 overflow-y-auto rounded-lg bg-light p-6 sm:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:w-1/2">
          {post.renderUrl ? (
            isVideo(post) ? (
              <video src={post.renderUrl} className="w-full rounded" controls autoPlay muted playsInline />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.renderUrl} alt="" className="w-full rounded" />
            )
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded bg-dark/5 font-body text-sm text-muted">
              No render yet ({post.state})
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-body text-sm font-medium capitalize">{post.platform.replace("_", " ")}</span>
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${stateColor(post.state)}`}>{post.state}</span>
              {post.templateDisplayName && (
                <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {post.templateDisplayName}
                </span>
              )}
              {post.templateSlug && !post.templateDisplayName && (
                <span className="rounded bg-dark/10 px-2 py-0.5 text-xs font-medium text-dark">
                  {post.templateSlug}
                </span>
              )}
            </div>
            <button onClick={onClose} className="font-body text-sm text-muted hover:text-dark">
              Close
            </button>
          </div>
          {post.caption && (
            <p className="whitespace-pre-wrap font-body text-sm text-dark">{post.caption}</p>
          )}
          <div className="flex flex-col gap-1 font-body text-xs text-muted">
            {post.scheduledAt && <span>Scheduled: {new Date(post.scheduledAt).toLocaleString()}</span>}
            {post.externalId && <span>Platform ID: {post.externalId}</span>}
            {post.createdAt && <span>Created: {new Date(post.createdAt).toLocaleString()}</span>}
            {post.templateId && <span>Template ID: {post.templateId}</span>}
            {post.assetId && <span>Asset ID: {post.assetId}</span>}
          </div>
          {post.error && <p className="font-body text-xs text-red-600">{post.error}</p>}
          <div className="flex items-center gap-3">
            {post.renderUrl && (
              <a
                href={post.renderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-body text-xs text-primary underline"
              >
                Open original file
              </a>
            )}
            <button
              onClick={() => { onDelete(post.id); onClose(); }}
              className="ml-auto rounded bg-red-600 px-3 py-1 font-body text-xs text-white hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState<"approved" | "failed" | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [composing, setComposing] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  useEffect(() => {
    fetchPosts();
  }, [filter]);

  // Triggering compose_batch used to mean leaving this page for /jobs, finding
  // it in the list, and clicking "Run Now" there — the run button belongs on
  // the page where its output actually shows up. Same fire-and-poll pattern
  // as the Jobs page: the run endpoint only dispatches the job and returns
  // immediately, so we poll for it to actually finish before refetching posts.
  const runCompose = async () => {
    setComposing(true);
    setComposeError(null);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: "compose_batch" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setComposeError(data.detail || "Failed to start compose_batch");
        return;
      }
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000));
        const jobsRes = await fetch("/api/jobs");
        if (!jobsRes.ok) break;
        const data = await jobsRes.json();
        if (!Array.isArray(data)) break;
        const job = data.find((j: { id: string; last_run: { status: string } | null }) => j.id === "compose_batch");
        if (job?.last_run?.status && job.last_run.status !== "running") break;
      }
      await fetchPosts(true);
    } catch {
      setComposeError("Could not reach worker");
    } finally {
      setComposing(false);
    }
  };

  const fetchPosts = async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    else setLoading(true);
    const url = filter ? `/api/posts?state=${filter}` : "/api/posts";
    try {
      const res = await fetch(url);
      if (res.ok) setPosts(await res.json());
    } catch {}
    setLoading(false);
    setRefreshing(false);
  };

  const deletePost = useCallback(async (id: string) => {
    if (!confirm("Delete this post? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
      if (res.ok) {
        setPosts((prev) => prev.filter((p) => p.id !== id));
        setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
      } else {
        const err = await res.json().catch(() => ({ error: "Delete failed" }));
        alert(err.error || "Delete failed");
      }
    } catch {
      alert("Network error while deleting");
    }
  }, []);

  const updatePostState = useCallback(async (id: string, state: string) => {
    try {
      const res = await fetch(`/api/posts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state }),
      });
      if (res.ok) {
        setPosts((prev) => prev.map((p) => p.id === id ? { ...p, state } : p));
      } else {
        const err = await res.json().catch(() => ({ error: "Update failed" }));
        alert(err.error || "Update failed");
      }
    } catch {
      alert("Network error");
    }
  }, []);

  // Reuses the same per-post PATCH the individual Approve/Reject buttons use
  // (parallel calls, not a dedicated bulk-state endpoint) so bulk approval
  // gets the concept-retirement side effect (see /api/posts/[id]) for free
  // instead of duplicating that logic in a second code path.
  const bulkUpdateState = useCallback(async (state: "approved" | "failed") => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setBulkUpdating(state);
    try {
      const results = await Promise.all(
        ids.map((id) =>
          fetch(`/api/posts/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ state }),
          }).then((res) => ({ id, ok: res.ok }))
        )
      );
      const succeeded = new Set(results.filter((r) => r.ok).map((r) => r.id));
      setPosts((prev) => prev.map((p) => (succeeded.has(p.id) ? { ...p, state } : p)));
      const failedCount = results.length - succeeded.size;
      if (failedCount > 0) alert(`${failedCount} post(s) failed to update.`);
      setSelected(new Set());
    } catch {
      alert("Network error during bulk update");
    } finally {
      setBulkUpdating(null);
    }
  }, [selected]);

  const bulkDelete = useCallback(async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} post(s)? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      const res = await fetch("/api/posts/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        setPosts((prev) => prev.filter((p) => !selected.has(p.id)));
        setSelected(new Set());
      } else {
        const err = await res.json().catch(() => ({ error: "Bulk delete failed" }));
        alert(err.error || "Bulk delete failed");
      }
    } catch {
      alert("Network error while deleting");
    } finally {
      setBulkDeleting(false);
    }
  }, [selected]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === posts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(posts.map((p) => p.id)));
    }
  };

  const hasSelection = selected.size > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-3xl text-primary">Posts</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={runCompose}
            disabled={composing}
            className="flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 font-body text-sm text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {composing ? "Composing..." : "Compose"}
          </button>
          <button
            onClick={() => fetchPosts(true)}
            className="flex items-center gap-1.5 rounded bg-dark/10 px-3 py-1.5 font-body text-sm text-dark hover:bg-dark/20"
          >
            <svg className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" /><polyline points="21 3 21 9 15 9" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {composeError && (
        <div className="rounded bg-red-50 p-3 font-body text-sm text-red-700 border border-red-200">
          {composeError}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFilter("")}
          className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
            filter === "" ? "bg-primary text-white" : "bg-dark/10 text-dark hover:bg-dark/20"
          }`}
        >
          All
        </button>
        {STATES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-sm font-medium capitalize transition-colors ${
              filter === s ? "bg-primary text-white" : "bg-dark/10 text-dark hover:bg-dark/20"
            }`}
          >
            {s}
          </button>
        ))}

        {hasSelection && (
          <div className="ml-auto flex items-center gap-2">
            <span className="font-body text-sm text-muted">{selected.size} selected</span>
            <button
              onClick={() => bulkUpdateState("approved")}
              disabled={bulkUpdating !== null}
              className="rounded bg-green-600 px-3 py-1 font-body text-sm text-white hover:bg-green-700 disabled:opacity-50"
            >
              {bulkUpdating === "approved" ? "Approving..." : "Approve selected"}
            </button>
            <button
              onClick={() => bulkUpdateState("failed")}
              disabled={bulkUpdating !== null}
              className="rounded bg-dark/60 px-3 py-1 font-body text-sm text-white hover:bg-dark/70 disabled:opacity-50"
            >
              {bulkUpdating === "failed" ? "Rejecting..." : "Reject selected"}
            </button>
            <button
              onClick={bulkDelete}
              disabled={bulkDeleting}
              className="rounded bg-red-600 px-3 py-1 font-body text-sm text-white hover:bg-red-700 disabled:opacity-50"
            >
              {bulkDeleting ? "Deleting..." : "Delete selected"}
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="font-body text-muted">Loading...</p>
      ) : posts.length === 0 ? (
        <p className="font-body text-muted">No posts found.</p>
      ) : (
        <div className="grid gap-3">
          <div className="flex items-center gap-3 rounded-lg border border-dark/10 bg-dark/5 px-4 py-2">
            <input
              type="checkbox"
              checked={selected.size === posts.length && posts.length > 0}
              onChange={toggleSelectAll}
              className="h-4 w-4 rounded border-dark/30"
            />
            <span className="font-body text-xs text-muted">Select all</span>
          </div>
          {posts.map((post) => (
            <div
              key={post.id}
              className={`flex items-start gap-4 rounded-lg border bg-light p-4 transition-colors ${
                selected.has(post.id) ? "border-primary" : "border-dark/10 hover:border-primary/40"
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(post.id)}
                onChange={() => toggleSelect(post.id)}
                className="mt-1 h-4 w-4 rounded border-dark/30"
              />
              <div
                className="min-w-0 flex-1 cursor-pointer"
                onClick={() => setSelectedPost(post)}
              >
                <PostMedia post={post} className="mb-2 h-14 w-14 rounded object-cover" />
                <div className="flex items-center gap-2">
                  <span className="font-body text-sm font-medium capitalize">{post.platform.replace("_", " ")}</span>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${stateColor(post.state)}`}>
                    {post.state}
                  </span>
                </div>
                {post.caption && (
                  <p className="mt-1 font-body text-sm text-dark line-clamp-2">{post.caption}</p>
                )}
                <div className="mt-1 flex items-center gap-3 font-body text-xs text-muted">
                  {post.scheduledAt && <span>Scheduled: {new Date(post.scheduledAt).toLocaleDateString()}</span>}
                  {post.createdAt && <span>Created: {new Date(post.createdAt).toLocaleDateString()}</span>}
                </div>
                {post.error && (
                  <p className="mt-1 font-body text-xs text-red-500 line-clamp-1">{post.error}</p>
                )}
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                {/* Manual override, not gated to state === "review" — a post
                    that landed in draft/render/failed/skipped (an anti-repeat
                    rejection, a render hiccup, a manual reject) had no way
                    back to approved from here at all before; the operator
                    should always be able to push a post through by hand. */}
                {post.state !== "approved" && post.state !== "publish" && (
                  <button
                    onClick={() => updatePostState(post.id, "approved")}
                    className="rounded bg-green-600 px-2 py-1 font-body text-xs text-white hover:bg-green-700"
                  >
                    Approve
                  </button>
                )}
                {post.state !== "failed" && post.state !== "publish" && (
                  <button
                    onClick={() => updatePostState(post.id, "failed")}
                    className="rounded bg-red-600 px-2 py-1 font-body text-xs text-white hover:bg-red-700"
                  >
                    Reject
                  </button>
                )}
                <button
                  onClick={() => deletePost(post.id)}
                  className="rounded bg-dark/10 px-2 py-1 font-body text-xs text-dark hover:bg-dark/20"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedPost && (
        <PostDetailModal
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onDelete={deletePost}
        />
      )}
    </div>
  );
}
