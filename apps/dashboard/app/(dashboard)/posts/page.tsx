"use client";

import { useEffect, useState } from "react";

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
    instagram: "●",
    youtube_shorts: "▶",
    tiktok: "♫",
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

function PostDetailModal({ post, onClose }: { post: Post; onClose: () => void }) {
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
          </div>
          {post.error && <p className="font-body text-xs text-red-600">{post.error}</p>}
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

  useEffect(() => {
    setLoading(true);
    const url = filter ? `/api/posts?state=${filter}` : "/api/posts";
    fetch(url)
      .then((r) => r.json())
      .then(setPosts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl text-primary">Posts</h1>

      <div className="flex flex-wrap gap-2">
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
      </div>

      {loading ? (
        <p className="font-body text-muted">Loading...</p>
      ) : posts.length === 0 ? (
        <p className="font-body text-muted">No posts found.</p>
      ) : (
        <div className="grid gap-3">
          {posts.map((post) => (
            <div
              key={post.id}
              onClick={() => setSelectedPost(post)}
              className="flex cursor-pointer items-start gap-4 rounded-lg border border-dark/10 bg-light p-4 transition-colors hover:border-primary/40"
            >
              <PostMedia post={post} className="h-14 w-14 shrink-0 rounded object-cover" />

              <div className="min-w-0 flex-1">
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
                  {post.externalId && <span>ID: {post.externalId.slice(0, 8)}...</span>}
                  {post.createdAt && <span>Created: {new Date(post.createdAt).toLocaleDateString()}</span>}
                </div>
                {post.error && (
                  <p className="mt-1 font-body text-xs text-red-500 line-clamp-1">{post.error}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedPost && <PostDetailModal post={selectedPost} onClose={() => setSelectedPost(null)} />}
    </div>
  );
}
