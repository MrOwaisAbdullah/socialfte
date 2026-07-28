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

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/jobs");
      if (res.ok) setJobs(await res.json());
    } catch {
      setError("Could not reach worker");
    } finally {
      setLoading(false);
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
          // The job runs in the background on the worker — refresh after a
          // beat so "Running..." / the new job_runs row has a chance to show.
          setTimeout(fetchJobs, 1500);
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
          onClick={fetchJobs}
          className="rounded bg-dark/10 px-3 py-1.5 font-body text-sm text-dark hover:bg-dark/20"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded bg-red-50 p-3 font-body text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <p className="font-body text-muted">Loading...</p>
      ) : jobs.length === 0 ? (
        <p className="font-body text-muted">No jobs registered.</p>
      ) : (
        <div className="grid gap-3">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex items-start justify-between gap-4 rounded-lg border border-dark/10 bg-light p-4"
            >
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
              <button
                onClick={() => runJob(job.id)}
                disabled={running === job.id}
                className="shrink-0 rounded bg-primary px-3 py-1.5 font-body text-sm text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {running === job.id ? "Running..." : "Run Now"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
