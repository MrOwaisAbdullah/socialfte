"""Daily batch composer — Week 4, US3.

Picks non-repeating asset + template pairs, generates captions via the caption agent,
embeds them and anti-repeat checks them, calls the render endpoint, and writes posts
in state='review' to the approval queue. Runs on COMPOSE_BATCH_CRON (default daily
at 04:00).

spec.md SC-001: A full day's draft posts with zero manual photo/template/caption selection.
"""
import logging
import random
from datetime import datetime, timezone

import httpx
from sqlalchemy import select, update

from audit import write_audit
from brain.base import embed
from brain.composer import write_caption
from composer import anti_repeat
from config import settings
from db.models import Asset, BrandConfig, Credential, Post, Template
from db.session import SessionLocal
from jobs.dispatch_render import dispatch_video_render

logger = logging.getLogger("worker.compose_batch")

TARGET_BATCH_SIZE = 5
MAX_ASSET_TEMPLATE_COMBOS = TARGET_BATCH_SIZE * 3

# Formats each platform actually supports — Facebook and Instagram accept
# either an image or a video post; YouTube Shorts and TikTok are video-only.
# Was a fixed one-format-per-platform map (facebook always "video", instagram
# always "image"), which doesn't match reality and also caused the platform
# round-robin bug: a platform whose single fixed format kept failing had
# nowhere else to go.
PLATFORM_FORMATS: dict[str, list[str]] = {
    "facebook": ["image", "video"],
    "instagram": ["image", "video"],
    "youtube_shorts": ["short"],
    "tiktok": ["video"],
}

VIDEO_FORMATS = {"video", "short", "reel"}


def _choose_format(platform: str) -> str:
    """Pick a format for `platform`. Platforms with only one supported
    format always use it; Facebook/Instagram (both) are chosen by weighted
    random — settings.IMAGE_POST_RATIO fraction of the time image, the rest
    video — so the mix is configurable without hardcoding either format."""
    formats = PLATFORM_FORMATS.get(platform, ["image"])
    if len(formats) == 1:
        return formats[0]
    return "image" if random.random() < settings.IMAGE_POST_RATIO else "video"

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


async def _build_brand_tokens() -> dict:
    """Brand payload sent as `/api/internal/render`'s `brand` field — was
    hardcoded to `{}` (every color/font/wordmark undefined). Reads the
    brand_config row the /setup wizard writes (apps/dashboard/app/api/
    internal/bootstrap/verify), falling back to config.py's BRAND_* env vars
    field-by-field for a fresh deployment with no row yet, or fields the
    wizard doesn't collect (fonts)."""
    row = None
    async with SessionLocal() as session:
        row = await session.get(BrandConfig, "default")

    def field(db_value, env_value):
        return db_value if db_value not in (None, "") else env_value

    return {
        "colors": {
            "primary": field(row and row.primary_color, settings.BRAND_PRIMARY_COLOR),
            "accent": field(row and row.accent_color, settings.BRAND_ACCENT_COLOR),
            "light": field(row and row.light_color, settings.BRAND_LIGHT_COLOR),
            "dark": field(row and row.dark_color, settings.BRAND_DARK_COLOR),
            "muted": field(row and row.muted_color, settings.BRAND_MUTED_COLOR),
        },
        "fonts": {
            "heading": field(row and row.font_heading, settings.BRAND_FONT_HEADING),
            "body": field(row and row.font_body, settings.BRAND_FONT_BODY),
        },
        "wordmark": field(row and row.brand_name, settings.BRAND_NAME),
        "logoUrl": field(row and row.logo_url, settings.BRAND_LOGO_URL) or None,
        "socialHandle": field(row and row.social_handle, settings.BRAND_SOCIAL_HANDLE) or None,
        "showBrandMark": row.show_brand_mark if row else settings.BRAND_SHOW_MARK,
        # Read by skills/caption-writer.md's write_caption() prompt as
        # brand.language — empty/unset means the prompt's own default
        # (Roman Urdu + English) applies.
        "language": field(row and row.caption_language, settings.CAPTION_LANGUAGE) or None,
    }


