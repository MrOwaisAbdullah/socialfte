"""SocialFTE Worker — FastAPI + APScheduler.

Week 3, Step 1: Worker scaffold.
Runs all scheduled jobs, publishes to platforms, handles Discord approval workflows.
Internal-only: no public port, docker network only.
"""
import logging
from contextlib import asynccontextmanager
from uuid import UUID

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel

from audit import write_audit
from config import settings
from db.session import engine, SessionLocal
from db.models import Base, Asset, Post

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
    from jobs.compose_batch import compose_batch
    from jobs.collect_metrics import collect_metrics
    from jobs.weekly_digest import weekly_digest
    from jobs.process_footage import process_footage

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
    scheduler.add_job(
        compose_batch,
        CronTrigger.from_crontab(settings.COMPOSE_BATCH_CRON),
        id="compose_batch",
        name="Compose daily draft batch",
        replace_existing=True,
    )
    scheduler.add_job(
        collect_metrics,
        CronTrigger.from_crontab(settings.COLLECT_METRICS_CRON),
        id="collect_metrics",
        name="Collect post performance metrics",
        replace_existing=True,
    )
    scheduler.add_job(
        weekly_digest,
        CronTrigger.from_crontab(settings.WEEKLY_DIGEST_CRON),
        id="weekly_digest",
        name="Generate weekly performance digest",
        replace_existing=True,
    )
    scheduler.add_job(
        process_footage,
        CronTrigger.from_crontab(settings.PROCESS_FOOTAGE_CRON),
        id="process_footage",
        name="Process uploaded video clips (audio + cover-frames)",
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
    """List all registered APScheduler jobs with schedules."""
    return [
        {
            "id": job.id,
            "name": job.name,
            "next_run": str(job.next_run_time) if job.next_run_time else None,
            "trigger": str(job.trigger),
        }
        for job in scheduler.get_jobs()
    ]


@app.post("/jobs/{job_id}/run")
async def run_job(job_id: str, request: Request):
    """Manually trigger a job by ID. Requires x-internal-secret header."""
    secret = request.headers.get("x-internal-secret")
    if settings.RENDER_INTERNAL_SECRET and secret != settings.RENDER_INTERNAL_SECRET:
        raise HTTPException(status_code=401, detail="unauthorized")

    job = scheduler.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"job '{job_id}' not found")

    import asyncio
    asyncio.create_task(job.func())
    await write_audit("manual_trigger", job_id, job_id, {"triggered_by": "dashboard"})
    logger.info("Manually triggered job: %s", job_id)
    return {"ok": True, "job_id": job_id, "name": job.name}


class RenderCompleteRequest(BaseModel):
    output_key: str
    status: str


@app.post("/api/render-complete")
async def render_complete(request: Request, payload: RenderCompleteRequest):
    """Callback from the GitHub Actions render workflow (Week 5, Step 2).

    output_key follows dispatch_render.py's `renders/{post_id}.mp4` convention
    — the post ID is embedded in the filename, so this endpoint doesn't need
    a separate post_id field in the callback body to know which post to update.
    """
    secret = request.headers.get("x-render-secret")
    if settings.RENDER_INTERNAL_SECRET and secret != settings.RENDER_INTERNAL_SECRET:
        raise HTTPException(status_code=401, detail="unauthorized")

    filename = payload.output_key.rsplit("/", 1)[-1]
    post_id_str = filename.rsplit(".", 1)[0]
    try:
        post_id = UUID(post_id_str)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"could not parse post id from output_key: {payload.output_key}")

    async with SessionLocal() as session:
        post = await session.get(Post, post_id)
        if not post:
            raise HTTPException(status_code=404, detail="post not found")

        if payload.status == "success":
            post.render_url = f"{settings.R2_PUBLIC_URL}/{payload.output_key}"
            post.state = "review"
        else:
            # Surfaces a failed/timed-out/cancelled render rather than leaving
            # the post stuck invisibly forever (FR-004).
            post.state = "failed"
            post.error = f"video render failed (GitHub Actions status: {payload.status})"

        await session.commit()

    await write_audit(
        "dispatch_render",
        "render_complete",
        str(post_id),
        {"output_key": payload.output_key, "status": payload.status},
    )

    logger.info("Render complete callback for post %s: status=%s", post_id, payload.status)
    return {"ok": True}


class VisionTagRequest(BaseModel):
    asset_id: UUID
    image_url: str


@app.post("/vision/tag")
async def vision_tag(request: Request, payload: VisionTagRequest):
    """Tag and quality-gate an asset on upload.

    Requires x-internal-secret header matching RENDER_INTERNAL_SECRET
    (same auth scheme as the dashboard's own internal endpoints).
    """
    from brain.vision import _analyze_asset, QUALITY_SCORE_REJECT_THRESHOLD

    secret = request.headers.get("x-internal-secret")
    if settings.RENDER_INTERNAL_SECRET and secret != settings.RENDER_INTERNAL_SECRET:
        raise HTTPException(status_code=401, detail="unauthorized")
    try:
        analysis = await _analyze_asset(payload.image_url)
    except Exception as exc:
        logger.error("Vision analysis failed for %s: %s", payload.asset_id, exc)
        raise HTTPException(status_code=502, detail=f"vision analysis failed: {exc}")

    reject_reason = None
    if analysis.quality_score < QUALITY_SCORE_REJECT_THRESHOLD:
        reasons = []
        if not analysis.lighting_ok:
            reasons.append("poor lighting")
        if not analysis.composition_ok:
            reasons.append("poor composition")
        reject_reason = ", ".join(reasons) or f"quality_score {analysis.quality_score} below threshold"

    async with SessionLocal() as session:
        asset = await session.get(Asset, payload.asset_id)
        if not asset:
            raise HTTPException(status_code=404, detail="asset not found")
        asset.piece = analysis.piece
        asset.tier = analysis.tier
        asset.variant = analysis.variant
        asset.quality_score = analysis.quality_score
        asset.lighting_ok = analysis.lighting_ok
        asset.composition_ok = analysis.composition_ok
        asset.reject_reason = reject_reason
        await session.commit()

    await write_audit(
        "vision_agent",
        "asset_tagged",
        str(payload.asset_id),
        {"piece": analysis.piece, "tier": analysis.tier, "variant": analysis.variant, "quality_score": analysis.quality_score},
    )
    await write_audit(
        "vision_agent",
        "asset_quality_checked",
        str(payload.asset_id),
        {"quality_score": analysis.quality_score, "lighting_ok": analysis.lighting_ok, "composition_ok": analysis.composition_ok, "reject_reason": reject_reason},
    )

    return {
        "piece": analysis.piece,
        "tier": analysis.tier,
        "variant": analysis.variant,
        "quality_score": analysis.quality_score,
        "lighting_ok": analysis.lighting_ok,
        "composition_ok": analysis.composition_ok,
        "reject_reason": reject_reason,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.WORKER_HOST,
        port=settings.WORKER_PORT,
        reload=False,
    )
