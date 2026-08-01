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
from db.models import Base, Asset, Post, Template
from scheduling import trigger_to_cron, humanize_cron, build_cron, InvalidSchedule
from job_runs import tracked, current_trigger, last_runs
from job_schedules import get_overrides, save_override

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper()),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("worker")

scheduler = AsyncIOScheduler(timezone=settings.SCHEDULER_TIMEZONE)

# Populated inside lifespan (needs settings + the lazily-imported job funcs),
# read by /jobs/{id}/schedule to validate a job_id exists. Filled before the
# app starts accepting requests (lifespan startup runs before yield).
JOB_DEFAULT_CRONS: dict[str, str] = {}


# Matches apps/dashboard/components/templates/registry.ts's TEMPLATE_REGISTRY
# keys exactly — compose_batch.py joins on Template.slug to build render
# requests, and nothing ever populated this table for a fresh deployment
# (confirmed live: 10 real uploaded assets, 0 templates, "No candidate
# asset+template pairs found" — compose_batch had nothing to actually
# compose regardless of how many assets existed).
DEFAULT_TEMPLATES = [
    ("hero", "Hero"),
    ("premium-hero", "Premium Hero"),
    ("price-card", "Price Card"),
    ("set-breakdown", "Set Breakdown"),
    ("quote", "Quote"),
    ("carousel-slide", "Carousel Slide"),
    ("showcase", "Showcase"),
    ("grid-layout", "Grid Layout"),
    ("lifestyle", "Lifestyle"),
    ("detail-focus", "Detail Focus"),
    ("product-split", "Product Split"),
    ("bento-gallery", "Bento Gallery"),
    ("bento-reel", "Bento Reel"),
    ("bold-headline", "Bold Headline"),
    ("exclusive-badge", "Exclusive Badge"),
    ("light-circle-frame", "Light Circle Frame"),
    ("sweet-dreams", "Sweet Dreams"),
    # Video-only (no still-image registry.ts entry — same pattern as
    # premium-hero/showcase/grid-layout/etc. above): pure motion effects
    # with no single-frame equivalent worth rendering as a static image.
    ("shader-dissolve", "Shader Dissolve"),
    ("card-converge", "Card Converge"),
]


