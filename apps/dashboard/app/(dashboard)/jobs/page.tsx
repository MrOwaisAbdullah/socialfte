"use client";

import { useCallback, useEffect, useState } from "react";

interface LastRun {
  status: "running" | "success" | "failed";
  trigger: "scheduled" | "manual";
  started_at: string;
  finished_at: string | null;
  error: string | null;
}

interface Job {
  id: string;
  name: string;
  next_run: string | null;
  cron: string;
  schedule_text: string;
  last_run: LastRun | null;
}

type Shape = "every_n_minutes" | "every_n_hours" | "every_n_days" | "hourly" | "daily" | "weekly" | "monthly";

const SHAPE_LABELS: Record<Shape, string> = {
  every_n_minutes: "Every N minutes",
  every_n_hours: "Every N hours",
  every_n_days: "Every N days",
  hourly: "Hourly (at :MM)",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function statusBadge(lastRun: LastRun | null) {
  if (!lastRun) {
    return <span className="rounded px-2 py-0.5 text-xs font-medium bg-dark/10 text-dark">Never run</span>;
  }
  const map: Record<LastRun["status"], string> = {
    running: "bg-yellow-100 text-yellow-700",
    success: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  };
  const label: Record<LastRun["status"], string> = {
    running: "Running...",
    success: "Success",
    failed: "Failed",
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${map[lastRun.status]}`}>
      {label[lastRun.status]}
    </span>
  );
}

interface ScheduleForm {
  shape: Shape;
  n: number;
  hour: number;
  minute: number;
  dayOfWeek: number;
  day: number;
}

const DEFAULT_FORM: ScheduleForm = { shape: "daily", n: 15, hour: 4, minute: 0, dayOfWeek: 0, day: 1 };

function ScheduleEditor({
  job,
  onCancel,
  onSaved,
}: {
  job: Job;
  onCancel: () => void;
  onSaved: (updated: { cron: string; schedule_text: string; next_run: string | null }) => void;
}) {
  const [form, setForm] = useState<ScheduleForm>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const update = <K extends keyof ScheduleForm>(key: K, value: ScheduleForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    setErr(null);
    const payload: Record<string, unknown> = { shape: form.shape };
    if (["every_n_minutes", "every_n_hours", "every_n_days"].includes(form.shape)) payload.n = form.n;
    if (["every_n_hours", "every_n_days", "hourly", "daily", "weekly", "monthly"].includes(form.shape)) {
      payload.hour = form.hour;
      payload.minute = form.minute;
    }
    if (form.shape === "weekly") payload.day_of_week = form.dayOfWeek;
    if (form.shape === "monthly") payload.day = form.day;

    try {
      const res = await fetch(`/api/jobs/${job.id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.detail || "Failed to update schedule");
        return;
      }
      onSaved(data);
    } catch {
      setErr("Could not reach worker");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-md border border-dark/10 bg-dark/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={form.shape}
          onChange={(e) => update("shape", e.target.value as Shape)}
          className="rounded border border-dark/20 bg-light px-2 py-1 font-body text-sm text-dark"
        >
          {(Object.keys(SHAPE_LABELS) as Shape[]).map((s) => (
            <option key={s} value={s}>
              {SHAPE_LABELS[s]}
            </option>
          ))}
        </select>

        {["every_n_minutes", "every_n_hours", "every_n_days"].includes(form.shape) && (
          <input
            type="number"
            min={1}
            max={form.shape === "every_n_minutes" ? 59 : form.shape === "every_n_hours" ? 23 : 27}
            value={form.n}
            onChange={(e) => update("n", Number(e.target.value))}
            className="w-20 rounded border border-dark/20 bg-light px-2 py-1 font-body text-sm text-dark"
          />
        )}

        {["every_n_hours", "every_n_days", "hourly", "daily", "weekly", "monthly"].includes(form.shape) &&
          form.shape !== "hourly" && (
            <input
              type="time"
              value={`${String(form.hour).padStart(2, "0")}:${String(form.minute).padStart(2, "0")}`}
              onChange={(e) => {
                const [h, m] = e.target.value.split(":").map(Number);
                update("hour", h);
                update("minute", m);
              }}
              className="rounded border border-dark/20 bg-light px-2 py-1 font-body text-sm text-dark"
            />
          )}

        {form.shape === "hourly" && (
          <input
            type="number"
            min={0}
            max={59}
            value={form.minute}
            onChange={(e) => update("minute", Number(e.target.value))}
            className="w-20 rounded border border-dark/20 bg-light px-2 py-1 font-body text-sm text-dark"
            placeholder="minute"
          />
        )}

        {form.shape === "weekly" && (
          <select
            value={form.dayOfWeek}
            onChange={(e) => update("dayOfWeek", Number(e.target.value))}
            className="rounded border border-dark/20 bg-light px-2 py-1 font-body text-sm text-dark"
          >
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        )}

        {form.shape === "monthly" && (
          <input
            type="number"
            min={1}
            max={28}
            value={form.day}
            onChange={(e) => update("day", Number(e.target.value))}
            className="w-20 rounded border border-dark/20 bg-light px-2 py-1 font-body text-sm text-dark"
            placeholder="day"
          />
        )}
      </div>

      {err && <p className="font-body text-xs text-red-600">{err}</p>}

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="rounded bg-primary px-3 py-1.5 font-body text-xs text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save schedule"}
        </button>
        <button
          onClick={onCancel}
          className="rounded bg-dark/10 px-3 py-1.5 font-body text-xs text-dark hover:bg-dark/20"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// Spinner SVG for the refresh button
function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      <polyline points="21 3 21 9 15 9" />
    </svg>
  );
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/jobs");
      if (res.ok) {
        const data = await res.json();
        // Check if data has error or is actually job list
        if (data.error && !Array.isArray(data)) {
          setError(data.error);
          setJobs([]);
        } else {
          setJobs(Array.isArray(data) ? data : []);
        }
      } else {
        const errorData = await res.json().catch(() => ({}));
        setError(`Worker returned ${res.status}: ${errorData.error || res.statusText}`);
        setJobs([]);
      }
    } catch (err) {
      setError("Could not reach worker - make sure WORKER_INTERNAL_URL is configured");
      setJobs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const runJob = useCallback(
    async (jobId: string) => {
      setRunning(jobId);
      setError(null);
      try {
        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_id: jobId }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.detail || `Failed to run ${jobId}`);
        } else {
          // Only refresh if we successfully reached the worker AND got valid data
          // This prevents infinite retry loops when worker is down or returns errors
          if (jobs.length > 0) {
            setTimeout(() => fetchJobs(true), 1500);
          }
        }
      } catch {
        setError(`Could not reach worker for ${jobId}`);
      } finally {
        setRunning(null);
      }
    },
    [fetchJobs]
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-3xl text-primary">Jobs</h1>
        <button
          onClick={() => fetchJobs(true)}
          className="flex items-center gap-1.5 rounded bg-dark/10 px-3 py-1.5 font-body text-sm text-dark hover:bg-dark/20"
        >
          <RefreshIcon spinning={refreshing} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded bg-red-50 p-4 font-body text-sm text-red-700 border border-red-200">
          <strong>Worker Connection Error:</strong> {error}
          <div className="mt-2 text-xs">
            Please check that WORKER_INTERNAL_URL is set correctly and the worker service is running.
          </div>
        </div>
      )}

      {loading ? (
        <p className="font-body text-muted">Loading...</p>
      ) : error ? (
        <div className="rounded bg-blue-50 p-6 font-body text-sm text-blue-700 border border-blue-200">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001-1h-1a1 1 0 01-1-1V9a1 1 0 011-1H8z" clipRule="evenodd" />
            </svg>
            <strong>Worker Unavailable</strong>
          </div>
          <div className="text-sm">
            The dashboard cannot reach the worker service. This is expected in local development if the worker isn't running.
          </div>
          <div className="mt-3 text-xs">
            <strong>To fix:</strong>
            <ul className="list-disc ml-4 mt-1">
              <li>Local: Start the worker with <code>cd apps/worker && uv run python main.py</code></li>
              <li>VPS: Set <code>WORKER_INTERNAL_URL</code> to the worker's internal hostname in Dokploy</li>
              <li>Both services must be on the same Docker network</li>
            </ul>
          </div>
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded bg-gray-50 p-6 font-body text-sm text-gray-600 border border-gray-200">
          No jobs registered. Start the worker to see scheduled jobs here.
        </div>
      ) : (
        <div className="grid gap-3">
          {jobs.map((job) => (
            <div key={job.id} className="rounded-lg border border-dark/10 bg-light p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-body text-sm font-medium text-dark">{job.name}</span>
                    {statusBadge(job.last_run)}
                  </div>
                  <div className="mt-1 font-body text-xs text-muted">
                    {job.schedule_text} · Next: {job.next_run ? new Date(job.next_run).toLocaleString() : "N/A"}
                  </div>
                  {job.last_run && (
                    <div className="mt-1 font-body text-xs text-muted">
                      Last run: {new Date(job.last_run.started_at).toLocaleString()}
                      {" "}({job.last_run.trigger})
                      {job.last_run.status === "running" && " · still running"}
                    </div>
                  )}
                  {job.last_run?.error && (
                    <p className="mt-1 font-body text-xs text-red-600">{job.last_run.error}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => setEditingJobId(editingJobId === job.id ? null : job.id)}
                    className="rounded bg-dark/10 px-3 py-1.5 font-body text-sm text-dark hover:bg-dark/20"
                  >
                    {editingJobId === job.id ? "Close" : "Edit schedule"}
                  </button>
                  <button
                    type="button"
                    onClick={() => runJob(job.id)}
                    disabled={running === job.id}
                    className="rounded bg-primary px-3 py-1.5 font-body text-sm text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
                  >
                    {running === job.id ? "Running..." : "Run Now"}
                  </button>
                </div>
              </div>

              {editingJobId === job.id && (
                <ScheduleEditor
                  job={job}
                  onCancel={() => setEditingJobId(null)}
                  onSaved={(updated) => {
                    setJobs((prev) =>
                      prev.map((j) => (j.id === job.id ? { ...j, ...updated } : j))
                    );
                    setEditingJobId(null);
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
