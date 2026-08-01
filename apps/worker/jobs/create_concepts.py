"""Creative Concepts Generation Job — Phase 1 of Creative Pipeline.

Generates creative concepts (headline variations, caption options, creative direction)
for assets before they're used in posts. Enables human review and A/B testing.

Runs weekly or on-demand to populate the concepts library with fresh creative options.
"""
import asyncio
import logging
import random
from types import SimpleNamespace

from sqlalchemy import select

from brain.composer import write_caption
from db.models import Asset, Concept
from db.session import SessionLocal
from audit import write_audit
from jobs.compose_batch import _build_brand_tokens

logger = logging.getLogger("worker.create_concepts")

# Concept types for different marketing angles
CONCEPT_TYPES = ["price-focused", "lifestyle", "quality", "exclusive", "comfort"]

# Animation styles for enhanced reels (from scroll-story-3d skill)
ANIMATION_STYLES = [
    "frame-sequence",  # Product explodes/rebuilds with multiple headlines
    "shader-dissolve",  # Cross-fade between product angles with edge glow
    "card-converge",  # Scattered items → full set reveal
    "none",  # Standard static posts
]

# Template suggestions per concept type
TEMPLATE_SUGGESTIONS = {
    "price-focused": ["price-card", "set-breakdown"],
    "lifestyle": ["hero", "carousel-slide", "light-circle-frame"],
    "quality": ["hero", "exclusive-badge", "bold-headline"],
    "exclusive": ["hero", "sweet-dreams", "exclusive-badge"],
    "comfort": ["hero", "quote", "carousel-slide"],
}

# How many concepts to create per run
MAX_CONCEPTS_PER_RUN = 10


async def _pick_assets_needing_concepts(limit: int = MAX_CONCEPTS_PER_RUN) -> list[Asset]:
    """Select assets that need creative concepts.

    Prioritizes:
    1. New assets (times_used = 0)
    2. Assets with few concepts
    3. Random selection from under-represented concept types
    """
    async with SessionLocal() as session:
        # Get assets that have few or no concepts yet
        result = await session.execute(
            select(Asset)
            .where(Asset.reject_reason.is_(None))
            .order_by(Asset.times_used.asc(), Asset.created_at.desc())
            .limit(limit * 2)  # Get more than needed to filter
        )
        assets = list(result.scalars().all())

    # Simple selection for now - could be smarter based on concept coverage
    return assets[:limit]


# Real LLM calls per concept — each is a full write_caption() round trip
# (writer agent + reviewer agent), so this directly controls job cost/time.
# The canned-template version this replaced generated 5 headlines + 3
# captions for free, but real generations aren't free — this trades some
# variety for a sane run cost. At MAX_CONCEPTS_PER_RUN=10 assets x up to 2
# concepts each x this many variations x 2 agent calls, a full run is up
# to 10*2*CONCEPT_VARIATIONS*2 real model calls.
CONCEPT_VARIATIONS = 3


async def _generate_concept_variations(
    asset: Asset, concept_type: str, brand_tokens: dict
) -> tuple[list[str], list[str]]:
    """Generate real headline + caption variations for one concept, via the
    exact same write_caption() pipeline every regular post goes through —
    not the canned English-only templates this used to return, which
    bypassed every quality guardrail in brain/composer.py entirely
    (confirmed: one of the old templates used "elevate your home" verbatim,
    a HUMANIZER_BANNED_PHRASES entry) and ignored the brand's Roman Urdu +
    English default.

    Headlines and captions are collected as two separate lists (matching
    the Concept.headlines/Concept.captions schema and how compose_batch.py
    already picks one of each independently via random.choice) rather than
    kept as headline+caption pairs — same shape the canned version used.
    A generation failure for one variation is logged and skipped rather
    than aborting the whole concept; write_caption() itself already retries
    on humanizer/formatting violations internally.

    The CONCEPT_VARIATIONS calls are independent of each other, so they run
    concurrently (asyncio.gather) rather than one at a time — confirmed
    live, a fully sequential version made a real run (10 assets x up to 2
    concepts x 3 variations = up to 60 write_caption() calls, each 1-4
    attempts plus a reviewer call) take 20-40+ minutes, which read as "only
    generating 1 concept" to an operator checking the log a few minutes in.
    """
    direction = await _get_creative_direction(concept_type)
    # No real Template row exists yet at concept-generation time (that's
    # what suggested_templates is for — a template gets picked later, when
    # a concept is actually used) — write_caption() only reads .slug/
    # .display_name off whatever it's given, so a lightweight stand-in
    # naming the concept type's first suggested template gives the model
    # real stylistic context without needing a DB row.
    suggested_slug = TEMPLATE_SUGGESTIONS.get(concept_type, ["hero"])[0]
    template_stub = SimpleNamespace(slug=suggested_slug, display_name=None)

    results = await asyncio.gather(
        *[
            write_caption(asset, template_stub, brand=brand_tokens, creative_direction=direction)
            for _ in range(CONCEPT_VARIATIONS)
        ],
        return_exceptions=True,
    )

    headlines: list[str] = []
    captions: list[str] = []
    for result in results:
        if isinstance(result, BaseException):
            logger.warning(
                "Concept variation generation failed for asset %s (%s): %s", asset.id, concept_type, result
            )
            continue
        caption, headline, hashtags = result
        headlines.append(headline)
        # Hashtags folded into the caption text (not stored separately) —
        # matches compose_batch.py's own caption_text construction, which
        # is also what its approved-concept branch expects when it later
        # re-extracts hashtags from this same text via a leading "#" scan.
        captions.append((caption or "") + ("\n\n" + " ".join(hashtags) if hashtags else ""))
    return headlines, captions


