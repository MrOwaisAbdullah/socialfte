"""Persisted schedule overrides — lets the dashboard change a job's cadence
at runtime (POST /jobs/{id}/schedule) without an env var change + redeploy.
Checked once at worker startup (main.py's lifespan, seeding initial job
registration) and written whenever the schedule endpoint is called, which
also calls APScheduler's reschedule_job directly for immediate effect.
"""
from datetime import datetime, timezone

from db.models import JobSchedule
from db.session import SessionLocal


async def get_overrides() -> dict[str, str]:
    from sqlalchemy import select

    async with SessionLocal() as session:
        result = await session.execute(select(JobSchedule))
        return {row.job_id: row.cron_expression for row in result.scalars().all()}


async def save_override(job_id: str, cron_expression: str) -> None:
    async with SessionLocal() as session:
        existing = await session.get(JobSchedule, job_id)
        if existing:
            existing.cron_expression = cron_expression
            existing.updated_at = datetime.now(timezone.utc)
        else:
            session.add(JobSchedule(job_id=job_id, cron_expression=cron_expression))
        await session.commit()
