"use client";

import { useCallback, useEffect, useState } from "react";

interface Settings {
  targetPlatforms: string[];
}

const ALL_PLATFORMS = [
  { id: "facebook", label: "Facebook", icon: "f" },
  { id: "instagram", label: "Instagram", icon: "●" },
  { id: "youtube_shorts", label: "YouTube Shorts", icon: "▶" },
  { id: "tiktok", label: "TikTok", icon: "♪" },
];

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" /><polyline points="21 3 21 9 15 9" />
    </svg>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({ targetPlatforms: [] });
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchSettings = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings({
          targetPlatforms: data.targetPlatforms || [],
        });
      }
    } catch {}
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const togglePlatform = (platformId: string) => {
    setSettings((prev) => {
      const current = prev.targetPlatforms;
      const next = current.includes(platformId)
        ? current.filter((p) => p !== platformId)
        : [...current, platformId];
      return { ...prev, targetPlatforms: next };
    });
  };

  const saveSettings = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setMessage("Settings saved successfully");
      } else {
        setMessage("Failed to save settings");
      }
    } catch {
      setMessage("Failed to save settings");
    }
    setSaving(false);
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl text-primary">Settings</h1>
          <p className="mt-1 font-body text-sm text-muted">
            Configure which platforms to create posts for.
          </p>
        </div>
        <button
          onClick={() => fetchSettings(true)}
          className="flex items-center gap-1.5 rounded bg-dark/10 px-3 py-1.5 font-body text-sm text-dark hover:bg-dark/20"
        >
          <RefreshIcon spinning={refreshing} />
          Refresh
        </button>
      </div>

      <div className="rounded-lg border border-line bg-light p-6">
        <h2 className="font-heading text-xl text-dark mb-4">Target Platforms</h2>
        <p className="font-body text-sm text-muted mb-4">
          Select which platforms to create posts for. If no platforms are connected, posts will be created for all selected platforms.
        </p>
        <div className="grid grid-cols-2 gap-4">
          {ALL_PLATFORMS.map((platform) => (
            <button
              key={platform.id}
              onClick={() => togglePlatform(platform.id)}
              className={`flex items-center gap-3 rounded-lg border-2 p-4 transition-all ${
                settings.targetPlatforms.includes(platform.id)
                  ? "border-primary bg-primary/10"
                  : "border-line bg-white hover:border-dark/20"
              }`}
            >
              <span className="text-2xl">{platform.icon}</span>
              <div className="text-left">
                <div className="font-body font-medium text-dark">{platform.label}</div>
                <div className="font-body text-xs text-muted">
                  {settings.targetPlatforms.includes(platform.id) ? "Selected" : "Not selected"}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={saveSettings}
          disabled={saving}
          className="rounded bg-primary px-6 py-2 font-body text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
        {message && (
          <span className={`font-body text-sm ${message.includes("success") ? "text-green-600" : "text-red-600"}`}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
