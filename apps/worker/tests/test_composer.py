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


@pytest.fixture(autouse=True)
def mock_deps():
    with patch("brain.composer.write_audit", new_callable=AsyncMock) as mock_write_audit:
        yield {"write_audit": mock_write_audit}


@pytest.mark.asyncio
async def test_write_caption_retries_on_humanizer_violation(mock_deps):
    from brain.composer import CaptionOutput, write_caption

    asset = MagicMock(id="asset-1", piece="dining set", tier="tier1", variant="standard")
    template = MagicMock(slug="hero", display_name="Hero")

    bad_result = MagicMock()
    bad_result.final_output = CaptionOutput(caption="Elevate your space today!", hashtags=["#furniture"])

    good_result = MagicMock()
    good_result.final_output = CaptionOutput(caption="Solid sheesham dining set.", hashtags=["#furniture"])

    with patch("brain.composer.Runner.run", new_callable=AsyncMock) as mock_run:
        mock_run.side_effect = [bad_result, good_result]

        caption, hashtags = await write_caption(asset, template)

        assert caption == "Solid sheesham dining set."
        assert mock_run.call_count == 2


@pytest.mark.asyncio
async def test_write_caption_raises_when_model_unreachable(mock_deps):
    from brain.composer import write_caption

    asset = MagicMock(id="asset-1", piece="dining set", tier="tier1", variant="standard")
    template = MagicMock(slug="hero", display_name="Hero")

    with patch("brain.composer.Runner.run", new_callable=AsyncMock) as mock_run:
        mock_run.side_effect = ConnectionError("model unreachable")

        with pytest.raises(ConnectionError):
            await write_caption(asset, template)
