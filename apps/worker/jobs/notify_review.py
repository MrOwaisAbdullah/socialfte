"""Notify review job — Week 3, Step 9.

At 04:30 daily: query posts WHERE state='review' AND scheduled_at <= tomorrow.
For each: call notify/discord.py send_approval(post).
Batch limit: 10 per run. If more than 10, send one summary card first.
"""
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from audit import write_audit
from config import settings
from db.models import Post
from db.session import SessionLocal
from notify.discord import send, send_approval

logger = logging.getLogger("worker.notify_review")


async def _write_audit(actor: str, action: str, subject_id: str, payload: dict):
    """Write an audit_log row."""
    await write_audit(actor, action, subject_id, payload)


async def notify_review():
    """Send approval cards to Discord for posts pending review.
    
    Logic:
    - At 04:30 daily: query posts WHERE state='review' AND scheduled_at <= tomorrow
    - For each: call notify/discord.py send_approval(post)
    - Batch limit: 10 per run
    - If more than 10: send one summary card first:
      "You have {n} posts to review. Showing first 10."
    """
    logger.info("Starting notify_review job")
    
    now = datetime.now(timezone.utc)
    tomorrow = now + timedelta(days=1)
    
    async with SessionLocal() as session:
        # Query posts that are in review state and scheduled within the next 24 hours
        result = await session.execute(
            select(Post).where(
                Post.state == "review",
                Post.scheduled_at <= tomorrow,
            ).order_by(Post.scheduled_at)
        )
        posts = result.scalars().all()
    
    if not posts:
        logger.info("No posts pending review")
        return
    
    logger.info("Found %d posts pending review", len(posts))
    
    batch_limit = settings.NOTIFY_REVIEW_BATCH_LIMIT
    total_count = len(posts)
    
    # Send summary card if more than batch limit
    if total_count > batch_limit:
        summary = (
            f"**📋 Review Queue**\n\n"
            f"You have **{total_count}** posts to review.\n"
            f"Showing first **{batch_limit}**."
        )
        await send(summary)
        
        # Write audit log for summary
        await _write_audit(
            actor="notify_review",
            action="batch_summary_sent",
            subject_id="review_queue",
            payload={
                "total_count": total_count,
                "batch_limit": batch_limit,
            },
        )
    
    # Send approval cards for the batch
    sent_count = 0
    for post in posts[:batch_limit]:
        try:
            await send_approval(post)
            sent_count += 1
            
            # Write audit log for each approval card
            await _write_audit(
                actor="notify_review",
                action="approval_card_sent",
                subject_id=str(post.id),
                payload={
                    "platform": post.platform,
                    "format": post.format,
                    "scheduled_at": post.scheduled_at.isoformat() if post.scheduled_at else None,
                },
            )
            
            logger.info("Sent approval card for post %s", post.id)
        
        except Exception as e:
            logger.error("Failed to send approval card for post %s: %s", post.id, e)
            
            # Write audit log for failure
            await _write_audit(
                actor="notify_review",
                action="approval_card_failed",
                subject_id=str(post.id),
                payload={
                    "platform": post.platform,
                    "format": post.format,
                    "error": str(e),
                },
            )
    
    logger.info(
        "Notify review job complete: sent %d approval cards out of %d posts",
        sent_count,
        total_count,
    )
