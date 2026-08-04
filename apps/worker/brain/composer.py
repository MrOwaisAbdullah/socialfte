"""Caption composer agent — Week 4, Step 2.

Given an asset + template + brand context, produces a caption and hashtags in the
brand's configured language (read from BRAND.md via load_prompt, never hardcoded —
FR-019), and enforces the humanizer check in code (FR-002) rather than trusting the
prompt alone.
"""
import logging
import re

from pydantic import BaseModel

from agents import Agent, ModelSettings, Runner

from audit import write_audit
from brain.base import load_prompt, model
from config import settings

logger = logging.getLogger("worker.composer")

# Starting list per research.md Decision 3 — expected to grow as new AI-sounding
# patterns are noticed, not exhaustive on day one. Second batch added after
# loading the humanizer-main skill's Wikipedia "Signs of AI writing" reference —
# promotional/significance-inflation phrases that are especially common in
# generated furniture-marketing copy specifically.
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
    "nestled",
    "boasts a",
    "showcases",
    "showcasing",
    "exemplifies",
    "epitomizes",
    "redefines",
    "stands as a testament",
    "serves as a testament",
    "a testament to",
    "underscores its",
    "underscoring its",
    "highlighting its",
    "reflects the brand's",
    "embodies the",
    "timeless elegance",
    "crafted to perfection",
    "commitment to quality",
    "in the heart of",
    "breathtaking",
    "must-have",
    "must have",
    "amazing",
    "stunning",
    "luxurious",
]


def check_humanizer(caption: str) -> list[str]:
    """Return every banned phrase found in `caption` (case-insensitive). Empty = pass."""
    lowered = caption.lower()
    violations = [phrase for phrase in HUMANIZER_BANNED_PHRASES if phrase in lowered]
    # Reject Devanagari (Hindi) and Nastaliq (Urdu) script — the audience
    # reads Roman Urdu, not Indic/Arabic writing systems.
    if re.search(r"[\u0900-\u097F\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]", caption):
        violations.append("contains Devanagari/Nastaliq/Arabic script (use Roman Urdu only)")
    return violations


# Confirmed live: a real caption came back with 30+ hashtags (duplicated
# twice), **markdown bold** (Facebook/Instagram/TikTok render literal
# asterisks — there's no bold/italic support, so this just looks broken in
# the actual post), and 6+ emoji. skills/caption-writer.md now says this
# explicitly, but a prompt instruction alone doesn't guarantee compliance —
# same reasoning as HUMANIZER_BANNED_PHRASES existing at all.
_EMOJI_PATTERN = re.compile(
    "["
    "\U0001F300-\U0001FAFF"  # symbols & pictographs, supplemental symbols, emoticons, transport
    "\U00002600-\U000027BF"  # misc symbols, dingbats
    "]+"
)
MAX_HASHTAGS = 8
MIN_HASHTAGS = 3
MAX_EMOJI = 6


_INLINE_HASHTAG_PATTERN = re.compile(r"#\w+")
# A "." "." "." spacer line, each dot alone on its own line — the exact
# "quote card" ending skills/caption-writer.md rule 9 forbids, confirmed
# live directly preceding an inline hashtag block in a real published draft.
_DOT_SPACER_LINE = re.compile(r"^[ \t]*\.[ \t]*$\n?", re.MULTILINE)


