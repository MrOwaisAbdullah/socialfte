"""Creative Concepts Generation Job — Phase 1 of Creative Pipeline.

Generates creative concepts (headline variations, caption options, creative direction)
for assets before they're used in posts. Enables human review and A/B testing.

Runs weekly or on-demand to populate the concepts library with fresh creative options.
"""
import asyncio
import logging
import random
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db.models import Asset, Concept
from db.session import SessionLocal
from audit import write_audit

logger = logging.getLogger("worker.create_concepts")

# Concept types for different marketing angles
CONCEPT_TYPES = ["price-focused", "lifestyle", "quality", "exclusive", "comfort"]

# Animation styles for enhanced reels (from scroll-story-3d skill)
ANIMATION_STYLES = [
    "frame-sequence",  # Product explodes/rebuilds with multiple headlines
    "shader-dissolve",  # Cross-fade between product angles with edge glow
    "card-convergence",  # Scattered items → full set reveal
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


async def _generate_headlines(asset: Asset, concept_type: str, count: int = 5) -> list[str]:
    """Generate headline variations using the caption agent.

    Different concept types need different headline styles:
    - price-focused: Value-oriented
    - lifestyle: Aspirational
    - quality: Craftsmanship-focused
    - exclusive: Scarcity-driven
    - comfort: Ergonomic/emotional
    """
    # For now, use simple templates until we integrate with caption agent
    templates = {
        "price-focused": [
            f"Luxury {{product}} within reach",
            f"Best value {{product}} you'll find",
            f"Premium {{product}}, smart price",
            f"{{product}} – quality that fits your budget",
            f"Affordable luxury: {{product}}",
        ],
        "lifestyle": [
            f"Transform your space with {{product}}",
            f"{{product}} – elevate your living",
            f"Your dream space starts with {{product}}",
            f"{{product}} for modern living",
            f"Redefine your home with {{product}}",
        ],
        "quality": [
            f"Handcrafted {{product}} built to last",
            f"{{product}} – precision meets passion",
            f"Premium {{product}} with uncompromising quality",
            f"{{product}} crafted for generations",
            f"Where quality meets comfort: {{product}}",
        ],
        "exclusive": [
            f"Exclusive {{product}} – limited availability",
            f"Rare find: {{product}}",
            f"{{product}} for the discerning few",
            f"Own the extraordinary: {{product}}",
            f"Limited edition {{product}}",
        ],
        "comfort": [
            f"{{product}} – comfort redefined",
            f"Experience unmatched comfort with {{product}}",
            f"{{product}} designed for relaxation",
            f"Your comfort, our priority: {{product}}",
            f"{{product}} – where comfort meets style",
        ],
    }

    product_name = asset.original_filename or asset.piece or "furniture piece"
    # Remove file extension if present
    if "." in product_name:
        product_name = product_name.rsplit(".", 1)[0]

    templates_list = templates.get(concept_type, templates["quality"])
    headlines = []

    for template in templates_list:
        # Replace {{product}} placeholder
        headline = template.replace("{{product}}", product_name)
        headlines.append(headline)

    # Shuffle and return requested count
    random.shuffle(headlines)
    return headlines[:count]


async def _generate_captions(asset: Asset, concept_type: str, headlines: list[str]) -> list[str]:
    """Generate caption variations aligned with concept type.

    Uses different tones based on concept:
    - price-focused: Value messaging
    - lifestyle: Aspirational tone
    - quality: Craftsmanship emphasis
    - exclusive: Scarcity appeal
    - comfort: Emotional connection
    """
    product_name = asset.original_filename or asset.piece or "furniture piece"
    if "." in product_name:
        product_name = product_name.rsplit(".", 1)[0]

    captions = []

    # Generate different caption options
    templates = {
        "price-focused": [
            f"Premium quality without the premium price tag. Experience {product_name} – luxury that fits your budget. Crafted for comfort, priced for value. ✨",
            f"Why overpay? {product_name} delivers exceptional quality at smart prices. Built to last, designed to impress. Your wallet will thank you. 💰",
            f"Luxury within reach – {product_name} proves you don't have to compromise. Premium materials, expert craftsmanship, affordable pricing. The smart choice. 🏠",
        ],
        "lifestyle": [
            f"Transform your space with {product_name}. Designed for modern living, crafted for everyday elegance. Elevate your home with a piece that speaks to your style. ✨",
            f"Your dream space starts here. {product_name} brings together comfort, style, and sophistication. Create moments worth remembering in a home you'll love. 🏡",
            f"Redefine your living experience. {product_name} isn't just furniture – it's the foundation of your ideal lifestyle. Where form meets function, beautifully. 🌟",
        ],
        "quality": [
            f"Built to last generations. {product_name} showcases exceptional craftsmanship with premium materials and expert construction. Each piece tells a story of quality and dedication. 🛠️",
            f"Precision meets passion in every detail of {product_name}. Handcrafted by skilled artisans using time-honored techniques and modern innovation. Quality you can feel. ✨",
            f"{product_name} – where uncompromising quality meets timeless design. Crafted with care, built to serve, and made to impress. Invest in furniture that stands the test of time. 🏆",
        ],
        "exclusive": [
            f"Exclusive {product_name} – limited availability for those who appreciate the extraordinary. Secure your piece before it's gone. Own furniture that makes a statement. 💎",
            f"Rare find: {product_name} represents exceptional design and craftsmanship. Limited pieces available. Don't miss your chance to own something truly special. ⭐",
            f"Designed for the discerning few. {product_name} offers exclusivity without compromise. Be among the select owners of this remarkable piece. 🌟",
        ],
        "comfort": [
            f"Experience unmatched comfort with {product_name}. Thoughtfully designed to cradle you in relaxation after a long day. Your personal sanctuary awaits. 🛋️",
            f"Where style meets comfort – {product_name} redefines relaxation. Ergonomically designed with your well-being in mind. Comfort you'll look forward to every day. 🌙",
            f"Your comfort, our priority. {product_name} brings together supportive design and plush elegance. Create your perfect cozy corner at home. 🏡",
        ],
    }

    templates_list = templates.get(concept_type, templates["quality"])
    captions = [t.format(product_name=product_name) for t in templates_list]

    # Add hashtags to each caption
    hashtag_options = [
        "#FurnitureGoals #HomeDecor #InteriorDesign",
        "#PakistaniFurniture #HomeInspo #LivingRoom",
        "#ComfortMeetsStyle #DreamHome #FurnitureLover",
    ]

    final_captions = []
    for i, caption in enumerate(captions):
        hashtags = hashtag_options[i % len(hashtag_options)]
        final_captions.append(f"{caption}\n\n{hashtags}")

    return final_captions


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
        return random.choice(["frame-sequence", "shader-dissolve", "card-convergence"])
    else:
        # Photos use standard templates
        return "none"


async def create_concepts():
    """Generate creative concepts for assets needing them.

    Runs on CREATE_CONCEPTS_CRON (default weekly) or can be triggered manually.
    Creates 3-5 headline variations and 3 caption options per concept.
    """
    logger.info("Starting concepts generation — target: %d concepts", MAX_CONCEPTS_PER_RUN)

    assets = await _pick_assets_needing_concepts()
    if not assets:
        logger.info("No assets needing concepts found")
        return

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
            headlines = await _generate_headlines(asset, concept_type, count=5)
            captions = await _generate_captions(asset, concept_type, headlines)
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