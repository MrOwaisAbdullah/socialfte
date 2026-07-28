"""Tests for the caption composer agent — Week 4, Step 2.

Verifies the humanizer check catches banned phrases and passes clean captions
(FR-002), and that write_caption retries on a humanizer violation rather than ever
returning a banned-phrase caption.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def test_check_humanizer_catches_banned_phrase():
    from brain.composer import check_humanizer

    violations = check_humanizer("Elevate your space with this stunning new set!")
    assert "elevate your space" in violations


def test_check_humanizer_passes_clean_caption():
    from brain.composer import check_humanizer

    violations = check_humanizer("Solid sheesham dining set. Workshop price, showroom quality.")
    assert violations == []


def test_clean_caption_output_strips_markdown_asterisks():
    """Confirmed live: a real caption had **Yousuf Living Storage Bench**
    and posted with the literal asterisks intact — Facebook/Instagram/
    TikTok don't render markdown."""
    from brain.composer import clean_caption_output

    caption, _ = clean_caption_output("Check out our **Storage Bench** today, *upholstered* in velvet.", ["#tag"])
    assert "*" not in caption
    assert "Storage Bench" in caption
    assert "upholstered" in caption


def test_clean_caption_output_dedupes_and_caps_hashtags():
    """Confirmed live: a real caption had 30 hashtags, the full list
    duplicated twice."""
    from brain.composer import clean_caption_output, MAX_HASHTAGS

    tags = ["#A", "#B", "#a", "#C", "#D", "#E", "#F", "#G", "#H", "#I", "#J"]
    _, cleaned = clean_caption_output("caption", tags)
    assert len(cleaned) == MAX_HASHTAGS
    assert len([t for t in cleaned if t.lower() == "#a"]) == 1


def test_check_formatting_flags_too_few_hashtags():
    from brain.composer import check_formatting

    violations = check_formatting("A clean caption with no emoji.", ["#one", "#two"])
    assert any("hashtag" in v for v in violations)


def test_check_formatting_flags_excessive_emoji():
    from brain.composer import check_formatting

    violations = check_formatting("✨🛋️📦💚🎉 too many emoji here", ["#a", "#b", "#c"])
    assert any("emoji" in v for v in violations)


def test_check_formatting_passes_clean_input():
    from brain.composer import check_formatting

    violations = check_formatting("A normal caption with one emoji ✨.", ["#a", "#b", "#c"])
    assert violations == []


def test_clean_headline_strips_markdown_asterisks():
    from brain.composer import clean_headline

    assert clean_headline("**Solid Sheesham** Chair") == "Solid Sheesham Chair"


def test_check_headline_flags_too_short():
    from brain.composer import check_headline

    violations = check_headline("Sheesham")
    assert any("word" in v for v in violations)


def test_check_headline_flags_too_long():
    from brain.composer import check_headline

    violations = check_headline("This Is Way Too Many Words For An Overlay")
    assert any("word" in v for v in violations)


def test_check_headline_passes_two_to_five_words():
    from brain.composer import check_headline

    assert check_headline("Solid Sheesham, Not Veneer") == []
    assert check_headline("Storage Bench") == []


@pytest.fixture(autouse=True)
def mock_deps():
    with patch("brain.composer.write_audit", new_callable=AsyncMock) as mock_write_audit:
        yield {"write_audit": mock_write_audit}


@pytest.mark.asyncio
async def test_write_caption_retries_on_humanizer_violation(mock_deps):
    from brain.composer import CaptionOutput, ReviewOutput, write_caption

    asset = MagicMock(id="asset-1", piece="dining set", tier="tier1", variant="standard")
    template = MagicMock(slug="hero", display_name="Hero")

    bad_result = MagicMock()
    bad_result.final_output = CaptionOutput(
        caption="Elevate your space today!", hashtags=["#furniture", "#homedecor", "#pakistan"], headline="Solid Sheesham Dining Set"
    )

    good_result = MagicMock()
    good_result.final_output = CaptionOutput(
        caption="Solid sheesham dining set.", hashtags=["#furniture", "#homedecor", "#pakistan"], headline="Solid Sheesham Dining Set"
    )

    review_result = MagicMock()
    review_result.final_output = ReviewOutput(
        reads_like_ai=False, issues=[], revised_caption="", revised_hashtags=[], revised_headline=""
    )

    with patch("brain.composer.Runner.run", new_callable=AsyncMock) as mock_run:
        mock_run.side_effect = [bad_result, good_result, review_result]

        caption, headline, hashtags = await write_caption(asset, template)

        assert caption == "Solid sheesham dining set."
        assert headline == "Solid Sheesham Dining Set"
        assert mock_run.call_count == 3


@pytest.mark.asyncio
async def test_write_caption_passes_brand_language_into_prompt(mock_deps):
    """write_caption() was always called with brand={} (the signature's
    default) in every real caller — brand.language never reached the model.
    Confirms the prompt actually carries whatever language the caller
    passes, and states the default explicitly when none is set."""
    from brain.composer import CaptionOutput, ReviewOutput, write_caption

    asset = MagicMock(id="asset-1", piece="dining set", tier="tier1", variant="standard")
    template = MagicMock(slug="hero", display_name="Hero")
    result = MagicMock()
    result.final_output = CaptionOutput(
        caption="Solid sheesham dining set.", hashtags=["#furniture", "#homedecor", "#pakistan"], headline="Solid Sheesham Dining Set"
    )
    review_result = MagicMock()
    review_result.final_output = ReviewOutput(
        reads_like_ai=False, issues=[], revised_caption="", revised_hashtags=[], revised_headline=""
    )

    # Two Runner.run calls per write_caption() now: the writer, then the
    # reviewer — the prompt assertion below only cares about the writer's
    # prompt (the first call), not the reviewer's.
    with patch("brain.composer.Runner.run", new_callable=AsyncMock, side_effect=[result, review_result]) as mock_run:
        await write_caption(asset, template, brand={"language": "english"})
        prompt = mock_run.call_args_list[0][0][1]
        assert "Language: english" in prompt

    with patch("brain.composer.Runner.run", new_callable=AsyncMock, side_effect=[result, review_result]) as mock_run:
        await write_caption(asset, template, brand={})
        prompt = mock_run.call_args_list[0][0][1]
        assert "Roman Urdu + English" in prompt


@pytest.mark.asyncio
async def test_write_caption_raises_when_model_unreachable(mock_deps):
    from brain.composer import write_caption

    asset = MagicMock(id="asset-1", piece="dining set", tier="tier1", variant="standard")
    template = MagicMock(slug="hero", display_name="Hero")

    with patch("brain.composer.Runner.run", new_callable=AsyncMock) as mock_run:
        mock_run.side_effect = ConnectionError("model unreachable")

        with pytest.raises(ConnectionError):
            await write_caption(asset, template)
