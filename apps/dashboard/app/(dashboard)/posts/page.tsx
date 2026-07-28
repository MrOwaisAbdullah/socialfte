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
const PLATFORMS = ["facebook", "instagram", "youtube_shorts", "tiktok"];

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

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

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
              className="flex items-start gap-4 rounded-lg border border-dark/10 bg-light p-4"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded bg-dark/5 font-heading text-lg text-primary">
                {platformIcon(post.platform)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-body text-sm font-medium capitalize">{post.platform.replace("_", " ")}</span>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${stateColor(post.state)}`}>
                    {post.state}
                  </span>
                  {post.renderUrl && (
                    <a
                      href={post.renderUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary underline"
                    >
                      View
                    </a>
                  )}
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
                  <p className="mt-1 font-body text-xs text-red-500">{post.error}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
