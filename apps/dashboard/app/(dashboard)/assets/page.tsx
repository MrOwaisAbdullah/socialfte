"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Asset {
  id: string;
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
  const [brokenIds, setBrokenIds] = useState<Set<string>>(new Set());
  const [deleteStatus, setDeleteStatus] = useState<Record<string, "deleting" | "error">>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);

  useEffect(() => {
    fetchAssets();
  }, []);

  const fetchAssets = async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const res = await fetch("/api/assets");
      if (res.ok) setAssets(await res.json());
    } catch {}
    setRefreshing(false);
  };

  const deleteAsset = useCallback(async (id: string, piece: string | null) => {
    if (!confirm(`Delete ${piece || "this asset"}? This cannot be undone.`)) return;
    setDeleteStatus((prev) => ({ ...prev, [id]: "deleting" }));
    try {
      const res = await fetch(`/api/assets/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Delete failed" }));
        setDeleteStatus((prev) => { const next = { ...prev }; delete next[id]; return next; });
        alert(err.error || "Delete failed");
        return;
      }
      setAssets((prev) => prev.filter((a) => a.id !== id));
      setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
    } catch {
      setDeleteStatus((prev) => { const next = { ...prev }; delete next[id]; return next; });
      alert("Network error while deleting");
    }
  }, []);

  const bulkDelete = useCallback(async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} asset(s)? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      const res = await fetch("/api/assets/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        setAssets((prev) => prev.filter((a) => !selected.has(a.id)));
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

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    let continueLoop = true;
    while (continueLoop) {
      continueLoop = false;

      const snapshot = await new Promise<QueueItem[]>((resolve) => {
        setQueue((prev) => {
          resolve(prev);
          return prev;
        });
      });

      for (let i = 0; i < snapshot.length; i++) {
        if (snapshot[i].status !== "pending") continue;
        continueLoop = true;

        setQueue((prev) =>
          prev.map((q, idx) => (idx === i ? { ...q, status: "uploading" } : q))
        );

        try {
          const form = new FormData();
          form.append("file", snapshot[i].file);
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
    }

    processingRef.current = false;
  }, []);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const newItems: QueueItem[] = Array.from(files).map((file) => ({
        file,
        status: "pending" as const,
      }));
      setQueue((prev) => [...prev, ...newItems]);
      setTimeout(() => processQueue(), 0);
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

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === assets.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(assets.map((a) => a.id)));
    }
  };

  const pendingCount = queue.filter((q) => q.status === "pending" || q.status === "uploading").length;
  const doneCount = queue.filter((q) => q.status === "done").length;
  const errorCount = queue.filter((q) => q.status === "error").length;
  const hasSelection = selected.size > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-3xl text-primary">Assets</h1>
        <button
          onClick={() => fetchAssets(true)}
          className="flex items-center gap-1.5 rounded bg-dark/10 px-3 py-1.5 font-body text-sm text-dark hover:bg-dark/20"
        >
          <svg className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" /><polyline points="21 3 21 9 15 9" />
          </svg>
          Refresh
        </button>
      </div>

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

      {assets.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-dark/10 bg-dark/5 px-4 py-2">
          <input
            type="checkbox"
            checked={selected.size === assets.length}
            onChange={toggleSelectAll}
            className="h-4 w-4 rounded border-dark/30"
          />
          <span className="font-body text-xs text-muted">Select all</span>
          {hasSelection && (
            <div className="ml-auto flex items-center gap-2">
              <span className="font-body text-sm text-muted">{selected.size} selected</span>
              <button
                onClick={bulkDelete}
                disabled={bulkDeleting}
                className="flex items-center gap-1.5 rounded bg-red-600 px-3 py-1 font-body text-sm text-white hover:bg-red-700 disabled:opacity-50"
              >
                {bulkDeleting && (
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                )}
                {bulkDeleting ? "Deleting..." : "Delete selected"}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {assets.map((asset) => {
          const broken = brokenIds.has(asset.id);
          const status = deleteStatus[asset.id];
          return (
            <div
              key={asset.id}
              className={`rounded-lg border bg-light p-4 transition-colors ${
                selected.has(asset.id) ? "border-primary" : "border-dark/10"
              }`}
            >
              <div className="relative mb-2">
                <input
                  type="checkbox"
                  checked={selected.has(asset.id)}
                  onChange={() => toggleSelect(asset.id)}
                  className="absolute left-1 top-1 z-10 h-4 w-4 rounded border-dark/30 bg-white/80"
                />
                {broken ? (
                  <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded bg-red-50 text-center">
                    <span className="font-body text-xs text-red-700">Image unavailable</span>
                  </div>
                ) : (
                  <img
                    src={asset.r2Key.startsWith("http") ? asset.r2Key : `${R2_PUBLIC}/${asset.r2Key}`}
                    alt={asset.piece || "Asset"}
                    className="aspect-square w-full rounded object-cover"
                    onError={() => setBrokenIds((prev) => new Set(prev).add(asset.id))}
                  />
                )}
              </div>
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
              <button
                onClick={() => deleteAsset(asset.id, asset.piece)}
                disabled={status === "deleting"}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded bg-red-600 py-1 font-body text-xs text-white hover:bg-red-700 disabled:opacity-50"
              >
                {status === "deleting" && (
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                )}
                {status === "deleting" ? "Deleting..." : "Delete"}
              </button>
            </div>
          );
        })}
      </div>

      {assets.length === 0 && (
        <p className="font-body text-center text-muted">No assets yet. Upload some images to get started.</p>
      )}
    </div>
  );
}
