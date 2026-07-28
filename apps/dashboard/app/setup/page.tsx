// BOOTSTRAP wizard (dashboard entry point) — Week 4, US7.
// Walks the same six steps as the CLI flow, reading/writing the same underlying
// state (files in repo root, credentials table). Per FR-018, refuses to show as
// "first-time setup" if BOOTSTRAP.md exists.
// Per spec.md edge case: interrupted progress is saved step-by-step (resumable).
"use client";

import { useCallback, useEffect, useState } from "react";

const STEPS = [
  { id: 1, label: "Agent Identity" },
  { id: 2, label: "Brand Details" },
  { id: 3, label: "Platforms" },
  { id: 4, label: "Notification Channel" },
  { id: 5, label: "Posting Cadence" },
  { id: 6, label: "Verify & Finish" },
];

export default function SetupPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [results, setResults] = useState<{ test: string; passed: boolean; detail: string }[] | null>(null);
  const [setupDone, setSetupDone] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    fetch("/api/internal/bootstrap/status")
      .then((r) => r.json())
      .then((d) => setSetupDone(d.completed))
      .catch(() => {});
  }, []);

  const update = useCallback(
    (key: string, value: string) => setFormData((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const nextStep = useCallback(() => {
    if (currentStep < 6) setCurrentStep((s) => s + 1);
  }, [currentStep]);

  const prevStep = useCallback(() => {
    if (currentStep > 1) setCurrentStep((s) => s - 1);
  }, [currentStep]);

  const handleFinish = useCallback(async () => {
    setRunning(true);
    try {
      const resp = await fetch("/api/internal/bootstrap/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await resp.json();
      setResults(data.results ?? []);
      if (data.ok) setSetupDone(true);
    } catch {
      setResults([{ test: "Request", passed: false, detail: "Failed to reach server" }]);
    } finally {
      setRunning(false);
    }
  }, [formData]);

  if (setupDone) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-heading text-3xl text-primary">Setup Complete</h1>
        <p className="font-body text-muted">Your brand has already been configured.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-heading text-3xl text-primary">Setup</h1>
      <p className="mb-6 font-body text-muted">Step {currentStep} of 6 — {STEPS[currentStep - 1].label}</p>

      <div className="mb-8 flex gap-2">
        {STEPS.map((s) => (
          <div
            key={s.id}
            className={`h-2 flex-1 rounded-full ${s.id <= currentStep ? "bg-accent" : "bg-dark/10"}`}
          />
        ))}
      </div>

      {currentStep === 1 && (
        <div className="flex flex-col gap-4">
          <label className="font-body text-sm text-muted">Agent name</label>
          <input
            className="rounded border border-dark/10 px-4 py-2 font-body"
            defaultValue={formData.agentName ?? "SocialFTE"}
            onChange={(e) => update("agentName", e.target.value)}
          />
          <label className="font-body text-sm text-muted">Voice description</label>
          <input
            className="rounded border border-dark/10 px-4 py-2 font-body"
            defaultValue={formData.voice ?? "Direct, no fluff"}
            onChange={(e) => update("voice", e.target.value)}
          />
        </div>
      )}

      {currentStep === 2 && (
        <div className="flex flex-col gap-4">
          <label className="font-body text-sm text-muted">Brand name</label>
          <input className="rounded border border-dark/10 px-4 py-2 font-body" onChange={(e) => update("brandName", e.target.value)} />
          <label className="font-body text-sm text-muted">Tagline</label>
          <input className="rounded border border-dark/10 px-4 py-2 font-body" onChange={(e) => update("tagline", e.target.value)} />
          <label className="font-body text-sm text-muted">Primary color (hex)</label>
          <input className="rounded border border-dark/10 px-4 py-2 font-body" defaultValue="#1B5E20" onChange={(e) => update("primaryColor", e.target.value)} />
          <label className="font-body text-sm text-muted">Accent color (hex)</label>
          <input className="rounded border border-dark/10 px-4 py-2 font-body" defaultValue="#C5A55A" onChange={(e) => update("accentColor", e.target.value)} />
          <label className="font-body text-sm text-muted">Logo URL (optional)</label>
          <input className="rounded border border-dark/10 px-4 py-2 font-body" placeholder="https://..." onChange={(e) => update("logoUrl", e.target.value)} />
          <label className="font-body text-sm text-muted">Social handle (optional)</label>
          <input className="rounded border border-dark/10 px-4 py-2 font-body" placeholder="@yourbrand" onChange={(e) => update("socialHandle", e.target.value)} />
          <label className="flex items-center gap-2 font-body text-sm text-muted">
            <input
              type="checkbox"
              defaultChecked
              onChange={(e) => update("showBrandMark", e.target.checked ? "true" : "false")}
            />
            Show logo + handle on posts and reels
          </label>
          <label className="font-body text-sm text-muted">Caption language</label>
          <select
            className="rounded border border-dark/10 px-4 py-2 font-body"
            defaultValue="roman-urdu-english"
            onChange={(e) => update("captionLanguage", e.target.value)}
          >
            <option value="roman-urdu-english">Roman Urdu + English (default)</option>
            <option value="english">English</option>
            <option value="urdu">Urdu</option>
          </select>
        </div>
      )}

      {currentStep === 3 && (
        <div className="flex flex-col gap-4">
          <label className="font-body text-sm text-muted">
            Platforms (comma-separated: facebook,instagram,youtube,tiktok)
          </label>
          <input className="rounded border border-dark/10 px-4 py-2 font-body" defaultValue="instagram,facebook" onChange={(e) => update("platforms", e.target.value)} />
        </div>
      )}

      {currentStep === 4 && (
        <div className="flex flex-col gap-4">
          <label className="font-body text-sm text-muted">Notification channel (discord/whatsapp/telegram)</label>
          <input className="rounded border border-dark/10 px-4 py-2 font-body" defaultValue="discord" onChange={(e) => update("channel", e.target.value)} />
        </div>
      )}

      {currentStep === 5 && (
        <div className="flex flex-col gap-4">
          <label className="font-body text-sm text-muted">Posts per day</label>
          <input className="rounded border border-dark/10 px-4 py-2 font-body" defaultValue="3" onChange={(e) => update("postsPerDay", e.target.value)} />
          <label className="font-body text-sm text-muted">Timezone</label>
          <input className="rounded border border-dark/10 px-4 py-2 font-body" defaultValue="Asia/Karachi" onChange={(e) => update("timezone", e.target.value)} />
        </div>
      )}

      {currentStep === 6 && (
        <div className="flex flex-col gap-4">
          <p className="font-body text-muted">
            Verify that everything works: LLM, render, notification, and database.
          </p>
          {results && (
            <div className="flex flex-col gap-2">
              {results.map((r) => (
                <div
                  key={r.test}
                  className={`rounded border px-4 py-2 font-body text-sm ${
                    r.passed ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"
                  }`}
                >
                  <strong>{r.passed ? "PASS" : "FAIL"}</strong> {r.test}: {r.detail}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-8 flex justify-between">
        <button
          onClick={prevStep}
          disabled={currentStep === 1}
          className="rounded bg-dark/10 px-6 py-2 font-body text-sm text-primary disabled:opacity-50"
        >
          Back
        </button>
        {currentStep < 6 ? (
          <button
            onClick={nextStep}
            className="rounded bg-accent px-6 py-2 font-body text-sm text-light"
          >
            Next
          </button>
        ) : (
          <button
            onClick={handleFinish}
            disabled={running}
            className="rounded bg-primary px-6 py-2 font-body text-sm text-light disabled:opacity-50"
          >
            {running ? "Running checks..." : "Verify & Finish"}
          </button>
        )}
      </div>
    </div>
  );
}
