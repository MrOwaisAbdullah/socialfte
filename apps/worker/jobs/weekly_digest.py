"""Weekly performance digest — Week 4, US5.

Summarizes the past week's publishing activity and performance, sends the summary
to the configured notification channel (Discord), and appends a dated section to
MEMORY.md for a durable, human-readable history.

Runs on WEEKLY_DIGEST_CRON (default Sundays at 05:00).
"""
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

from agents import Agent, Runner
from sqlalchemy import select, func as sqlfunc

from audit import write_audit
from brain.base import model, load_prompt
from config import settings
from db.models import Metric, Post
from db.session import SessionLocal

logger = logging.getLogger("worker.weekly_digest")


async def _query_weekly_data() -> dict:
    """Query the past 7 days of posts and metrics for the digest."""
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    async with SessionLocal() as session:
        posts = (
            await session.execute(
                select(Post).where(Post.published_at >= week_ago).order_by(Post.published_at.desc())
            )
        ).scalars().all()

        metrics = (
            await session.execute(
                select(Metric).where(Metric.collected_at >= week_ago).order_by(Metric.collected_at.desc())
            )
        ).scalars().all()

        total_published = len(posts)
        by_platform = {}
        for p in posts:
            by_platform.setdefault(p.platform, {"count": 0, "external_ids": []})
            by_platform[p.platform]["count"] += 1
            if p.external_id:
                by_platform[p.platform]["external_ids"].append(p.external_id)

        top_reach = None
        for m in metrics:
            if m.reach and (top_reach is None or m.reach > top_reach[1]):
                top_reach = (m.post_id, m.reach)

        errors = []
        for p in posts:
            if p.error:
                errors.append({"post_id": str(p.id), "error": p.error})

        return {
            "total_published": total_published,
            "by_platform": by_platform,
            "top_reach": top_reach,
            "errors": errors,
            "metrics_count": len(metrics),
        }


async def _write_digest(weekly_data: dict) -> str:
    """Call the judgement model to write the prose summary."""
    if weekly_data["total_published"] == 0:
        return "No posts were published this week."

    prompt = (
        f"Write a brief weekly performance summary based on this data:\n"
        f"- Total posts published: {weekly_data['total_published']}\n"
        f"- Per platform: {weekly_data['by_platform']}\n"
        f"- Top reach post ID: {weekly_data['top_reach']}\n"
        f"- Errors: {weekly_data['errors']}\n"
        f"- Total metric records: {weekly_data['metrics_count']}\n\n"
        f"Keep it to 2-3 paragraphs. Focus on what's working and what needs attention."
        f" Be direct and factual."
    )

    agent = Agent(
        name="WeeklyDigestWriter",
        instructions=load_prompt("SOUL.md", "BRAND.md"),
        model=model("judgement"),
    )
    result = await Runner.run(agent, prompt)
    return result.final_output


async def _append_to_memory(summary: str):
    """Append the digest to MEMORY.md (create if absent)."""
    path = Path(settings.MEMORY_MD_PATH).resolve()
    week_label = datetime.now(timezone.utc).strftime("## Week of %Y-%m-%d")
    entry = f"\n\n{week_label}\n\n{summary}\n"
    try:
        if path.exists():
            existing = path.read_text(encoding="utf-8")
            if week_label in existing:
                logger.info("Weekly digest for %s already exists in MEMORY.md, skipping append", week_label)
                return
            path.write_text(existing + entry, encoding="utf-8")
        else:
            path.write_text(entry.strip(), encoding="utf-8")
        logger.info("Appended weekly digest to %s", settings.MEMORY_MD_PATH)
    except OSError as e:
        logger.error("Failed to write weekly digest to %s: %s", settings.MEMORY_MD_PATH, e)


async def weekly_digest():
    """Generate and deliver the weekly performance summary."""
    logger.info("Starting weekly digest generation")

    data = await _query_weekly_data()

    try:
        summary = await _write_digest(data)
    except Exception as e:
        logger.error("Failed to generate weekly digest prose: %s", e)
        summary = f"Weekly digest generation failed: {e}"

    await _append_to_memory(summary)

    from notify.discord import send
    await send(f"**Weekly Digest**\n\n{summary}")

    await write_audit(
        "weekly_digest",
        "digest_generated",
        "weekly_digest",
        {
            "total_published": data["total_published"],
            "summary_length": len(summary),
        },
    )

    logger.info("Weekly digest complete")
