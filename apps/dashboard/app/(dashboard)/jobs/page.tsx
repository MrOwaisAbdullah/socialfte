"use client";

import { useCallback, useEffect, useState } from "react";

interface Job {
  id: string;
  name: string;
  next_run: string | null;
  trigger: string;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_WORKER_URL || ""}/jobs`);
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

  const runJob = useCallback(async (jobId: string) => {
    setRunning(jobId);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_WORKER_URL || ""}/jobs/${jobId}/run`, {
        method: "POST",
        headers: {
          "x-internal-secret": process.env.NEXT_PUBLIC_RENDER_INTERNAL_SECRET || "",
        },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || `Failed to run ${jobId}`);
      }
    } catch {
      setError(`Could not reach worker for ${jobId}`);
    } finally {
      setRunning(null);
    }
  }, []);

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
              className="flex items-center justify-between rounded-lg border border-dark/10 bg-light p-4"
            >
              <div>
                <div className="font-body text-sm font-medium text-dark">{job.name}</div>
                <div className="font-body text-xs text-muted">
                  Trigger: {job.trigger} · Next: {job.next_run ? new Date(job.next_run).toLocaleString() : "N/A"}
                </div>
              </div>
              <button
                onClick={() => runJob(job.id)}
                disabled={running === job.id}
                className="rounded bg-primary px-3 py-1.5 font-body text-sm text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
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