async def _get_creative_direction(concept_type: str) -> str:
    """Provide creative direction hints for the concept type."""
    directions = {
        "price-focused": "Emphasize value, savings, and smart purchasing decisions",
        "lifestyle": "Focus on how the product enhances daily living and aspirations",
        "quality": "Highlight craftsmanship, materials, and durability",
        "exclusive": "Emphasize scarcity, uniqueness, and prestige",
        "comfort": "Focus on ergonomics, relaxation, and emotional connection",
    }
    return directions.get(concept_type, "Focus on product benefits and user experience")


async def _select_animation_style(asset: Asset, concept_type: str) -> str:
    """Select appropriate animation style based on asset and concept type."""
    # For now, simple logic – could be smarter
    if asset.kind == "clip":
        # Videos get scroll animations
        return random.choice(["frame-sequence", "shader-dissolve", "card-converge"])
    else:
        # Photos use standard templates
        return "none"


async def create_concepts():
    """Generate creative concepts for assets needing them.

    Runs on CREATE_CONCEPTS_CRON (default weekly) or can be triggered manually.
    Creates up to CONCEPT_VARIATIONS headline + caption options per concept,
    each a real write_caption() generation (not canned text).
    """
    logger.info("Starting concepts generation — target: %d concepts", MAX_CONCEPTS_PER_RUN)

    assets = await _pick_assets_needing_concepts()
    if not assets:
        logger.info("No assets needing concepts found")
        return

    # Built once and reused for every concept this run — same reasoning as
    # compose_batch.py's own brand_tokens: it's the same brand_config row
    # regardless of which asset/concept is being generated.
    brand_tokens = await _build_brand_tokens()

    created = 0
    skipped = 0

    for asset in assets:
        asset_id_str = str(asset.id)

        # Check if this asset already has enough approved concepts
        async with SessionLocal() as session:
            existing = await session.execute(
                select(Concept).where(
                    Concept.asset_id == asset.id,
                    Concept.state == "approved"
                )
            )
            approved_count = len(existing.scalars().all())

        if approved_count >= 3:  # Already have enough concepts
            logger.debug("Asset %s already has %d approved concepts, skipping", asset_id_str, approved_count)
            skipped += 1
            continue

        # Generate 1-2 concepts per asset to provide variety
        num_concepts = min(2, MAX_CONCEPTS_PER_RUN - created)

        for i in range(num_concepts):
            # Pick different concept types for variety
            concept_type = CONCEPT_TYPES[i % len(CONCEPT_TYPES)]

            # Generate content
            headlines, captions = await _generate_concept_variations(asset, concept_type, brand_tokens)
            if not headlines or not captions:
                logger.warning(
                    "All variation attempts failed for asset %s (%s), skipping this concept",
                    asset_id_str, concept_type,
                )
                continue
            creative_direction = await _get_creative_direction(concept_type)
            suggested_templates = TEMPLATE_SUGGESTIONS.get(concept_type, ["hero"])
            animation_style = await _select_animation_style(asset, concept_type)

            # Store concept
            async with SessionLocal() as session:
                concept = Concept(
                    asset_id=asset.id,
                    concept_type=concept_type,
                    headlines=headlines,
                    captions=captions,
                    creative_direction=creative_direction,
                    suggested_templates=suggested_templates,
                    animation_style=animation_style,
                    state="draft",  # Requires human approval
                )
                session.add(concept)
                await session.commit()
                concept_id = str(concept.id)

            await write_audit(
                "create_concepts",
                "concept_created",
                concept_id,
                {
                    "asset_id": asset_id_str,
                    "concept_type": concept_type,
                    "headlines_count": len(headlines),
                    "captions_count": len(captions),
                    "animation_style": animation_style,
                },
            )

            logger.info(
                "Created concept %s for asset %s: %s (%d headlines, %d captions)",
                concept_id[-8:],
                asset_id_str[-8:],
                concept_type,
                len(headlines),
                len(captions),
            )
            created += 1

        if created >= MAX_CONCEPTS_PER_RUN:
            break

    logger.info("Concepts generation complete: %d created, %d skipped (already sufficient)", created, skipped)


if __name__ == "__main__":
    asyncio.run(create_concepts())