async def _seed_templates() -> None:
    """Insert any DEFAULT_TEMPLATES slug missing from the table — never
    touches a slug that's already there, so an operator's own edits/
    deletions to existing rows are preserved. Was "only insert when the
    whole table is empty", which meant adding a new template to
    DEFAULT_TEMPLATES (as happened when the 4 sample-post templates were
    added) silently never reached a live, already-populated table on
    restart — the operator would have had to insert the new row by hand
    every time. This runs on every startup and is a no-op once nothing's
    missing."""
    async with SessionLocal() as session:
        from sqlalchemy import select

        existing_slugs = set((await session.execute(select(Template.slug))).scalars().all())
        added = 0
        for slug, display_name in DEFAULT_TEMPLATES:
            if slug in existing_slugs:
                continue
            session.add(Template(slug=slug, display_name=display_name))
            added += 1
        if added:
            await session.commit()
            logger.info("Seeded %d new default template(s)", added)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle for FastAPI."""
    # Startup: create tables if they don't exist (dev convenience)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables verified")

    await _seed_templates()

    # Register cron jobs
    from jobs.refresh_tokens import refresh_tokens
    from jobs.publish_due import publish_due
    from jobs.notify_review import notify_review
    from jobs.compose_batch import compose_batch
    from jobs.collect_metrics import collect_metrics
    from jobs.weekly_digest import weekly_digest
    from jobs.process_footage import process_footage
    from jobs.retag_assets import retag_assets

    job_definitions = [
        ("refresh_tokens", refresh_tokens, settings.TOKEN_REFRESH_CRON, "Refresh platform tokens"),
        ("publish_due", publish_due, settings.PUBLISH_DUE_CRON, "Publish approved posts"),
        ("notify_review", notify_review, settings.NOTIFY_REVIEW_CRON, "Send approval cards to Discord"),
        ("compose_batch", compose_batch, settings.COMPOSE_BATCH_CRON, "Compose daily draft batch"),
        ("collect_metrics", collect_metrics, settings.COLLECT_METRICS_CRON, "Collect post performance metrics"),
        ("weekly_digest", weekly_digest, settings.WEEKLY_DIGEST_CRON, "Generate weekly performance digest"),
        ("process_footage", process_footage, settings.PROCESS_FOOTAGE_CRON, "Process uploaded video clips (audio + cover-frames)"),
        ("retag_assets", retag_assets, settings.RETAG_ASSETS_CRON, "Retag assets vision-tagging missed"),
    ]

    # job_schedules holds any cron the dashboard's schedule editor has set,
    # overriding the *_CRON env var default for that job — checked once here
    # so an override made before a restart survives it.
    overrides = await get_overrides()

    for job_id, func, default_cron, name in job_definitions:
        JOB_DEFAULT_CRONS[job_id] = default_cron
        cron = overrides.get(job_id, default_cron)
        # Wrapped with tracked() so every execution — cron-triggered or
        # manually run from the dashboard's Jobs page — records a job_runs
        # row (status, timing, error). The manual endpoint calls job.func(),
        # which after registration IS this wrapped version, so one wrapper
        # covers both paths.
        scheduler.add_job(
            tracked(job_id, func),
            CronTrigger.from_crontab(cron),
            id=job_id,
            name=name,
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
    """List all registered APScheduler jobs with schedules and last-run status."""
    jobs = scheduler.get_jobs()
    runs = await last_runs([job.id for job in jobs])
    return [
        {
            "id": job.id,
            "name": job.name,
            "next_run": str(job.next_run_time) if job.next_run_time else None,
            "trigger": str(job.trigger),
            "cron": trigger_to_cron(job.trigger),
            "schedule_text": humanize_cron(trigger_to_cron(job.trigger)),
            "last_run": runs.get(job.id),
        }
        for job in jobs
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
    # asyncio.create_task copies the current context at creation time, so
    # setting current_trigger here (then resetting it) labels only this
    # task's run as "manual" in job_runs without leaking into anything else
    # handled by this same request/context.
    token = current_trigger.set("manual")
    try:
        asyncio.create_task(job.func())
    finally:
        current_trigger.reset(token)
    await write_audit("manual_trigger", job_id, job_id, {"triggered_by": "dashboard"})
    logger.info("Manually triggered job: %s", job_id)
    return {"ok": True, "job_id": job_id, "name": job.name}


class ScheduleRequest(BaseModel):
    shape: str  # every_n_minutes | every_n_hours | every_n_days | hourly | daily | weekly | monthly
    n: int | None = None
    hour: int = 0
    minute: int = 0
    day_of_week: int | None = None  # 0=Sunday..6=Saturday, required for "weekly"
    day: int | None = None  # 1-28, required for "monthly"


@app.post("/jobs/{job_id}/schedule")
async def update_schedule(job_id: str, request: Request, payload: ScheduleRequest):
    """Change a job's cron schedule at runtime — persisted to job_schedules
    (survives a restart) and applied immediately via reschedule_job (no
    restart needed either). Requires x-internal-secret header."""
    secret = request.headers.get("x-internal-secret")
    if settings.RENDER_INTERNAL_SECRET and secret != settings.RENDER_INTERNAL_SECRET:
        raise HTTPException(status_code=401, detail="unauthorized")

    if job_id not in JOB_DEFAULT_CRONS:
        raise HTTPException(status_code=404, detail=f"job '{job_id}' not found")

    try:
        cron = build_cron(
            payload.shape,
            n=payload.n,
            hour=payload.hour,
            minute=payload.minute,
            day_of_week=payload.day_of_week,
            day=payload.day,
        )
    except InvalidSchedule as e:
        raise HTTPException(status_code=400, detail=str(e))

    await save_override(job_id, cron)
    scheduler.reschedule_job(job_id, trigger=CronTrigger.from_crontab(cron))
    await write_audit("schedule_updated", job_id, job_id, {"cron": cron})
    logger.info("Rescheduled job %s to %s", job_id, cron)

    job = scheduler.get_job(job_id)
    return {
        "ok": True,
        "job_id": job_id,
        "cron": cron,
        "schedule_text": humanize_cron(cron),
        "next_run": str(job.next_run_time) if job and job.next_run_time else None,
    }


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
    original_filename: str | None = None


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
        analysis = await _analyze_asset(payload.image_url, payload.original_filename)
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