def clean_caption_output(caption: str, hashtags: list[str]) -> tuple[str, list[str]]:
    """Deterministic post-processing applied to every model response, before
    any check runs — fixes what's safe to fix outright rather than spending
    a retry on it. Markdown asterisks are stripped (the content underneath
    is usually fine, only the ** markers are the problem).

    Confirmed live: despite skills/caption-writer.md rule 3 ("never write
    the hashtag list twice") and rule 9 (no "." "." "." quote-card spacer),
    the model sometimes embeds its own hashtag block directly in the
    caption body anyway — compose_batch.py then appends the separate
    structured `hashtags` field on top, producing two overlapping hashtag
    blocks in the published post (one real example: 15 inline tags,
    followed by an 8-tag subset from the structured field). Any inline
    #tags found in the body are pulled out, merged into the structured
    list, and the body's spacer lines are cleaned up, so there is exactly
    one hashtag block in the result regardless of where the model put it.

    Hashtags are then normalized (a missing "#" is added — confirmed live,
    the structured field sometimes came back as bare words like
    "YousufLiving HomeDecor", not clickable hashtags on any platform),
    de-duplicated (case-insensitive, order-preserving), and capped at
    MAX_HASHTAGS — truncating a too-long list is safe, but padding a
    too-short one isn't, so under-MIN_HASHTAGS is still a real check
    below."""
    caption = re.sub(r"\*{1,2}([^*]+)\*{1,2}", r"\1", caption)

    # Strip "Option N:" / "Caption:" / "Option N (label):" prefixes — the
    # model sometimes generates multiple alternatives despite the prompt
    # saying to write exactly one. Take only the first option's text.
    caption = re.sub(
        r"^\s*Option\s+\d+\s*[\(:：].*?\)?\s*[:\n]",
        "",
        caption,
        count=1,
        flags=re.IGNORECASE | re.DOTALL,
    )
    caption = re.sub(
        r"^\s*Caption\s*[:\n]",
        "",
        caption,
        count=1,
        flags=re.IGNORECASE,
    )

    # Confirmed live: the model sometimes echoes the separate headline/
    # hashtags fields back into the caption body with literal "Headline:"
    # and "Hashtags:" labels, even though both already exist as their own
    # structured output fields — the headline gets rendered on the image
    # itself, and the real hashtags get appended after the caption by
    # compose_batch.py. Left in, the published post shows the headline
    # text twice and a "Hashtags:" label sitting above the real hashtag
    # block. The whole "Headline: ..." line is dropped outright; only the
    # "Hashtags:" label itself is stripped so the actual tags on that line
    # (or the next) still get picked up by the inline-hashtag pass below.
    caption = re.sub(r"(?im)^\s*Headline\s*:.*$\n?", "", caption)
    caption = re.sub(r"(?im)^\s*Hashtags?\s*:\s*", "", caption)

    inline_tags = _INLINE_HASHTAG_PATTERN.findall(caption)
    if inline_tags:
        caption = _INLINE_HASHTAG_PATTERN.sub("", caption)
        hashtags = hashtags + inline_tags

    caption = _DOT_SPACER_LINE.sub("", caption)
    caption = re.sub(r"[ \t]+\n", "\n", caption)  # trailing spaces left by removed tags/labels
    caption = re.sub(r"\n{3,}", "\n\n", caption).strip()

    seen = set()
    deduped = []
    for tag in hashtags:
        tag = tag.strip()
        if tag and not tag.startswith("#"):
            tag = f"#{tag}"
        key = tag.lower()
        if key not in seen:
            seen.add(key)
            deduped.append(tag)
    return caption, deduped[:MAX_HASHTAGS]


def check_formatting(caption: str, hashtags: list[str]) -> list[str]:
    """Return formatting violations check_humanizer doesn't cover. Run AFTER
    clean_caption_output() — this catches what cleaning couldn't safely fix
    (too few hashtags to begin with, too many emoji) rather than what it did."""
    violations = []
    if len(hashtags) < MIN_HASHTAGS:
        violations.append(f"only {len(hashtags)} hashtags (minimum {MIN_HASHTAGS})")
    emoji_count = sum(len(m) for m in _EMOJI_PATTERN.findall(caption))
    if emoji_count > MAX_EMOJI:
        violations.append(f"{emoji_count} emoji (maximum {MAX_EMOJI})")
    # Confirmed live: a real published caption stored "???" (three literal
    # ASCII question marks, verified against the raw UTF-8 bytes — not a
    # terminal/display artifact) exactly where an emoji clearly belonged
    # ("...breaking the bank. ??? Yousuf Living"). Nothing here catches a
    # model call that garbles an emoji into literal '?' characters instead
    # of actually emitting it. Two or more consecutive '?' is not
    # legitimate punctuation in any real caption, so it's a safe signal to
    # reject and regenerate rather than publish garbled text.
    if re.search(r"\?{2,}", caption):
        violations.append("caption contains repeated '?' characters (likely a garbled emoji)")
    return violations


# The image/video text overlay. Previously there was no dedicated generation
# step at all — compose_batch.py just truncated the caption's first line at
# 80 characters, producing sentence fragments instead of a real headline.
MIN_HEADLINE_WORDS = 2
MAX_HEADLINE_WORDS = 8


def clean_headline(headline: str) -> str:
    """Strip markdown the same way clean_caption_output does for the caption."""
    return re.sub(r"\*{1,2}([^*]+)\*{1,2}", r"\1", headline).strip()


