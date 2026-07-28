"""Job execution tracking — records every job run (cron-triggered or manually
run from the dashboard's Jobs page) to job_runs, so the dashboard can show
last-run status/history instead of just a list of registered jobs with no
idea whether they're actually working.

`tracked()` wraps a job function once at registration time (main.py's
lifespan) and is used for every call to it thereafter — both APScheduler's
own cron-triggered calls and the manual /jobs/{id}/run endpoint, since the
latter calls job.func(), which by then IS the wrapped version. The two paths
are told apart via a contextvar rather than a second code path, so there's
no risk of a run going untracked or double-tracked.
"""
import contextvars
import logging
from datetime import datetime, timezone
from uuid import UUID

from db.models import JobRun
from db.session import SessionLocal

logger = logging.getLogger("worker.job_runs")

# Default "scheduled" — APScheduler's own executor calls job.func() with no
# way to say why. The manual-trigger endpoint sets this to "manual" for the
# duration of its own call.
current_trigger: contextvars.ContextVar[str] = contextvars.ContextVar("job_trigger", default="scheduled")


async def _start_run(job_id: str, trigger: str) -> UUID:
    async with SessionLocal() as session:
        run = JobRun(job_id=job_id, trigger=trigger, status="running")
        session.add(run)
        await session.commit()
        await session.refresh(run)
        return run.id


async def _finish_run(run_id: UUID, status: str, error: str | None = None) -> None:
    async with SessionLocal() as session:
        run = await session.get(JobRun, run_id)
        if run:
            run.status = status
            run.error = error
            run.finished_at = datetime.now(timezone.utc)
            await session.commit()


def tracked(job_id: str, func):
    """Wrap an async job function so every call records a job_runs row."""

    async def wrapper(*args, **kwargs):
        trigger = current_trigger.get()
        run_id = await _start_run(job_id, trigger)
        try:
            await func(*args, **kwargs)
            await _finish_run(run_id, "success")
        except Exception as e:
            logger.error("Job %s failed: %s", job_id, e)
            await _finish_run(run_id, "failed", str(e)[:2000])
            raise

    wrapper.__name__ = getattr(func, "__name__", job_id)
    return wrapper


async def last_runs(job_ids: list[str]) -> dict[str, dict]:
    """Most recent run per job_id, for GET /jobs to attach as `last_run`.

    DISTINCT ON (job_id) ... ORDER BY job_id, started_at DESC — matches
    idx_job_runs_job_id_started_at exactly, so this stays cheap regardless of
    how large job_runs grows, unlike fetching every row and deduping in
    Python (which an ORM .order_by()+dedupe approach would need a LIMIT for,
    and a flat LIMIT would arbitrarily cut off whole job_ids instead of
    bounding rows-per-job)."""
    if not job_ids:
        return {}
    from sqlalchemy import text

    async with SessionLocal() as session:
        result = await session.execute(
            text(
                """
                SELECT DISTINCT ON (job_id) job_id, status, trigger, started_at, finished_at, error
                FROM job_runs
                WHERE job_id = ANY(:job_ids)
                ORDER BY job_id, started_at DESC
                """
            ),
            {"job_ids": job_ids},
        )
        rows = result.mappings().all()

    return {
        row["job_id"]: {
            "status": row["status"],
            "trigger": row["trigger"],
            "started_at": row["started_at"].isoformat() if row["started_at"] else None,
            "finished_at": row["finished_at"].isoformat() if row["finished_at"] else None,
            "error": row["error"],
        }
        for row in rows
    }
