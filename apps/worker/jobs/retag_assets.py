"""Vision-tagging retry job.

/api/internal/assets/upload and /api/assets/upload (apps/dashboard) fire a
best-effort, non-blocking call to the worker's /vision/tag right after
upload — if that call fails for any reason (network blip, wrong internal
hostname, LLM timeout), the asset silently stays untagged forever, since
nothing ever retries it. Confirmed live: all 10 real uploaded assets had
piece/tier/variant/quality_score all null after the WORKER_INTERNAL_URL
hostname was misconfigured at upload time.

This job finds assets with quality_score IS NULL (never successfully
tagged) and retries brain.vision's tagging call for each — same fields, same
audit actions as the live upload-time call, just catching up whatever the
one-shot fire-and-forget call missed. Runs on RETAG_ASSETS_CRON (default
every 6 hours) and is manually runnable from the dashboard's Jobs page.
"""
import logging

from sqlalchemy import select

from audit import write_audit
from brain.vision import _analyze_asset, QUALITY_SCORE_REJECT_THRESHOLD
from config import settings
from db.models import Asset
from db.session import SessionLocal

logger = logging.getLogger("worker.retag_assets")

BATCH_LIMIT = 20  # cap per run — a large backlog gets caught over several runs, not one huge burst of LLM calls


async def _write_audit(action: str, subject_id: str, payload: dict):
    await write_audit("vision_agent", action, subject_id, payload)


async def retag_assets():
    """Retag every asset that was never successfully vision-tagged."""
    async with SessionLocal() as session:
        untagged = (
            await session.execute(
                select(Asset).where(Asset.quality_score.is_(None)).limit(BATCH_LIMIT)
            )
        ).scalars().all()

    if not untagged:
        logger.info("No untagged assets found")
        return

    logger.info("Retagging %d untagged asset(s)", len(untagged))
    tagged = 0
    failed = 0

    for asset in untagged:
        if not asset.r2_key:
            continue
        image_url = f"{settings.R2_PUBLIC_URL}/{asset.r2_key}"
        try:
            analysis = await _analyze_asset(image_url)
        except Exception as e:
            failed += 1
            logger.error("Retag failed for asset %s: %s", asset.id, e)
            continue

        reject_reason = None
        if analysis.quality_score < QUALITY_SCORE_REJECT_THRESHOLD:
            reasons = []
            if not analysis.lighting_ok:
                reasons.append("poor lighting")
            if not analysis.composition_ok:
                reasons.append("poor composition")
            reject_reason = ", ".join(reasons) or f"quality_score {analysis.quality_score} below threshold"

        async with SessionLocal() as session:
            row = await session.get(Asset, asset.id)
            if row:
                row.piece = analysis.piece
                row.tier = analysis.tier
                row.variant = analysis.variant
                row.quality_score = analysis.quality_score
                row.lighting_ok = analysis.lighting_ok
                row.composition_ok = analysis.composition_ok
                row.reject_reason = reject_reason
                await session.commit()

        await _write_audit(
            "asset_tagged",
            str(asset.id),
            {"piece": analysis.piece, "tier": analysis.tier, "variant": analysis.variant, "quality_score": analysis.quality_score},
        )
        await _write_audit(
            "asset_quality_checked",
            str(asset.id),
            {"quality_score": analysis.quality_score, "lighting_ok": analysis.lighting_ok, "composition_ok": analysis.composition_ok, "reject_reason": reject_reason},
        )
        tagged += 1

    logger.info("Retag complete: %d tagged, %d failed", tagged, failed)
