"""Discord notification — Week 3, Step 8.

Sends approval cards and basic notifications to Discord.
Uses bot token (not webhook) for sending interactive messages with buttons.

Approval card shows:
- Rendered image
- Caption (truncated to 2000 chars)
- Platform badge
- Scheduled time
- Three buttons: Approve / Edit / Skip
"""
import logging
from datetime import datetime
from typing import Optional

import httpx

from config import settings

logger = logging.getLogger("worker.discord")

API = "https://discord.com/api/v10"


def _get_headers() -> dict:
    """Get Discord bot headers."""
    return {"Authorization": f"Bot {settings.DISCORD_BOT_TOKEN}"}


async def send(text: str, media_url: Optional[str] = None) -> str:
    """Send a basic text message to Discord.
    
    Args:
        text: Message text (can include markdown)
        media_url: Optional URL to attach as an embed image
    
    Returns:
        The message ID
    """
    if not settings.DISCORD_BOT_TOKEN:
        logger.error("DISCORD_BOT_TOKEN not configured")
        raise ValueError("DISCORD_BOT_TOKEN not configured")
    
    if not settings.DISCORD_CHANNEL_ID:
        logger.error("DISCORD_CHANNEL_ID not configured")
        raise ValueError("DISCORD_CHANNEL_ID not configured")
    
    payload = {"content": text}
    
    if media_url:
        payload["embeds"] = [{"image": {"url": media_url}}]
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{API}/channels/{settings.DISCORD_CHANNEL_ID}/messages",
                headers=_get_headers(),
                json=payload,
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()
            
            logger.info("Sent Discord message: %s", data.get("id"))
            return data.get("id")
    
    except httpx.HTTPStatusError as e:
        logger.error("Discord send failed: HTTP %s — %s", e.response.status_code, e.response.text)
        raise
    except Exception as e:
        logger.error("Discord send failed: %s", e)
        raise


async def send_approval(post) -> str:
    """Send an approval card to Discord.
    
    The approval card shows:
    - Rendered image
    - Caption (truncated to 2000 chars)
    - Platform badge
    - Scheduled time
    - Three buttons: Approve / Edit / Skip
    
    Args:
        post: Post object with id, platform, format, caption, render_url, scheduled_at
    
    Returns:
        The message ID
    """
    if not settings.DISCORD_BOT_TOKEN:
        raise ValueError("DISCORD_BOT_TOKEN not configured")
    
    if not settings.DISCORD_CHANNEL_ID:
        raise ValueError("DISCORD_CHANNEL_ID not configured")
    
    # Platform badge emoji
    platform_badges = {
        "facebook": "📘",
        "instagram": "📸",
        "youtube_shorts": "🎬",
        "tiktok": "🎵",
    }
    badge = platform_badges.get(post.platform, "📱")
    
    # Format scheduled time
    scheduled = post.scheduled_at.strftime("%a %d %b, %H:%M") if post.scheduled_at else "Not scheduled"
    
    # Truncate caption to 2000 chars
    caption = (post.caption[:2000] + "...") if post.caption and len(post.caption) > 2000 else (post.caption or "No caption")
    
    # Build the embed
    embed = {
        "title": f"{badge} {post.platform.upper()} · {post.format}",
        "description": caption,
        "color": 0x1B4332,  # Brand primary (Forest Green)
        "footer": {"text": f"Scheduled {scheduled}"},
    }
    
    # Add image if render_url exists
    if post.render_url:
        embed["image"] = {"url": post.render_url}
    
    # Build the buttons
    components = [{
        "type": 1,  # Action Row
        "components": [
            {
                "type": 2,  # Button
                "style": 3,  # Success (green)
                "label": "Approve",
                "custom_id": f"approve:{post.id}",
            },
            {
                "type": 2,
                "style": 2,  # Secondary (grey)
                "label": "Edit",
                "custom_id": f"edit:{post.id}",
            },
            {
                "type": 2,
                "style": 4,  # Danger (red)
                "label": "Skip",
                "custom_id": f"skip:{post.id}",
            },
        ],
    }]
    
    payload = {
        "embeds": [embed],
        "components": components,
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{API}/channels/{settings.DISCORD_CHANNEL_ID}/messages",
                headers=_get_headers(),
                json=payload,
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()
            
            logger.info("Sent approval card for post %s: %s", post.id, data.get("id"))
            return data.get("id")
    
    except httpx.HTTPStatusError as e:
        logger.error("Discord approval card failed: HTTP %s — %s", e.response.status_code, e.response.text)
        raise
    except Exception as e:
        logger.error("Discord approval card failed: %s", e)
        raise


async def send_batch_approval(posts: list, summary: Optional[str] = None) -> str:
    """Send a batch of approval cards to Discord.
    
    If more than 10 posts, sends a summary card first, then individual cards.
    
    Args:
        posts: List of post objects
        summary: Optional summary text (e.g., "You have 15 posts to review")
    
    Returns:
        The message ID of the summary card (or first approval card if no summary)
    """
    if not posts:
        raise ValueError("No posts to send")
    
    # Send summary card if provided
    if summary:
        await send(summary)
    
    # Send individual approval cards (max 10)
    batch_limit = settings.NOTIFY_REVIEW_BATCH_LIMIT
    sent_count = 0
    
    for post in posts[:batch_limit]:
        await send_approval(post)
        sent_count += 1
    
    logger.info("Sent %d approval cards", sent_count)
    return f"Sent {sent_count} approval cards"
