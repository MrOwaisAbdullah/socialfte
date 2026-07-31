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


async def _pick_distinct_images(primary_asset: Asset, count: int) -> list[str]:
    """Pick up to `count-1` distinct asset URLs (excluding the primary asset).
    Favors underused assets (times_used ASC, created_at DESC) to rotate through
    the catalog. Returns URLs (R2_PUBLIC_URL/r2_key). May return fewer than
    requested if the catalog is small."""
    if count <= 1:
        return []
    async with SessionLocal() as session:
        others = (
            await session.execute(
                select(Asset)
                .where(
                    Asset.id != primary_asset.id,
                    Asset.reject_reason.is_(None),
                )
                .order_by(Asset.times_used.asc(), Asset.created_at.desc())
                .limit(count - 1)
            )
        ).scalars().all()
    urls = [
        f"{settings.R2_PUBLIC_URL}/{asset.r2_key}"
        for asset in others
        if asset.r2_key
    ]
    return urls

# Enhanced template mapping with new compositions
# Provides better variety: glassmorphism, cinematic, grid layouts, bento grids
VIDEO_COMPOSITION_MAP = {
    "hero": "HeroReveal",              # Classic Ken Burns zoom
    "premium-hero": "CinematicReveal",   # Film-inspired letterbox reveal
    "price-card": "PriceReveal",        # Hook + growing bar reveal
    "set-breakdown": "SetReveal",       # Wardrobe door reveal
    "showcase": "ShowcaseCard",         # Glassmorphism premium card
    "grid-layout": "DynamicGrid",       # Modern grid with animated cells
    "quote": "FabricDetail",            # Slow pan across close-up
    "before-after": "FabricDetail",     # Quality proof detail shot
    "carousel-slide": "HeroReveal",     # Carousel format hero
    "lifestyle": "LifestyleFrame",       # Warm room context frame
    "detail-focus": "DetailFocus",       # Circular reveal detail shot
    "product-split": "ProductSplit",     # Split-screen editorial layout
    "bento-gallery": "BentoGallery",     # Square bento grid with mixed cells
    "bento-reel": "BentoReel",          # Portrait bento grid for reels
    "bold-headline": "HeroReveal",       # Two-tone headline + Ken Burns zoom
    "exclusive-badge": "PromoHighlight",  # Built for this exact eyebrow+badge aesthetic
    "light-circle-frame": "DetailFocus",  # "Circular reveal detail shot" matches directly
    "sweet-dreams": "LifestyleFrame",     # Warm bedroom lifestyle context frame
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
        # The quote template renders a short quote as image text — use
        # the headline (2-8 words), NOT the full caption (which includes
        # hashtags and would render as a wall of text on the image).
        return {"quote": headline, "thumbnailUrl": image_url}
    # hero, carousel-slide, and any unregistered slug (render route itself
    # rejects unknown templateIds, so this is just the sane default shape).
    return {"imageUrl": image_url, "headline": headline}


def _build_video_props(composition_id: str, image_url: str, headline: str, extra_image_urls: list[str] | None = None) -> dict:
    """Minimal, functional prop set per composition. `headline` is the caption
    agent's dedicated 2-5 word overlay text (see _build_image_props above) —
    previously derived from the caption's first line truncated at 80 chars."""
    props: dict = {"imageUrl": image_url}
    # Assign multiple images for compositions that support them (BentoReel, etc.)
    if extra_image_urls:
        if len(extra_image_urls) >= 1:
            props["secondaryImage"] = extra_image_urls[0]
        if len(extra_image_urls) >= 2:
            props["thirdImage"] = extra_image_urls[1]
        if len(extra_image_urls) >= 3:
            props["fourthImage"] = extra_image_urls[2]
        if len(extra_image_urls) >= 4:
            props["fifthImage"] = extra_image_urls[3]
    if composition_id == "HeroReveal":
        props["headline"] = headline
    elif composition_id == "PriceReveal":
        props["price"] = headline
    elif composition_id == "FabricDetail":
        props["qualityClaim"] = headline
    elif composition_id == "SetReveal":
        props["setName"] = headline
        props["bundlePrice"] = ""
    elif composition_id == "BentoReel":
        props["productName"] = headline
    elif composition_id == "DetailFocus":
        # detailName is required with no in-component default — was entirely
        # unhandled here, so any "detail-focus"/"light-circle-frame" video
        # post rendered with detailName undefined.
        props["detailName"] = headline
    elif composition_id == "LifestyleFrame":
        props["roomName"] = headline
    elif composition_id == "PromoHighlight":
        props["headline"] = headline
    elif composition_id == "DynamicGrid":
        props["productName"] = headline
    elif composition_id == "ShowcaseCard":
        props["productName"] = headline
    elif composition_id == "ProductSplit":
        props["productName"] = headline
    elif composition_id == "BentoGallery":
        props["title"] = headline
    elif composition_id == "CinematicReveal":
        props["title"] = headline
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


async def _get_target_platforms() -> list[str]:
    """Return the target platforms from brand_config.

    If no brand_config row exists or target_platforms is empty, return all platforms.
    These are the platforms the operator selected in the dashboard Settings page.
    """
    async with SessionLocal() as session:
        row = await session.get(BrandConfig, "default")
        if row and row.target_platforms:
            return row.target_platforms
        return list(PLATFORM_FORMATS.keys())


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
    rejected_assets: set[str] = set()
    for asset in assets:
        asset_id_str = str(asset.id)
        if asset_id_str in rejected_assets:
            continue
        for tmpl in templates:
            if len(candidates) >= MAX_ASSET_TEMPLATE_COMBOS:
                break
            candidates.append((asset, tmpl))
        if len(candidates) >= MAX_ASSET_TEMPLATE_COMBOS:
            break
    return candidates


async def compose_batch():
    """Compose a batch of posts in state='review'. Runs on COMPOSE_BATCH_CRON."""
    logger.info("Starting batch composition — target: %d posts", TARGET_BATCH_SIZE)

    # Track asset/template use within this batch run — anti-repeat only
    # checks 'published' posts, so without this, the same asset/template would
    # be reused for every post in a single batch (all start in 'review' state).
    used_asset_ids: set[str] = set()
    used_template_ids: set[str] = set()

    # Fail-fast: RENDER_INTERNAL_URL must be reachable for image posts.
    # The default (http://localhost:3000) only works for local dev; in Dokploy
    # the dashboard has a generated service hostname. Surface this early
    # instead of failing silently on every render call.
    if not settings.RENDER_INTERNAL_URL or settings.RENDER_INTERNAL_URL == "http://localhost:3000":
        logger.warning(
            "RENDER_INTERNAL_URL is '%s' — this is likely wrong in Dokploy. "
            "Set it to the dashboard app's internal service hostname (check its Dokploy panel). "
            "Image posts will fail to render until this is corrected.",
            settings.RENDER_INTERNAL_URL,
        )

    # R2_PUBLIC_URL must be set for asset URLs to resolve correctly.
    # Without it, asset_image_url becomes "/renders/..." (broken relative URL).
    if not settings.R2_PUBLIC_URL:
        logger.warning(
            "R2_PUBLIC_URL is not set — asset image URLs will be broken. "
            "Set it to your R2 bucket's public URL (e.g. https://pub-xxx.r2.dev)."
        )

    # Drafting doesn't need real publish credentials — only publish_due does,
    # and it already fails safely (post -> state='failed', clear error) when
    # a platform has no real token. Blocking composition entirely here meant
    # zero drafts could ever be created (nothing to review/approve/test)
    # before OAuth setup existed for any platform.
    platforms = await _get_target_platforms()
    if not platforms:
        platforms = list(PLATFORM_FORMATS.keys())
        logger.warning(
            "No target platforms configured — drafting for all platforms (%s) anyway; "
            "configure target platforms in Settings to limit composition",
            ", ".join(platforms),
        )

    candidates = await _pick_candidates()
    if not candidates:
        # Surface the most common reasons immediately rather than a
        # silent "No candidate asset+template pairs" — the operator
        # needs to know whether it's zero assets, zero templates, or
        # all assets rejected.
        async with SessionLocal() as session:
            from sqlalchemy import func as sa_func, select as sa_select
            asset_count = (await session.execute(sa_select(sa_func.count()).select_from(Asset))).scalar_one()
            rejected_count = (await session.execute(
                sa_select(sa_func.count()).select_from(Asset).where(Asset.reject_reason.isnot(None))
            )).scalar_one()
            template_count = (await session.execute(sa_select(sa_func.count()).select_from(Template))).scalar_one()
        logger.warning(
            "No candidate asset+template pairs found for composition "
            "(assets=%d, rejected=%d, templates=%d) — nothing to compose",
            asset_count, rejected_count, template_count,
        )
        return

    composed = 0
    shortfall_reasons: list[str] = []
    rejected_asset_ids: set[str] = set()
    rejected_template_ids: set[str] = set()

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
        tmpl_id_str = str(tmpl.id)

        # Skip assets/templates already rejected in this batch run
        if asset_id_str in rejected_asset_ids:
            continue
        if tmpl_id_str in rejected_template_ids:
            continue

        platform = platforms[attempt % len(platforms)]
        fmt = _choose_format(platform)

        # Intra-batch anti-repeat: prevent reuse within this run since
        # anti-repeat.check_* only looks at 'published' posts, not the
        # 'review' posts we're creating right now.
        if asset_id_str in used_asset_ids:
            shortfall_reasons.append(f"asset {asset_id_str} already used in this batch")
            continue
        if tmpl_id_str in used_template_ids:
            shortfall_reasons.append(f"template {tmpl_id_str} already used in this batch")
            continue

        if not await anti_repeat.check_asset(asset.id):
            shortfall_reasons.append(f"asset {asset_id_str} rejected by anti-repeat")
            rejected_asset_ids.add(asset_id_str)
            continue
        if not await anti_repeat.check_template(tmpl.id):
            shortfall_reasons.append(f"template {tmpl_id_str} rejected by anti-repeat")
            rejected_template_ids.add(tmpl_id_str)
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

        # r2_key is NOT NULL in the DB, but can be an empty string if the
        # asset record was created without an actual file upload. Empty
        # r2_key means the image doesn't exist in R2 — rendering would
        # produce broken images (gradient overlay with no background).
        if not asset.r2_key or not asset.r2_key.strip():
            if not is_video:
                shortfall_reasons.append(f"asset {asset_id_str} has empty r2_key (not uploaded)")
                continue
            # Video renders handle missing assets via GitHub Actions
            asset_image_url = None
        else:
            asset_image_url = f"{settings.R2_PUBLIC_URL}/{asset.r2_key}"
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
            # Pick distinct images for multi-image templates (BentoReel needs up to 5 total)
            distinct_urls = []
            if composition_id in {"BentoReel", "BentoGallery"}:
                distinct_urls = await _pick_distinct_images(asset, 5)
            try:
                await dispatch_video_render(
                    str(post_id),
                    composition_id,
                    _build_video_props(composition_id, asset_image_url or "", headline, distinct_urls),
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

        # Mark asset/template as used in this batch to prevent reuse
        used_asset_ids.add(asset_id_str)
        used_template_ids.add(tmpl_id_str)

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
