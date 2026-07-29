"""Vision tagging agent — Week 4 Step 3 (asset tagging/quality gate) and
Week 5 Step 4 (cover-frame scoring).

tag_asset/quality_gate share one underlying vision call (_analyze_asset) rather
than firing two separate Gemini calls per photo — they're kept as separate
functions because they're independently testable/callable per spec.md, but
there's no reason to pay for the image twice.

score_frame reuses the same structured-output Agent pattern (research.md
Decision 6 for Week 5) rather than hand-rolling a new JSON-parsing path.
"""
import logging
import re

from pydantic import BaseModel

from agents import Agent, ModelSettings, Runner

from audit import write_audit
from brain.base import load_prompt, model
from config import settings

logger = logging.getLogger("worker.vision")

QUALITY_SCORE_REJECT_THRESHOLD = 40  # lowered from 60 — Gemini consistently under-scores
                                    # professional product photos (verified: multiple 70+ worthy
                                    # furniture images scored 45-55, getting marked rejected)


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
    # A tagging result is a handful of short fields — bounding max_tokens avoids
    # requesting the model's full (very large) default output budget, which some
    # OpenRouter accounts' remaining credit can't cover (verified: an unbounded
    # request failed with a 402 "requested 65535, can only afford 16000" error).
    model_settings=ModelSettings(temperature=0.2, max_tokens=1024),
    output_type=AssetAnalysis,
)


async def _write_audit(action: str, subject_id: str, payload: dict):
    await write_audit("vision_agent", action, subject_id, payload)


def _filename_hint(original_filename: str | None) -> str | None:
    """Turn "pink-velvet-storage-bench.jpg" into "pink velvet storage bench" —
    a plain-language hint, not a value to copy verbatim. r2_key is always a
    random UUID, so the uploader's own filename is the only place any
    operator-supplied naming (color, product line, etc.) survives at all;
    previously it was discarded at upload time and never reached the vision
    model, so every same-shaped product (e.g. six different-colored storage
    benches) got an identical "piece" label with only the shorter, purely
    visual "variant" field to tell them apart."""
    if not original_filename:
        return None
    stem = original_filename.rsplit(".", 1)[0]
    words = re.sub(r"[-_]+", " ", stem).strip()
    return words or None


async def _analyze_asset(image_url: str, original_filename: str | None = None) -> AssetAnalysis:
    hint = _filename_hint(original_filename)
    text = (
        "Analyze this furniture product photo. Identify the piece type, "
        "quality tier, and variant, and assess lighting and composition."
    )
    if hint:
        text += (
            f'\n\nThe uploader\'s filename was: "{hint}". Treat this as a hint only, '
            "not ground truth — it may name the color, material, or product line, which "
            "helps distinguish this piece from visually similar ones (e.g. the same bench "
            "shape in six different colors). Verify against what the image actually shows; "
            "don't copy the filename if it contradicts the photo."
        )
    message = [
        {
            "role": "user",
            "content": [
                {"type": "input_text", "text": text},
                {"type": "input_image", "image_url": image_url},
            ],
        }
    ]
    result = await Runner.run(vision_agent, message)
    return result.final_output


async def tag_asset(image_url: str, original_filename: str | None = None) -> dict:
    """Tag a newly uploaded asset — piece/tier/variant/quality_score."""
    analysis = await _analyze_asset(image_url, original_filename)
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


async def quality_gate(image_url: str, original_filename: str | None = None) -> tuple[bool, bool, str | None]:
    """Return (lighting_ok, composition_ok, reject_reason).

    reject_reason is set (non-null) when quality_score < 60 — the asset is still
    inserted into the library either way (spec.md edge case: flagged, not
    discarded); this function only reports the assessment.
    """
    analysis = await _analyze_asset(image_url, original_filename)
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


class FrameScore(BaseModel):
    score: int  # 0-10
    reason: str


frame_scoring_agent = Agent(
    name="CoverFrameScorer",
    instructions=(
        "Score this frame 0-10 for use as a social media cover. Criteria: "
        "product fully visible (+3), in focus (+3), composition balanced (+2), "
        "no motion blur (+2)."
    ),
    model=model("vision"),
    # See vision_agent's comment above — same fix, same reason: a {score, reason}
    # output needs a few hundred tokens at most, not the model's full default budget.
    model_settings=ModelSettings(temperature=0.2, max_tokens=800),
    output_type=FrameScore,
)


async def score_frame(image_url: str) -> FrameScore:
    """Score a single candidate cover frame — Week 5, Step 4."""
    message = [
        {
            "role": "user",
            "content": [
                {"type": "input_text", "text": "Score this frame for use as a social media cover image."},
                {"type": "input_image", "image_url": image_url},
            ],
        }
    ]
    result = await Runner.run(frame_scoring_agent, message)
    return result.final_output