def check_headline(headline: str) -> list[str]:
    """Word-count check — the whole point of the headline is that it's short
    enough to read overlaid on a photo in under a second (FR: 2-5 words)."""
    violations = []
    word_count = len(headline.split())
    if not (MIN_HEADLINE_WORDS <= word_count <= MAX_HEADLINE_WORDS):
        violations.append(f"headline is {word_count} words (must be {MIN_HEADLINE_WORDS}-{MAX_HEADLINE_WORDS})")
    if re.search(r"[\u0900-\u097F\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]", headline):
        violations.append("headline contains Devanagari/Nastaliq/Arabic script (use Roman Urdu only)")
    # caption-writer.md: "No exclamation marks, ever" \u2014 a headline overlaid
    # on a photo reads as a product label, not an ad; "Book Now!" is ad
    # copy, "Book Now" is a brand talking to you.
    if "!" in headline:
        violations.append("headline contains an exclamation mark (not allowed)")
    return violations


class CaptionOutput(BaseModel):
    caption: str
    hashtags: list[str]
    headline: str


caption_agent = Agent(
    name="CaptionWriter",
    instructions=load_prompt("SOUL.md", "BRAND.md", "skills/caption-writer.md"),
    model=model("caption"),
    model_settings=ModelSettings(temperature=0.8),
    output_type=CaptionOutput,
)


class ReviewOutput(BaseModel):
    reads_like_ai: bool
    issues: list[str]
    revised_caption: str
    revised_hashtags: list[str]
    revised_headline: str


# Two-agent pipeline: caption_agent drafts, caption_reviewer_agent reads the
# draft as a skeptical real person and either approves it or rewrites it.
# Uses the judgement tier (a more capable model than the fast caption-writing
# one) — this is a qualitative "does this sound human" call, not a mechanical
# rule check like check_humanizer/check_formatting above, which is exactly
# the kind of task that tier exists for (see weekly_digest.py's summary).
caption_reviewer_agent = Agent(
    name="CaptionReviewer",
    instructions=load_prompt("SOUL.md", "BRAND.md", "skills/caption-reviewer.md"),
    model=model("judgement"),
    model_settings=ModelSettings(temperature=0.6, max_tokens=1024),
    output_type=ReviewOutput,
)


async def _write_audit(actor: str, action: str, subject_id: str, payload: dict):
    await write_audit(actor, action, subject_id, payload)


async def _review_caption(
    caption: str, headline: str, hashtags: list[str], asset_id: str
) -> tuple[str, str, list[str]]:
    """Send a mechanically-clean draft to the reviewer agent. Returns the
    reviewer's (possibly rewritten) caption/headline/hashtags, re-cleaned the
    same way the writer's own output is. Never blocks the pipeline — if the
    reviewer call itself fails (model unreachable, bad output), logs it and
    returns the original draft rather than losing an otherwise-good caption
    to a review-step outage."""
    try:
        result = await Runner.run(
            caption_reviewer_agent,
            f"Draft caption:\n{caption}\n\nHeadline (image/video overlay): {headline}\n\nHashtags: {hashtags}",
        )
    except Exception as e:
        logger.warning("Caption review unreachable, keeping draft as-is: %s", e)
        return caption, headline, hashtags

    review: ReviewOutput = result.final_output
    await _write_audit(
        actor="caption_reviewer_agent",
        action="caption_reviewed",
        subject_id=asset_id,
        payload={"reads_like_ai": review.reads_like_ai, "issues": review.issues},
    )
    if not review.reads_like_ai:
        return caption, headline, hashtags

    logger.info("Caption reviewer rewrote a draft (asset %s): %s", asset_id, review.issues)
    revised_caption, revised_hashtags = clean_caption_output(review.revised_caption, review.revised_hashtags)
    revised_headline = clean_headline(review.revised_headline)
    # If the reviewer's own rewrite fails the mechanical checks (rare, but a
    # second model call is a second chance to introduce a banned phrase, a
    # bad hashtag count, or an over-length headline), fall back to the
    # writer's original draft rather than ever returning output worse than
    # what we started with.
    if (
        check_humanizer(revised_caption)
        or check_formatting(revised_caption, revised_hashtags)
        or check_headline(revised_headline)
    ):
        logger.warning("Reviewer's rewrite failed checks itself, keeping the original draft (asset %s)", asset_id)
        return caption, headline, hashtags
    return revised_caption, revised_headline, revised_hashtags


