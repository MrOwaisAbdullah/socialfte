"""Publish due job — Week 3, Step 7.

Runs every 15 minutes (§9). Queries posts WHERE state='approved' AND scheduled_at <= now().
Applies per-platform daily cap check. For each eligible post, calls the right publisher.
On success: updates post state='published', writes audit_log.
On failure: updates post state='failed', notifies Discord, writes audit_log.
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, func

from audit import write_audit
from config import settings
from db.models import Post
from db.session import SessionLocal
from notify.discord import send

logger = logging.getLogger("worker.publish_due")

# Platform-specific cap env vars
CAP_VARS = {
    "facebook": "CAP_FACEBOOK_PER_DAY",
    "instagram": "CAP_INSTAGRAM_PER_DAY",
    "youtube_shorts": "CAP_YOUTUBE_PER_DAY",
    "tiktok": "CAP_TIKTOK_PER_DAY",
}


async def _write_audit(actor: str, action: str, subject_id: str, payload: dict):
    """Write an audit_log row."""
    await write_audit(actor, action, subject_id, payload)


async def _check_platform_cap(platform: str, format_type: str) -> bool:
    """Check if the platform has exceeded its daily cap.
    
    Args:
        platform: Platform name (facebook, instagram, youtube_shorts, tiktok)
        format_type: Format type (image, reel, story, short)
    
    Returns:
        True if under cap (can publish), False if cap reached
    """
    # Special case: Instagram stories have their own cap
    if platform == "instagram" and format_type == "story":
        cap = settings.CAP_INSTAGRAM_STORIES_PER_DAY
    else:
        cap_var = CAP_VARS.get(platform)
        if not cap_var:
            # Unknown platform, allow by default
            return True
        cap = getattr(settings, cap_var, 2)
    
    async with SessionLocal() as session:
        # Count published posts for this platform today
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        
        result = await session.execute(
            select(func.count(Post.id)).where(
                Post.platform == platform,
                Post.state == "published",
                Post.published_at >= today_start,
            )
        )
        count = result.scalar() or 0
        
        return count < cap


async def _dispatch_publisher(post: Post) -> str:
    """Dispatch to the appropriate publisher based on platform + format.
    
    Args:
        post: The post to publish
    
    Returns:
        The external_id from the platform
    
    Raises:
        ValueError: If no publisher found for platform/format
    """
    platform = post.platform
    format_type = post.format
    
    if platform == "facebook":
        from publishers.meta import post_image, post_reel
        page_id = settings.META_PAGE_ID
        if not page_id:
            raise ValueError("META_PAGE_ID not configured")
        
        if format_type == "image":
            return await post_image(page_id, post.render_url, post.caption)
        elif format_type == "reel":
            return await post_reel(page_id, post.render_url, post.caption)
        else:
            raise ValueError(f"Unsupported Facebook format: {format_type}")
    
    elif platform == "instagram":
        from publishers.meta import post_ig_image, post_ig_reel, post_story
        ig_user_id = settings.META_IG_USER_ID
        if not ig_user_id:
            raise ValueError("META_IG_USER_ID not configured")
        
        if format_type == "image":
            return await post_ig_image(ig_user_id, post.render_url, post.caption)
        elif format_type == "reel":
            return await post_ig_reel(ig_user_id, post.render_url, post.caption)
        elif format_type == "story":
            return await post_story(ig_user_id, post.render_url)
        else:
            raise ValueError(f"Unsupported Instagram format: {format_type}")
    
    elif platform == "youtube_shorts":
        from publishers.youtube import upload_video
        plan = {
            "video": post.render_url,
            "title": post.caption[:100] if post.caption else "Untitled",
            "description": post.caption or "",
            "tags": [],
            "privacy": settings.YOUTUBE_PRIVACY_ON_UPLOAD,
        }
        return await upload_video(plan)
    
    elif platform == "tiktok":
        from publishers.tiktok import publish_video
        return await publish_video(
            post_id=str(post.id),
            video_url=post.render_url,
            caption=post.caption or "",
        )
    
    else:
        raise ValueError(f"Unknown platform: {platform}")


async def publish_due():
    """Publish approved posts past their scheduled_at.
    
    Logic:
    - Query posts WHERE state='approved' AND scheduled_at <= now()
    - Apply per-platform daily cap check (read CAP_* env vars)
    - For each eligible post:
        try:
            call the right publisher based on post.platform + post.format
            update post: state='published', published_at=now(), external_id=...
            write audit_log
        except:
            update post: state='failed', error=str(e)
            notify(f"Publish failed: {post.id} on {post.platform} — {e}")
            write audit_log
    """
    logger.info("Starting publish_due job")
    
    now = datetime.now(timezone.utc)
    
    async with SessionLocal() as session:
        # Query posts that are approved and past their scheduled time
        result = await session.execute(
            select(Post).where(
                Post.state == "approved",
                Post.scheduled_at <= now,
            ).order_by(Post.scheduled_at)
        )
        posts = result.scalars().all()
    
    if not posts:
        logger.info("No posts due for publishing")
        return
    
    logger.info("Found %d posts due for publishing", len(posts))
    
    published_count = 0
    failed_count = 0
    skipped_count = 0
    
    for post in posts:
        logger.info(
            "Processing post %s: platform=%s, format=%s, scheduled_at=%s",
            post.id, post.platform, post.format, post.scheduled_at,
        )
        
        # Check platform cap
        if not await _check_platform_cap(post.platform, post.format):
            logger.info("Post %s skipped: %s daily cap reached", post.id, post.platform)
            skipped_count += 1
            continue
        
        try:
            # Dispatch to the appropriate publisher
            external_id = await _dispatch_publisher(post)

            # Update post state — re-attach the already-fetched post (it detached
            # when the query's session block above closed) rather than a redundant
            # re-fetch by id.
            post.state = "published"
            post.published_at = now
            post.external_id = external_id
            post.updated_at = now
            async with SessionLocal() as session:
                session.add(post)
                await session.commit()
            
            # Write audit log
            await _write_audit(
                actor="publish_due",
                action="publish_success",
                subject_id=str(post.id),
                payload={
                    "platform": post.platform,
                    "format": post.format,
                    "external_id": external_id,
                },
            )
            
            published_count += 1
            logger.info("Published post %s to %s: %s", post.id, post.platform, external_id)
        
        except Exception as e:
            # Update post state to failed
            post.state = "failed"
            post.error = str(e)
            post.updated_at = now
            async with SessionLocal() as session:
                session.add(post)
                await session.commit()
            
            # Write audit log
            await _write_audit(
                actor="publish_due",
                action="publish_failed",
                subject_id=str(post.id),
                payload={
                    "platform": post.platform,
                    "format": post.format,
                    "error": str(e),
                },
            )
            
            # Notify Discord
            error_msg = (
                f"**Publish Failed** ❌\n\n"
                f"Post `{post.id}` on **{post.platform}** failed:\n"
                f"`{str(e)[:500]}`"
            )
            try:
                await send(error_msg)
            except Exception as notify_error:
                logger.error("Failed to send error notification: %s", notify_error)
            
            failed_count += 1
            logger.error("Failed to publish post %s to %s: %s", post.id, post.platform, e)
    
    logger.info(
        "Publish due job complete: %d published, %d failed, %d skipped out of %d posts",
        published_count,
        failed_count,
        skipped_count,
        len(posts),
    )
