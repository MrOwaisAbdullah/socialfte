"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Asset {
  id: string;
  // /api/assets returns Drizzle's .select() rows as-is, which serializes
  // with the schema's camelCase JS property names (r2Key, not r2_key) — not
  // the underlying snake_case DB column names. Matches /api/posts + its page.
  r2Key: string;
  piece: string | null;
  tier: string | null;
  variant: string | null;
  qualityScore: number | null;
  rejectReason: string | null;
  timesUsed: number;
  createdAt: string;
}

interface QueueItem {
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  id?: string;
  error?: string;
}

const R2_PUBLIC = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "https://pub-9482aec63df7420bb53018258d2b14ef.r2.dev";

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);

  useEffect(() => {
    fetch("/api/assets").then((r) => r.json()).then(setAssets).catch(() => {});
  }, []);

  const processQueue = useCallback(async (items: QueueItem[]) => {
    if (processingRef.current) return;
    processingRef.current = true;

    for (let i = 0; i < items.length; i++) {
      if (items[i].status !== "pending") continue;

      setQueue((prev) =>
        prev.map((q, idx) => (idx === i ? { ...q, status: "uploading" } : q))
      );

      try {
        const form = new FormData();
        form.append("file", items[i].file);
        const res = await fetch("/api/assets/upload", { method: "POST", body: form });
        if (res.ok) {
          const data = await res.json();
          setAssets((prev) => [
            { id: data.id, r2Key: data.url || "", piece: null, tier: null, variant: null, qualityScore: null, rejectReason: null, timesUsed: 0, createdAt: new Date().toISOString() },
            ...prev,
          ]);
          setQueue((prev) =>
            prev.map((q, idx) => (idx === i ? { ...q, status: "done", id: data.id } : q))
          );
        } else {
          const err = await res.json().catch(() => ({ error: "Upload failed" }));
          setQueue((prev) =>
            prev.map((q, idx) => (idx === i ? { ...q, status: "error", error: err.error || "Upload failed" } : q))
          );
        }
      } catch {
        setQueue((prev) =>
          prev.map((q, idx) => (idx === i ? { ...q, status: "error", error: "Network error" } : q))
        );
      }
    }

    processingRef.current = false;
  }, []);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const newItems: QueueItem[] = Array.from(files).map((file) => ({
        file,
        status: "pending" as const,
      }));
      setQueue((prev) => {
        const next = [...prev, ...newItems];
        // kick off processing on next tick so state is settled
        setTimeout(() => processQueue(next), 0);
        return next;
      });
    },
    [processQueue]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const clearDone = () => setQueue((prev) => prev.filter((q) => q.status !== "done" && q.status !== "error"));

  const pendingCount = queue.filter((q) => q.status === "pending" || q.status === "uploading").length;
  const doneCount = queue.filter((q) => q.status === "done").length;
  const errorCount = queue.filter((q) => q.status === "error").length;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl text-primary">Assets</h1>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-dark/20 hover:border-primary/40"
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <p className="font-body text-muted">
          {pendingCount > 0
            ? `Uploading ${queue.length - pendingCount + 1} of ${queue.length}...`
            : "Drag & drop images or videos here, or click to browse (multiple files supported)"}
        </p>
      </div>

      {queue.length > 0 && (
        <div className="rounded-lg border border-dark/10 bg-light p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-body text-sm text-dark">
              Queue: {doneCount} done, {pendingCount} uploading, {errorCount} failed
            </span>
            <button onClick={clearDone} className="font-body text-xs text-primary hover:underline">
              Clear completed
            </button>
          </div>
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {queue.map((item, i) => (
              <div key={i} className="flex items-center gap-2 font-body text-xs">
                <span
                  className={`h-2 w-2 rounded-full ${
                    item.status === "done"
                      ? "bg-green-500"
                      : item.status === "error"
                      ? "bg-red-500"
                      : item.status === "uploading"
                      ? "bg-yellow-500 animate-pulse"
                      : "bg-dark/20"
                  }`}
                />
                <span className="truncate text-dark">{item.file.name}</span>
                <span className="ml-auto text-muted">
                  {item.status === "done" && "Done"}
                  {item.status === "error" && item.error}
                  {item.status === "uploading" && "Uploading..."}
                  {item.status === "pending" && "Queued"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {assets.map((asset) => (
          <div key={asset.id} className="rounded-lg border border-dark/10 bg-light p-4">
            <img
              src={asset.r2Key.startsWith("http") ? asset.r2Key : `${R2_PUBLIC}/${asset.r2Key}`}
              alt={asset.piece || "Asset"}
              className="mb-2 aspect-square w-full rounded object-cover"
            />
            <div className="flex items-center justify-between text-sm">
              <span className="font-body text-dark">{asset.piece || "Untagged"}</span>
              <span className={`rounded px-2 py-0.5 text-xs ${
                asset.rejectReason ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
              }`}>
                {asset.rejectReason ? "Rejected" : "Active"}
              </span>
            </div>
            <p className="mt-1 font-body text-xs text-muted">
              Used {asset.timesUsed}x · {asset.tier || "?"} · {asset.variant || "?"}
            </p>
          </div>
        ))}
      </div>

      {assets.length === 0 && (
        <p className="font-body text-center text-muted">No assets yet. Upload some images to get started.</p>
      )}
    </div>
  );
}