async def write_caption(
    asset, template, brand: dict | None = None, creative_direction: str | None = None
) -> tuple[str, str, list[str]]:
    """Generate a caption + headline + hashtags for an asset+template pairing.

    `creative_direction`, when given, adds a one-line steer to the prompt
    (e.g. "Emphasize value, savings, and smart purchasing decisions") —
    used by jobs/create_concepts.py to generate multiple differently-angled
    concept drafts through this exact same pipeline, rather than the
    canned English-only templates it used to return that bypassed every
    check below entirely (including HUMANIZER_BANNED_PHRASES — one of
    those old templates used "elevate your home" verbatim).

    Two-agent pipeline: caption_agent drafts, mechanical checks
    (check_humanizer/check_formatting/check_headline) gate it with retries,
    then caption_reviewer_agent reads the clean draft as a skeptical real
    person and either approves it or rewrites it before it's returned. The
    mechanical checks catch what's checkable in code (banned phrases,
    markdown, hashtag/emoji counts, headline word count); the reviewer
    catches what isn't (rhythm, structure, "does this sound like a real
    person", whether the headline actually relates to the caption) — see
    skills/caption-reviewer.md.

    The headline is the short (2-5 word) text overlaid on the image/video
    itself — a distinct output from the caption, not derived from it (it
    used to be the caption's first line truncated at 80 characters, which
    produced sentence fragments instead of a real headline).

    Retries (up to LLM_MAX_RETRIES) when the humanizer/formatting/headline
    check finds a violation, regenerating rather than ever returning a bad
    caption to a reviewer. Raises if the model is unreachable or every retry
    still fails the check — this must never silently return a blank/
    placeholder caption (spec.md US1 scenario 3).
    """
    brand = brand or {}
    # Language called out on its own line rather than left buried in the raw
    # Context dict — it's the field skills/caption-writer.md's prompt
    # explicitly checks for (brand.language), so it needs to be legible to
    # the model, not just present somewhere in a repr.
    language = brand.get("language")
    phone = brand.get("phone")
    website = brand.get("website")
    contact_line = (
        f"Contact: phone={phone or 'not set — do not mention a phone number'}, "
        f"website={website or 'not set — do not mention a website'}\n"
    )
    prompt = (
        f"Write a social media caption and hashtags for this post.\n"
        f"Asset: piece={asset.piece}, tier={asset.tier}, variant={asset.variant}\n"
        f"Template: {getattr(template, 'display_name', None) or getattr(template, 'slug', None)}\n"
        f"Language: {language or 'not set — use your default (Roman Urdu + English)'}\n"
        + contact_line
        + (f"Creative direction: {creative_direction}\n" if creative_direction else "")
        + f"Context: {brand}"
    )

    violations: list[str] = []
    for attempt in range(settings.LLM_MAX_RETRIES + 1):
        try:
            retry_hint = ""
            if violations:
                retry_hint = (
                    f"\n\nYOUR PREVIOUS OUTPUT WAS REJECTED for: {'; '.join(violations)}.\n"
                    f"FIX THESE SPECIFIC ISSUES. Do NOT repeat the same mistakes.\n"
                    f"Headline MUST be {MIN_HEADLINE_WORDS}-{MAX_HEADLINE_WORDS} words. "
                    f"Emoji MUST be {MAX_EMOJI} or fewer.\n"
                )
            result = await Runner.run(caption_agent, prompt + retry_hint)
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
        clean_caption, clean_hashtags = clean_caption_output(output.caption, output.hashtags)
        clean_headline_text = clean_headline(output.headline)
        violations = (
            check_humanizer(clean_caption)
            + check_formatting(clean_caption, clean_hashtags)
            + check_headline(clean_headline_text)
        )
        if not violations:
            await _write_audit(
                actor="caption_agent",
                action="caption_generated",
                subject_id=str(getattr(asset, "id", "")),
                payload={
                    "caption_length": len(clean_caption),
                    "hashtag_count": len(clean_hashtags),
                    "headline": clean_headline_text,
                    "attempt": attempt,
                },
            )
            return await _review_caption(
                clean_caption, clean_headline_text, clean_hashtags, str(getattr(asset, "id", ""))
            )

        logger.warning("Caption rejected (attempt %d): %s", attempt, violations)
        await _write_audit(
            actor="caption_agent",
            action="caption_humanizer_rejected",
            subject_id=str(getattr(asset, "id", "")),
            payload={"violations": violations, "attempt": attempt},
        )

    raise ValueError(f"Caption still failed checks after {settings.LLM_MAX_RETRIES + 1} attempts: {violations}")