def _build_image_props(template_slug: str, image_url: str, caption_text: str, headline: str) -> dict:
    """Mirrors _build_video_props below — was sending {"caption": ..., "assetImageUrl": ...}
    unconditionally, which matches none of registry.ts's actual requiredProps for any
    template, so every still-image render 400'd on validateTemplateProps before this fix.
    Maps to each template's real required props (registry.ts); templates needing
    structured data this single-asset pipeline doesn't have (price-card's tier/price,
    set-breakdown's per-piece prices, before-after's second image) get an honest
    best-effort value rather than crashing — same acknowledged gap as SetReveal's
    bundlePrice below.

    `headline` is the caption agent's dedicated 2-5 word overlay text
    (brain/composer.py's write_caption) — was `caption_text.splitlines()[0][:80]`,
    a truncated sentence fragment of the full caption rather than a real headline."""
    if template_slug == "price-card":
        return {"productName": headline, "tierLabel": "", "price": ""}
    if template_slug == "set-breakdown":
        return {"setName": headline, "pieces": [], "bundlePrice": ""}
    if template_slug == "quote":
        return {"quote": caption_text, "thumbnailUrl": image_url}
    if template_slug == "before-after":
        return {"beforeImageUrl": image_url, "afterImageUrl": image_url}
    # hero, carousel-slide, and any unregistered slug (render route itself
    # rejects unknown templateIds, so this is just the sane default shape).
    return {"imageUrl": image_url, "headline": headline}


def _build_video_props(composition_id: str, image_url: str, headline: str) -> dict:
    """Minimal, functional prop set per composition. `headline` is the caption
    agent's dedicated 2-5 word overlay text (see _build_image_props above) —
    previously derived from the caption's first line truncated at 80 chars."""
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

    # Drafting doesn't need real publish credentials — only publish_due does,
    # and it already fails safely (post -> state='failed', clear error) when
    # a platform has no real token. Blocking composition entirely here meant
    # zero drafts could ever be created (nothing to review/approve/test)
    # before OAuth setup existed for any platform.
    platforms = await _get_connected_platforms()
    if not platforms:
        platforms = list(PLATFORM_FORMATS.keys())
        logger.warning(
            "No connected platform credentials — drafting for all platforms (%s) anyway; "
            "publish_due will still refuse to publish until real credentials exist",
            ", ".join(platforms),
        )

    candidates = await _pick_candidates()
    if not candidates:
        logger.warning("No candidate asset+template pairs found for composition")
        return

    composed = 0
    shortfall_reasons: list[str] = []

    # Computed once and reused for both the caption prompt and the render
    # payload below — was only built inside the still-image render branch,
    # so write_caption() never got brand.language, brand.wordmark, or
    # anything else here; every real call passed brand={} (the signature's
    # default), meaning captions were always written with zero brand context.
    brand_tokens = await _build_brand_tokens()

    # Indexed by attempt (enumerate), not by `composed` (successes) — using
    # `composed` here meant a failing first platform (e.g. Facebook's video
    # dispatch erroring on every attempt) kept `composed` stuck at 0, so
    # platforms[0 % len(platforms)] picked the SAME failing platform for
    # every single candidate and the loop never rotated to Instagram/
    # YouTube/TikTok at all — confirmed live: only Facebook posts were ever
    # attempted, all failing the same way, zero image posts ever tried.
    for attempt, (asset, tmpl) in enumerate(candidates):
        if composed >= TARGET_BATCH_SIZE:
            break

        asset_id_str = str(asset.id)
        platform = platforms[attempt % len(platforms)]
        fmt = _choose_format(platform)

        if not await anti_repeat.check_asset(asset.id):
            shortfall_reasons.append(f"asset {asset_id_str} rejected by anti-repeat")
            continue
        if not await anti_repeat.check_template(tmpl.id):
            shortfall_reasons.append(f"template {tmpl.id} rejected by anti-repeat")
            continue

        try:
            caption, headline, hashtags = await write_caption(asset, tmpl, brand=brand_tokens)
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
                caption, headline, hashtags = await write_caption(asset, tmpl, brand=brand_tokens)
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
                    _build_video_props(composition_id, asset_image_url or "", headline),
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
                            "props": _build_image_props(tmpl.slug, asset_image_url or "", caption_text, headline),
                            "aspect": "square",
                            "brand": brand_tokens,
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

        await write_audit(
            "compose_batch",
            "post_composed",
            str(post_id),
            {
                "asset_id": asset_id_str,
                "template_id": str(tmpl.id),
                "caption_length": len(caption_text),
                "headline": headline,
                "platform": platform,
                "format": fmt,
                "state": "draft" if is_video else "review",
            },
        )

        async with SessionLocal() as session:
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
        await write_audit(
            "compose_batch",
            "batch_shortfall",
            "compose_batch",
            {"composed": composed, "shortfalls": shortfall_reasons},
        )

    logger.info("Batch composition complete: %d posts composed", composed)
