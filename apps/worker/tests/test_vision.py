"""Tests for the vision tagging agent — Week 4, Step 3.

Verifies quality_gate() sets reject_reason when quality_score is below the schema's
documented threshold (60) and leaves it null otherwise.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def mock_deps():
    with patch("brain.vision.SessionLocal") as mock_session:
        mock_session_instance = AsyncMock()
        mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_session_instance)
        mock_session.return_value.__aexit__ = AsyncMock(return_value=False)
        yield {"session": mock_session_instance}


@pytest.mark.asyncio
async def test_quality_gate_flags_low_score(mock_deps):
    from brain.vision import AssetAnalysis, quality_gate

    analysis = AssetAnalysis(
        piece="dining set", tier="tier1", variant="standard",
        quality_score=40, lighting_ok=False, composition_ok=True,
    )

    with patch("brain.vision._analyze_asset", new_callable=AsyncMock) as mock_analyze:
        mock_analyze.return_value = analysis

        lighting_ok, composition_ok, reject_reason = await quality_gate("https://example.com/a.jpg")

        assert lighting_ok is False
        assert composition_ok is True
        assert reject_reason is not None
        assert "lighting" in reject_reason


@pytest.mark.asyncio
async def test_quality_gate_passes_high_score(mock_deps):
    from brain.vision import AssetAnalysis, quality_gate

    analysis = AssetAnalysis(
        piece="dining set", tier="tier1", variant="standard",
        quality_score=85, lighting_ok=True, composition_ok=True,
    )

    with patch("brain.vision._analyze_asset", new_callable=AsyncMock) as mock_analyze:
        mock_analyze.return_value = analysis

        lighting_ok, composition_ok, reject_reason = await quality_gate("https://example.com/a.jpg")

        assert lighting_ok is True
        assert composition_ok is True
        assert reject_reason is None


@pytest.mark.asyncio
async def test_tag_asset_returns_tagging_fields(mock_deps):
    from brain.vision import AssetAnalysis, tag_asset

    analysis = AssetAnalysis(
        piece="dining set", tier="tier2", variant="bridal",
        quality_score=90, lighting_ok=True, composition_ok=True,
    )

    with patch("brain.vision._analyze_asset", new_callable=AsyncMock) as mock_analyze:
        mock_analyze.return_value = analysis

        result = await tag_asset("https://example.com/a.jpg")

        assert result == {"piece": "dining set", "tier": "tier2", "variant": "bridal", "quality_score": 90}


@pytest.mark.asyncio
async def test_score_frame_returns_structured_score(mock_deps):
    from brain.vision import FrameScore, score_frame

    with patch("brain.vision.Runner.run", new_callable=AsyncMock) as mock_run:
        mock_run.return_value = MagicMock(final_output=FrameScore(score=8, reason="Product clearly visible, in focus"))

        result = await score_frame("https://example.com/frame.jpg")

        assert result.score == 8
        assert "focus" in result.reason
