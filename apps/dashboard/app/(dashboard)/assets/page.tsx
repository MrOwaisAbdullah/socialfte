"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Asset {
  id: string;
  r2_key: string;
  piece: string | null;
  tier: string | null;
  variant: string | null;
  quality_score: number | null;
  reject_reason: string | null;
  times_used: number;
  created_at: string;
}

const R2_PUBLIC = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "https://pub-9482aec63df7420bb53018258d2b14ef.r2.dev";

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/assets").then((r) => r.json()).then(setAssets).catch(() => {});
  }, []);

  const upload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/assets/upload", { method: "POST", body: form });
      if (res.ok) {
        const data = await res.json();
        setAssets((prev) => [
          { id: data.id, r2_key: "", piece: null, tier: null, variant: null, quality_score: null, reject_reason: null, times_used: 0, created_at: new Date().toISOString() },
          ...prev,
        ]);
      }
    } finally {
      setUploading(false);
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  }, [upload]);

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
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
          }}
        />
        <p className="font-body text-muted">
          {uploading ? "Uploading..." : "Drag & drop an image or video here, or click to browse"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {assets.map((asset) => (
          <div key={asset.id} className="rounded-lg border border-dark/10 bg-light p-4">
            <img
              src={`${R2_PUBLIC}/${asset.r2_key}`}
              alt={asset.piece || "Asset"}
              className="mb-2 aspect-square w-full rounded object-cover"
            />
            <div className="flex items-center justify-between text-sm">
              <span className="font-body text-dark">{asset.piece || "Untagged"}</span>
              <span className={`rounded px-2 py-0.5 text-xs ${
                asset.reject_reason ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
              }`}>
                {asset.reject_reason ? "Rejected" : "Active"}
              </span>
            </div>
            <p className="mt-1 font-body text-xs text-muted">
              Used {asset.times_used}x · {asset.tier || "?"} · {asset.variant || "?"}
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
