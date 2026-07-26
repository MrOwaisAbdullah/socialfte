"""SocialFTE Worker — FastAPI + APScheduler.

Week 3, Step 1: Worker scaffold.
Runs all scheduled jobs, publishes to platforms, handles Discord approval workflows.
Internal-only: no public port, docker network only.
"""
import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI

from config import settings
from db.session import engine, SessionLocal
from db.models import Base

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper()),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("worker")

scheduler = AsyncIOScheduler(timezone=settings.SCHEDULER_TIMEZONE)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle for FastAPI."""
    # Startup: create tables if they don't exist (dev convenience)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables verified")

    # Register cron jobs
    from jobs.refresh_tokens import refresh_tokens
    from jobs.publish_due import publish_due
    from jobs.notify_review import notify_review

    scheduler.add_job(
        refresh_tokens,
        CronTrigger.from_crontab(settings.TOKEN_REFRESH_CRON),
        id="refresh_tokens",
        name="Refresh platform tokens",
        replace_existing=True,
    )
    scheduler.add_job(
        publish_due,
        CronTrigger.from_crontab(settings.PUBLISH_DUE_CRON),
        id="publish_due",
        name="Publish approved posts",
        replace_existing=True,
    )
    scheduler.add_job(
        notify_review,
        CronTrigger.from_crontab(settings.NOTIFY_REVIEW_CRON),
        id="notify_review",
        name="Send approval cards to Discord",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("APScheduler started with %d jobs", len(scheduler.get_jobs()))
    for job in scheduler.get_jobs():
        logger.info("  Job: %s — %s", job.id, job.name)

    yield

    # Shutdown
    scheduler.shutdown(wait=False)
    await engine.dispose()
    logger.info("Worker shutdown complete")


app = FastAPI(
    title="SocialFTE Worker",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    """Health check endpoint for Docker/container orchestration."""
    return {"status": "ok", "jobs": len(scheduler.get_jobs())}


@app.get("/jobs")
async def list_jobs():
    """List all registered APScheduler jobs (for debugging)."""
    return [
        {"id": job.id, "name": job.name, "next_run": str(job.next_run_time)}
        for job in scheduler.get_jobs()
    ]


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.WORKER_HOST,
        port=settings.WORKER_PORT,
        reload=False,
    )
