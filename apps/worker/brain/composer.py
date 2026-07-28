"""Caption composer agent — Week 4, Step 2.

Given an asset + template + brand context, produces a caption and hashtags in the
brand's configured language (read from BRAND.md via load_prompt, never hardcoded —
FR-019), and enforces the humanizer check in code (FR-002) rather than trusting the
prompt alone.
"""
import logging

from pydantic import BaseModel

from agents import Agent, ModelSettings, Runner

from audit import write_audit
from brain.base import load_prompt, model
from config import settings

logger = logging.getLogger("worker.composer")

# Starting list per research.md Decision 3 — expected to grow as new AI-sounding
# patterns are noticed, not exhaustive on day one.
HUMANIZER_BANNED_PHRASES = [
    "elevate your space",
    "elevate your home",
    "transform your home",
    "transform your space",
    "in today's fast-paced world",
    "we're thrilled to announce",
    "we are thrilled to announce",
    "look no further",
    "step into",
    "unleash",
    "unlock the",
    "game-changer",
    "game changer",
    "whether you're",
    "at the end of the day",
]


def check_humanizer(caption: str) -> list[str]:
    """Return every banned phrase found in `caption` (case-insensitive). Empty = pass."""
    lowered = caption.lower()
    return [phrase for phrase in HUMANIZER_BANNED_PHRASES if phrase in lowered]


class CaptionOutput(BaseModel):
    caption: str
    hashtags: list[str]


caption_agent = Agent(
    name="CaptionWriter",
    instructions=load_prompt("SOUL.md", "BRAND.md", "skills/caption-writer.md"),
    model=model("caption"),
    model_settings=ModelSettings(temperature=0.8),
    output_type=CaptionOutput,
)


async def _write_audit(actor: str, action: str, subject_id: str, payload: dict):
    await write_audit(actor, action, subject_id, payload)


async def write_caption(asset, template, brand: dict | None = None) -> tuple[str, list[str]]:
    """Generate a caption + hashtags for an asset+template pairing.

    Retries (up to LLM_MAX_RETRIES) when the humanizer check finds a violation,
    regenerating rather than ever returning a banned-phrase caption to a reviewer.
    Raises if the model is unreachable or every retry still fails the check — this
    must never silently return a blank/placeholder caption (spec.md US1 scenario 3).
    """
    brand = brand or {}
    prompt = (
        f"Write a social media caption and hashtags for this post.\n"
        f"Asset: piece={asset.piece}, tier={asset.tier}, variant={asset.variant}\n"
        f"Template: {getattr(template, 'display_name', None) or getattr(template, 'slug', None)}\n"
        f"Context: {brand}"
    )

    violations: list[str] = []
    for attempt in range(settings.LLM_MAX_RETRIES + 1):
        try:
            result = await Runner.run(caption_agent, prompt)
        except Exception as e:
            logger.error("Caption model unreachable: %s", e)
            await _write_audit(
                actor="caption_agent",
                action="caption_generation_failed",
                subject_id=str(getattr(asset, "id", "")),
                payload={"error": str(e), "attempt": attempt},
            )
            raise

        output: CaptionOutput = result.final_output
        violations = check_humanizer(output.caption)
        if not violations:
            await _write_audit(
                actor="caption_agent",
                action="caption_generated",
                subject_id=str(getattr(asset, "id", "")),
                payload={"caption_length": len(output.caption), "hashtag_count": len(output.hashtags), "attempt": attempt},
            )
            return output.caption, output.hashtags

        logger.warning("Caption rejected by humanizer check (attempt %d): %s", attempt, violations)
        await _write_audit(
            actor="caption_agent",
            action="caption_humanizer_rejected",
            subject_id=str(getattr(asset, "id", "")),
            payload={"violations": violations, "attempt": attempt},
        )

    raise ValueError(f"Caption still failed the humanizer check after {settings.LLM_MAX_RETRIES + 1} attempts: {violations}")
