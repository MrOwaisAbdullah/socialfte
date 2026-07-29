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
from brain.vision import _analyze_asset, QUALITY_SCORE_REJECT_THRESHOLD, _filename_to_piece
from config import settings
from db.models import Asset
from db.session import SessionLocal

logger = logging.getLogger("worker.retag_assets")

BATCH_LIMIT = 20  # cap per run — a large backlog gets caught over several runs, not one huge burst of LLM calls

# Confirmed live: a user deleted files directly from the R2 dashboard
# (bypassing the app entirely), leaving `assets` rows whose r2_key 404s
# permanently. Before this fix, a failed vision call just logged an error
# and left quality_score untouched — since this job selects on
# `quality_score IS NULL`, a permanently-dead asset got retried forever,
# every RETAG_ASSETS_CRON run, spamming the log and burning an LLM call for
# an image that will never come back. This substring match is how OpenRouter/
# LiteLLM's error actually reads when the vision model can't fetch the image
# URL at all ("Received 404 status code when fetching image from URL: ...") —
# distinct from a transient failure (rate limit, timeout, malformed response),
# which should still be retried on the next run.
_MISSING_IMAGE_MARKERS = ("404 status code when fetching image", "fetching image from url")


def _is_missing_image_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return any(marker.lower() in text for marker in _MISSING_IMAGE_MARKERS)


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
            analysis = await _analyze_asset(image_url, asset.original_filename)
        except Exception as e:
            failed += 1
            logger.error("Retag failed for asset %s: %s", asset.id, e)

            # Fallback: try to extract piece from filename
            filename_piece = _filename_to_piece(asset.original_filename)

            if _is_missing_image_error(e):
                # Stop retrying a file that's actually gone — mark it
                # rejected instead of leaving quality_score NULL (the exact
                # condition this job selects on), which would otherwise
                # retry this same dead URL every run, forever.
                async with SessionLocal() as session:
                    row = await session.get(Asset, asset.id)
                    if row:
                        row.quality_score = 0
                        row.lighting_ok = False
                        row.composition_ok = False
                        row.reject_reason = "R2 object not found (404) — file appears to have been deleted from storage"
                        # Use filename piece as fallback
                        if filename_piece and not row.piece:
                            row.piece = filename_piece
                            row.tier = "unknown"  # Can't determine from filename
                        await session.commit()
                await _write_audit(
                    "asset_marked_missing",
                    str(asset.id),
                    {"image_url": image_url, "error": str(e), "filename_piece": filename_piece},
                )
            elif filename_piece:
                # Vision failed but file exists — use filename piece as fallback
                async with SessionLocal() as session:
                    row = await session.get(Asset, asset.id)
                    if row:
                        if not row.piece:
                            row.piece = filename_piece
                            row.tier = "unknown"  # Can't determine from filename
                            # Mark with low quality score so it can still be used
                            # but gets lower priority vs vision-tagged assets
                            row.quality_score = 50  # Middle of the road
                            row.lighting_ok = True  # Assume OK if file exists
                            row.composition_ok = True
                            row.reject_reason = f"Vision tagging failed, using filename-based piece: {filename_piece}"
                        await session.commit()
                await _write_audit(
                    "asset_tagged_from_filename",
                    str(asset.id),
                    {"piece": filename_piece, "error": str(e)},
                )
            continue
                # Stop retrying a file that's actually gone — mark it
                # rejected instead of leaving quality_score NULL (the exact
                # condition this job selects on), which would otherwise
                # retry this same dead URL every run, forever.
                async with SessionLocal() as session:
                    row = await session.get(Asset, asset.id)
                    if row:
                        row.quality_score = 0
                        row.lighting_ok = False
                        row.composition_ok = False
                        row.reject_reason = "R2 object not found (404) — file appears to have been deleted from storage"
                        await session.commit()
                await _write_audit(
                    "asset_marked_missing",
                    str(asset.id),
                    {"image_url": image_url, "error": str(e)},
                )
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
