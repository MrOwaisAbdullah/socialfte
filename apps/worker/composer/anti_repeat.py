"""Anti-repeat gate — Week 4, Step 4.

Three independent checks compose_batch runs before accepting a template, asset, or
caption. Each is a rolling-window check (data-model.md), not a permanent ban list.

research.md Decision 2: pgvector's cosine_distance() = 1 - cosine_similarity. A
caption is "more than X% similar" exactly when cosine_distance < (1 - X) — this is
the one place in the whole feature that's easy to get backwards and silently
disable the entire caption anti-repeat rule. Every comparison below is written as
`distance < threshold`, never `similarity > threshold`.
"""
import logging

from sqlalchemy import select

from audit import write_audit
from config import settings
from db.models import Post
from db.session import SessionLocal

logger = logging.getLogger("worker.anti_repeat")


async def _write_audit(action: str, subject_id: str, payload: dict):
    await write_audit("anti_repeat", action, subject_id, payload)


async def _recent_posts(limit: int) -> list[Post]:
    async with SessionLocal() as session:
        result = await session.execute(
            select(Post).order_by(Post.created_at.desc()).limit(limit)
        )
        return list(result.scalars().all())


async def check_template(template_id) -> bool:
    """True if `template_id` may be used — i.e. it wasn't used in the last N posts."""
    recent = await _recent_posts(settings.ANTI_REPEAT_TEMPLATE_WINDOW)
    used_ids = {p.template_id for p in recent if p.template_id is not None}
    ok = template_id not in used_ids
    if not ok:
        await _write_audit(
            "template_rejected",
            str(template_id),
            {"rule": "template_window", "window": settings.ANTI_REPEAT_TEMPLATE_WINDOW},
        )
    return ok


async def check_asset(asset_id) -> bool:
    """True if `asset_id` may be used — i.e. it wasn't used in the last N posts."""
    recent = await _recent_posts(settings.ANTI_REPEAT_ASSET_WINDOW)
    used_ids = {p.asset_id for p in recent if p.asset_id is not None}
    ok = asset_id not in used_ids
    if not ok:
        await _write_audit(
            "asset_rejected",
            str(asset_id),
            {"rule": "asset_window", "window": settings.ANTI_REPEAT_ASSET_WINDOW},
        )
    return ok


async def check_caption(embedding: list[float]) -> bool:
    """True if a caption with this embedding may be used — i.e. no post in the last
    N posts has a caption more similar than ANTI_REPEAT_CAPTION_MAX_SIMILARITY.

    cosine_distance < (1 - max_similarity) is the rejection condition — NOT
    cosine_distance > max_similarity (research.md Decision 2).
    """
    max_distance = 1 - settings.ANTI_REPEAT_CAPTION_MAX_SIMILARITY

    async with SessionLocal() as session:
        recent_ids_result = await session.execute(
            select(Post.id).order_by(Post.created_at.desc()).limit(settings.ANTI_REPEAT_CAPTION_WINDOW)
        )
        recent_ids = [row[0] for row in recent_ids_result.all()]
        if not recent_ids:
            return True

        violation = await session.execute(
            select(Post.id).where(
                Post.id.in_(recent_ids),
                Post.caption_vec.isnot(None),
                Post.caption_vec.cosine_distance(embedding) < max_distance,
            ).limit(1)
        )
        match = violation.scalar_one_or_none()

    ok = match is None
    if not ok:
        await _write_audit(
            "caption_rejected",
            str(match),
            {
                "rule": "caption_similarity",
                "window": settings.ANTI_REPEAT_CAPTION_WINDOW,
                "max_similarity": settings.ANTI_REPEAT_CAPTION_MAX_SIMILARITY,
            },
        )
    return ok
