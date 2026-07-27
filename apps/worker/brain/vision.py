"""Vision tagging agent — Week 4, Step 3.

Two public entry points (tag_asset, quality_gate) share one underlying vision call
(_analyze_asset) rather than firing two separate Gemini calls per photo — they're
kept as separate functions because they're independently testable/callable per
spec.md, but there's no reason to pay for the image twice.

select_cover_frame is stubbed — full implementation is Week 5 (Remotion/video)
territory, per the original kickoff.
"""
import logging

from pydantic import BaseModel

from agents import Agent, ModelSettings, Runner

from brain.base import load_prompt, model
from config import settings
from db.models import AuditLog
from db.session import SessionLocal

logger = logging.getLogger("worker.vision")

QUALITY_SCORE_REJECT_THRESHOLD = 60  # schema.sql's documented threshold


class AssetAnalysis(BaseModel):
    piece: str
    tier: str
    variant: str
    quality_score: int  # 0-100
    lighting_ok: bool
    composition_ok: bool


vision_agent = Agent(
    name="AssetTagger",
    instructions=load_prompt("BRAND.md", "skills/asset-tagging.md"),
    model=model("vision"),
    model_settings=ModelSettings(temperature=0.2),
    output_type=AssetAnalysis,
)


async def _write_audit(action: str, subject_id: str, payload: dict):
    async with SessionLocal() as session:
        session.add(AuditLog(actor="vision_agent", action=action, subject_id=subject_id, payload=payload))
        await session.commit()


async def _analyze_asset(image_url: str) -> AssetAnalysis:
    message = [
        {
            "role": "user",
            "content": [
                {
                    "type": "input_text",
                    "text": (
                        "Analyze this furniture product photo. Identify the piece type, "
                        "quality tier, and variant, and assess lighting and composition."
                    ),
                },
                {"type": "input_image", "image_url": image_url},
            ],
        }
    ]
    result = await Runner.run(vision_agent, message)
    return result.final_output


async def tag_asset(image_url: str) -> dict:
    """Tag a newly uploaded asset — piece/tier/variant/quality_score."""
    analysis = await _analyze_asset(image_url)
    await _write_audit(
        "asset_tagged",
        image_url,
        {"piece": analysis.piece, "tier": analysis.tier, "variant": analysis.variant, "quality_score": analysis.quality_score},
    )
    return {
        "piece": analysis.piece,
        "tier": analysis.tier,
        "variant": analysis.variant,
        "quality_score": analysis.quality_score,
    }


async def quality_gate(image_url: str) -> tuple[bool, bool, str | None]:
    """Return (lighting_ok, composition_ok, reject_reason).

    reject_reason is set (non-null) when quality_score < 60 — the asset is still
    inserted into the library either way (spec.md edge case: flagged, not
    discarded); this function only reports the assessment.
    """
    analysis = await _analyze_asset(image_url)
    reject_reason = None
    if analysis.quality_score < QUALITY_SCORE_REJECT_THRESHOLD:
        reasons = []
        if not analysis.lighting_ok:
            reasons.append("poor lighting")
        if not analysis.composition_ok:
            reasons.append("poor composition")
        reject_reason = ", ".join(reasons) or f"quality_score {analysis.quality_score} below threshold"

    await _write_audit(
        "asset_quality_checked",
        image_url,
        {
            "quality_score": analysis.quality_score,
            "lighting_ok": analysis.lighting_ok,
            "composition_ok": analysis.composition_ok,
            "reject_reason": reject_reason,
        },
    )
    return analysis.lighting_ok, analysis.composition_ok, reject_reason


def select_cover_frame(video_url: str):
    """Cover-frame selection for video/reel assets — Week 5 territory, not yet implemented."""
    raise NotImplementedError("select_cover_frame is Week 5 (Remotion/video) scope")
