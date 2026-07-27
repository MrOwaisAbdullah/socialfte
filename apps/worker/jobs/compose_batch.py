"""Daily batch composer — Week 4, US3.

Picks non-repeating asset + template pairs, generates captions via the caption agent,
embeds them and anti-repeat checks them, calls the render endpoint, and writes posts
in state='review' to the approval queue. Runs on COMPOSE_BATCH_CRON (default daily
at 04:00).

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
from db.models import Asset, AuditLog, Credential, Post, Template
from db.session import SessionLocal
from jobs.dispatch_render import dispatch_video_render

logger = logging.getLogger("worker.compose_batch")

TARGET_BATCH_SIZE = 5
MAX_ASSET_TEMPLATE_COMBOS = TARGET_BATCH_SIZE * 3

PLATFORM_FORMAT_MAP = {
    "facebook": "video",
    "instagram": "image",
    "youtube_shorts": "short",
    "tiktok": "video",
}

VIDEO_FORMATS = {"video", "short", "reel"}

# Closest analog between the six Week 2 static templates and the four Week 5
# video compositions (packages/remotion/src/compositions/) — there's no 1:1
# mapping mandated anywhere, this is a reasonable starting default, not a
# hard requirement.
VIDEO_COMPOSITION_MAP = {
    "hero": "HeroReveal",
    "price-card": "PriceReveal",
    "set-breakdown": "SetReveal",
    "quote": "FabricDetail",
    "before-after": "FabricDetail",
    "carousel-slide": "HeroReveal",
}


def _build_video_props(composition_id: str, image_url: str, caption_text: str) -> dict:
    """Minimal, functional prop set per composition — derives text props from
    the generated caption rather than requiring a separate structured-content
    step the spec doesn't call for."""
    headline = caption_text.splitlines()[0][:80] if caption_text else ""
    props: dict = {"imageUrl": image_url}
    if composition_id == "HeroReveal":
        props["headline"] = headline
    elif composition_id == "PriceReveal":
        props["price"] = headline
    elif composition_id == "FabricDetail":
        props["qualityClaim"] = headline
    elif composition_id == "SetReveal":
        props["setName"] = headline
        props["bundlePrice"] = ""
    return props


async def _get_connected_platforms() -> list[str]:
    """Return platform strings from credentials that are usable right now.

    A NULL expires_at means "no expiry concept" (e.g. YouTube's refresh-token-based
    credential) and must count as valid, not excluded — matching db/credentials.py's
    own is_expiring_soon() convention (None => not expiring). `expires_at > now` alone
    would silently drop every NULL-expiry platform, since SQL NULL > x is NULL (falsy).
    """
    async with SessionLocal() as session:
        now = datetime.now(timezone.utc)
        creds = (
            await session.execute(
                select(Credential.platform).where(
                    (Credential.expires_at.is_(None)) | (Credential.expires_at > now),
                )
            )
        ).scalars().all()
        return list(dict.fromkeys(creds))  # unique, preserve order


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
    """Compose a batch of posts in state='review'. Runs on COMPOSE_BATCH_CRON."""
    logger.info("Starting batch composition — target: %d posts", TARGET_BATCH_SIZE)

    platforms = await _get_connected_platforms()
    if not platforms:
        logger.warning("No connected platform credentials found")
        return

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
        platform = platforms[composed % len(platforms)]
        fmt = PLATFORM_FORMAT_MAP.get(platform, "image")

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

        caption_vec = None
        caption_ok = False
        caption_text = ""
        for retry in range(settings.ANTI_REPEAT_MAX_RETRIES + 1):
            caption_text = (caption or "") + ("\n\n" + " ".join(hashtags) if hashtags else "")
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

        asset_image_url = f"{settings.R2_PUBLIC_URL}/{asset.r2_key}" if asset.r2_key else None
        is_video = fmt in VIDEO_FORMATS

        if is_video:
            # Video rendering is asynchronous (GitHub Actions + a callback,
            # Week 5 Step 2) — the post has to exist before we can dispatch a
            # render for it (the composition uses the post's own ID as the R2
            # output key), and it starts at 'draft' rather than 'review' since
            # there's no render_url yet. POST /api/render-complete
            # (apps/worker/main.py) is what moves it to 'review' once the
            # workflow finishes.
            async with SessionLocal() as session:
                post = Post(
                    platform=platform,
                    format=fmt,
                    state="draft",
                    template_id=tmpl.id,
                    asset_id=asset.id,
                    caption=caption_text,
                    caption_vec=caption_vec,
                )
                session.add(post)
                await session.commit()
                post_id = post.id

            composition_id = VIDEO_COMPOSITION_MAP.get(tmpl.slug, "HeroReveal")
            try:
                await dispatch_video_render(
                    str(post_id),
                    composition_id,
                    _build_video_props(composition_id, asset_image_url or "", caption_text),
                )
            except Exception as e:
                logger.error("Video dispatch failed for post %s: %s", post_id, e)
                async with SessionLocal() as session:
                    failed_post = await session.get(Post, post_id)
                    if failed_post:
                        failed_post.state = "failed"
                        failed_post.error = str(e)
                        await session.commit()
                shortfall_reasons.append(f"video dispatch failed for asset {asset_id_str}: {e}")
                continue
        else:
            render_url = None
            try:
                async with httpx.AsyncClient(timeout=120.0) as client:
                    resp = await client.post(
                        f"{settings.RENDER_INTERNAL_URL}/api/internal/render",
                        headers={"x-render-secret": settings.RENDER_INTERNAL_SECRET},
                        json={
                            "templateId": tmpl.slug,
                            "props": {"caption": caption_text, "assetImageUrl": asset_image_url},
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
                    platform=platform,
                    format=fmt,
                    state="review",
                    template_id=tmpl.id,
                    asset_id=asset.id,
                    caption=caption_text,
                    caption_vec=caption_vec,
                    render_url=render_url,
                )
                session.add(post)
                await session.commit()
                post_id = post.id

        async with SessionLocal() as session:
            session.add(
                AuditLog(
                    actor="compose_batch",
                    action="post_composed",
                    subject_id=str(post_id),
                    payload={
                        "asset_id": asset_id_str,
                        "template_id": str(tmpl.id),
                        "caption_length": len(caption_text),
                        "platform": platform,
                        "format": fmt,
                        "state": "draft" if is_video else "review",
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
        logger.info("Composed post %d: asset=%s template=%s platform=%s", composed, asset_id_str, tmpl.slug, platform)

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
