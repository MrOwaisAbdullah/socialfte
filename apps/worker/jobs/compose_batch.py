"""Daily batch composer — Week 4, US3.

Picks non-repeating asset + template pairs, generates captions via the caption agent,
embeds them and anti-repeat checks them, calls the render endpoint, and writes draft
posts to the review queue. Runs on COMPOSE_BATCH_CRON (default daily at 04:00).

spec.md SC-001: A full day's draft posts with zero manual photo/template/caption selection.
"""
import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy import select, update

from brain.base import embed
from brain.composer import write_caption
from composer import anti_repeat
from config import settings
from db.models import Asset, AuditLog, Post, Template
from db.session import SessionLocal

logger = logging.getLogger("worker.compose_batch")

TARGET_BATCH_SIZE = 5
MAX_ASSET_TEMPLATE_COMBOS = TARGET_BATCH_SIZE * 3


async def _pick_candidates() -> list[tuple[Asset, Template]]:
    """Return up to MAX_ASSET_TEMPLATE_COMBOS (asset, template) pairs that pass the
    anti-repeat checks, preferring assets with fewer prior uses and templates in
    creation order."""
    async with SessionLocal() as session:
        assets = (
            await session.execute(
                select(Asset)
                .where(Asset.reject_reason.is_(None))
                .order_by(Asset.times_used.asc(), Asset.created_at.desc())
                .limit(MAX_ASSET_TEMPLATE_COMBOS)
            )
        ).scalars().all()

        templates = (
            await session.execute(
                select(Template)
                .order_by(Template.created_at.asc())
                .limit(TARGET_BATCH_SIZE * 2)
            )
        ).scalars().all()

    candidates: list[tuple[Asset, Template]] = []
    for asset in assets:
        for tmpl in templates:
            if len(candidates) >= MAX_ASSET_TEMPLATE_COMBOS:
                break
            candidates.append((asset, tmpl))
    return candidates


async def compose_batch():
    """Compose a batch of draft posts. Runs on COMPOSE_BATCH_CRON."""
    logger.info("Starting batch composition — target: %d posts", TARGET_BATCH_SIZE)

    candidates = await _pick_candidates()
    if not candidates:
        logger.warning("No candidate asset+template pairs found for composition")
        return

    composed = 0
    shortfall_reasons: list[str] = []

    for asset, tmpl in candidates:
        if composed >= TARGET_BATCH_SIZE:
            break

        asset_id_str = str(asset.id)

        if not await anti_repeat.check_asset(asset.id):
            shortfall_reasons.append(f"asset {asset_id_str} rejected by anti-repeat")
            continue
        if not await anti_repeat.check_template(tmpl.id):
            shortfall_reasons.append(f"template {tmpl.id} rejected by anti-repeat")
            continue

        try:
            caption, hashtags = await write_caption(asset, tmpl)
        except Exception as e:
            logger.error("Caption generation failed for asset %s: %s", asset_id_str, e)
            shortfall_reasons.append(f"caption failed for asset {asset_id_str}: {e}")
            continue

        caption_text = (caption or "") + "\n\n" + " ".join(hashtags) if hashtags else (caption or "")

        caption_vec = None
        caption_ok = False
        for retry in range(settings.ANTI_REPEAT_MAX_RETRIES + 1):
            caption_vec = await embed(caption_text)
            if await anti_repeat.check_caption(caption_vec):
                caption_ok = True
                break
            logger.warning("Caption rejected by anti-repeat (attempt %d), regenerating", retry)
            try:
                caption, hashtags = await write_caption(asset, tmpl)
            except Exception:
                break
        if not caption_ok:
            shortfall_reasons.append(f"caption anti-repeat exhausted for asset {asset_id_str}")
            continue

        render_url = None
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(
                    f"{settings.RENDER_INTERNAL_URL}/api/internal/render",
                    headers={"x-render-secret": settings.RENDER_INTERNAL_SECRET},
                    json={
                        "templateId": tmpl.slug,
                        "props": {"caption": caption_text},
                        "aspect": "square",
                        "brand": {},
                    },
                )
                resp.raise_for_status()
                render_url = resp.json().get("url")
        except Exception as e:
            logger.error("Render failed for asset %s: %s", asset_id_str, e)
            shortfall_reasons.append(f"render failed for asset {asset_id_str}: {e}")
            continue

        async with SessionLocal() as session:
            post = Post(
                platform="instagram",
                format="image",
                state="draft",
                template_id=tmpl.id,
                asset_id=asset.id,
                caption=caption_text,
                caption_vec=caption_vec,
                render_url=render_url,
            )
            session.add(post)
            await session.commit()

            session.add(
                AuditLog(
                    actor="compose_batch",
                    action="post_composed",
                    subject_id=str(post.id),
                    payload={
                        "asset_id": asset_id_str,
                        "template_id": str(tmpl.id),
                        "caption_length": len(caption_text),
                        "platform": "instagram",
                    },
                )
            )

            await session.execute(
                update(Asset)
                .where(Asset.id == asset.id)
                .values(times_used=Asset.times_used + 1)
            )
            await session.commit()

        composed += 1
        logger.info("Composed post %d: asset=%s template=%s", composed, asset_id_str, tmpl.slug)

        if composed >= TARGET_BATCH_SIZE:
            break

    if shortfall_reasons:
        summary = "; ".join(shortfall_reasons)
        logger.warning("Batch shortfall (%d composed, %d shortfalls): %s", composed, len(shortfall_reasons), summary)
        async with SessionLocal() as session:
            session.add(
                AuditLog(
                    actor="compose_batch",
                    action="batch_shortfall",
                    subject_id="compose_batch",
                    payload={"composed": composed, "shortfalls": shortfall_reasons},
                )
            )
            await session.commit()

    logger.info("Batch composition complete: %d posts composed", composed)
