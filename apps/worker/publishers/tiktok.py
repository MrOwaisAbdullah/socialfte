"""TikTok publisher — Week 3, Step 6.

Draft-only mode (default): uploads to R2, writes posts row in state 'tiktok_ready',
sends Discord notification with R2 URL and "Download and post manually" message.

Direct-post mode (future, audited): uses Content Posting API direct-post endpoint.
This flag means the audited path can be switched on later without a rewrite.

Per §5: "Unaudited API clients can only post SELF_ONLY. The audit is a serial
multi-week review. For the first 90 days, don't fight it."
"""
import logging
from datetime import datetime, timezone
from typing import Optional

import notify.discord
from config import settings
from db.models import AuditLog, Post
from db.session import SessionLocal

logger = logging.getLogger("worker.tiktok")


async def _write_audit(actor: str, action: str, subject_id: str, payload: dict):
    """Write an audit_log row."""
    async with SessionLocal() as session:
        audit = AuditLog(
            actor=actor,
            action=action,
            subject_id=subject_id,
            payload=payload,
        )
        session.add(audit)
        await session.commit()


async def publish_video(
    post_id: str,
    video_url: str,
    caption: str,
    thumbnail_url: Optional[str] = None,
) -> str | None:
    """Publish a video to TikTok or prepare it for manual upload.
    
    When TIKTOK_MODE=draft_only (default):
        - Uploads video to R2 (already done by render job)
        - Writes posts row with state='tiktok_ready'
        - Sends Discord notification with R2 URL and "Download and post manually"
    
    When TIKTOK_MODE=direct_post (future, audited):
        - Uses the Content Posting API direct-post endpoint
    
    Args:
        post_id: The post ID in the database
        video_url: Public URL of the video (R2 public URL)
        caption: Video caption text
        thumbnail_url: Optional thumbnail URL
    
    Returns:
        The TikTok video ID (external_id) or None if draft-only
    
    Raises:
        Exception: If direct_post fails
    """
    if settings.TIKTOK_MODE == "direct_post":
        return await _publish_direct(post_id, video_url, caption, thumbnail_url)
    else:
        return await _publish_draft_only(post_id, video_url, caption, thumbnail_url)


async def _publish_draft_only(
    post_id: str,
    video_url: str,
    caption: str,
    thumbnail_url: Optional[str] = None,
) -> None:
    """Prepare a TikTok video for manual upload (draft-only mode).
    
    This is the default mode while TikTok API audit is pending.
    """
    try:
        # Update the post state to 'tiktok_ready'
        async with SessionLocal() as session:
            result = await session.get(Post, post_id)
            if result:
                result.state = "tiktok_ready"
                result.updated_at = datetime.now(timezone.utc)
                await session.commit()
        
        # Send Discord notification with download link
        message = (
            f"**TikTok Ready** 🎬\n\n"
            f"Video is ready for manual upload:\n"
            f"📥 Download: {video_url}\n\n"
            f"**Caption:**\n{caption[:500]}\n\n"
            f"**Instructions:**\n"
            f"1. Download the video from the link above\n"
            f"2. Open TikTok app\n"
            f"3. Upload and paste the caption\n"
            f"4. Post!"
        )
        
        await notify.discord.send(message)
        
        # Write audit log
        await _write_audit(
            actor="tiktok_publisher",
            action="draft_ready",
            subject_id=post_id,
            payload={
                "video_url": video_url,
                "caption_length": len(caption),
                "platform": "tiktok",
                "mode": "draft_only",
            },
        )
        
        logger.info("TikTok video ready for manual upload: %s", post_id)
        return None
    
    except Exception as e:
        # Write audit log on failure
        await _write_audit(
            actor="tiktok_publisher",
            action="draft_ready_failed",
            subject_id=post_id,
            payload={
                "video_url": video_url,
                "error": str(e),
                "platform": "tiktok",
                "mode": "draft_only",
            },
        )
        raise


async def _publish_direct(
    post_id: str,
    video_url: str,
    caption: str,
    thumbnail_url: Optional[str] = None,
) -> str:
    """Publish a video directly to TikTok using the Content Posting API.
    
    This mode is for when the TikTok API audit is complete.
    Requires TIKTOK_MODE=direct_post.
    """
    import httpx

    if not settings.TIKTOK_ACCESS_TOKEN:
        raise ValueError("TIKTOK_ACCESS_TOKEN not configured for direct_post mode")

    headers = {
        "Authorization": f"Bearer {settings.TIKTOK_ACCESS_TOKEN}",
        "Content-Type": "application/json; charset=UTF-8",
    }

    try:
        async with httpx.AsyncClient() as client:
            # Step 0: Query creator info — required before every post. Returns the
            # privacy levels this creator/app is actually allowed to use; unaudited
            # apps only ever get SELF_ONLY back regardless of what we'd prefer.
            creator_response = await client.post(
                "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
                headers=headers,
                json={},
                timeout=30.0,
            )
            creator_response.raise_for_status()
            creator_data = creator_response.json().get("data", {})
            privacy_options = creator_data.get("privacy_level_options") or ["SELF_ONLY"]
            privacy_level = privacy_options[0]

            # Step 1: Initialize the post. PULL_FROM_URL lets TikTok's servers fetch
            # the video directly from our public R2 URL — no need to download it
            # into the worker and re-upload it ourselves.
            init_response = await client.post(
                "https://open.tiktokapis.com/v2/post/publish/video/init/",
                headers=headers,
                json={
                    "post_info": {
                        "title": caption[:150],  # TikTok title limit
                        "privacy_level": privacy_level,
                        "disable_duet": False,
                        "disable_comment": False,
                        "disable_stitch": False,
                    },
                    "source_info": {
                        "source": "PULL_FROM_URL",
                        "video_url": video_url,
                    },
                },
                timeout=60.0,
            )
            init_response.raise_for_status()
            init_data = init_response.json().get("data", {})

            publish_id = init_data.get("publish_id")

            if not publish_id:
                raise ValueError(f"Failed to initialize TikTok upload: {init_data}")

            # Step 2: Poll publish status. No upload step needed — TikTok's servers
            # are pulling the video from video_url themselves.
            max_retries = 30
            for i in range(max_retries):
                status_response = await client.post(
                    "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
                    headers=headers,
                    json={"publish_id": publish_id},
                    timeout=30.0,
                )
                status_response.raise_for_status()
                status_data = status_response.json().get("data", {})
                
                if status_data.get("status") == "PUBLISH_COMPLETE":
                    break
                elif status_data.get("status") == "FAILED":
                    raise ValueError(f"TikTok publish failed: {status_data}")
                
                # Wait before next poll
                import asyncio
                await asyncio.sleep(5)
            else:
                raise ValueError(f"TikTok publish not complete after {max_retries} retries")
            
            # Write audit log
            await _write_audit(
                actor="tiktok_publisher",
                action="direct_post_success",
                subject_id=publish_id,
                payload={
                    "post_id": post_id,
                    "video_url": video_url,
                    "caption_length": len(caption),
                    "platform": "tiktok",
                    "mode": "direct_post",
                },
            )
            
            logger.info("Published video to TikTok: %s", publish_id)
            return publish_id
    
    except Exception as e:
        # Write audit log on failure
        await _write_audit(
            actor="tiktok_publisher",
            action="direct_post_failed",
            subject_id=post_id,
            payload={
                "video_url": video_url,
                "error": str(e),
                "platform": "tiktok",
                "mode": "direct_post",
            },
        )
        raise
