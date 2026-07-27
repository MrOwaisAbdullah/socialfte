"""Tests for the anti-repeat gate — Week 4, Step 4.

The check_caption test is the one that would catch a cosine distance/similarity
inversion immediately (research.md Decision 2) — it's written first for that reason.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def mock_deps():
    with patch("composer.anti_repeat.SessionLocal") as mock_session:
        mock_session_instance = AsyncMock()
        mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_session_instance)
        mock_session.return_value.__aexit__ = AsyncMock(return_value=False)
        yield {"session": mock_session_instance}


@pytest.mark.asyncio
async def test_check_template_rejects_recent_use(mock_deps):
    from composer.anti_repeat import check_template

    recent_post = MagicMock(template_id="template-A", asset_id=None)
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [recent_post]
    mock_deps["session"].execute.return_value = mock_result

    assert await check_template("template-A") is False


@pytest.mark.asyncio
async def test_check_template_accepts_unused_template(mock_deps):
    from composer.anti_repeat import check_template

    recent_post = MagicMock(template_id="template-A", asset_id=None)
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [recent_post]
    mock_deps["session"].execute.return_value = mock_result

    assert await check_template("template-B") is True


@pytest.mark.asyncio
async def test_check_asset_rejects_recent_use(mock_deps):
    from composer.anti_repeat import check_asset

    recent_post = MagicMock(template_id=None, asset_id="asset-A")
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [recent_post]
    mock_deps["session"].execute.return_value = mock_result

    assert await check_asset("asset-A") is False


@pytest.mark.asyncio
async def test_check_asset_accepts_unused_asset(mock_deps):
    from composer.anti_repeat import check_asset

    recent_post = MagicMock(template_id=None, asset_id="asset-A")
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [recent_post]
    mock_deps["session"].execute.return_value = mock_result

    assert await check_asset("asset-B") is True


@pytest.mark.asyncio
async def test_check_caption_rejects_near_identical_embedding(mock_deps):
    """This is the test that catches a distance/similarity inversion immediately."""
    from composer.anti_repeat import check_caption

    ids_result = MagicMock()
    ids_result.all.return_value = [("post-1",)]

    violation_result = MagicMock()
    violation_result.scalar_one_or_none.return_value = "post-1"  # a match was found -> reject

    mock_deps["session"].execute.side_effect = [ids_result, violation_result]

    assert await check_caption([0.1, 0.2, 0.3]) is False


@pytest.mark.asyncio
async def test_check_caption_accepts_dissimilar_embedding(mock_deps):
    from composer.anti_repeat import check_caption

    ids_result = MagicMock()
    ids_result.all.return_value = [("post-1",)]

    violation_result = MagicMock()
    violation_result.scalar_one_or_none.return_value = None  # no match -> accept

    mock_deps["session"].execute.side_effect = [ids_result, violation_result]

    assert await check_caption([0.9, 0.8, 0.7]) is True


@pytest.mark.asyncio
async def test_check_caption_accepts_when_no_history(mock_deps):
    from composer.anti_repeat import check_caption

    ids_result = MagicMock()
    ids_result.all.return_value = []
    mock_deps["session"].execute.return_value = ids_result

    assert await check_caption([0.1, 0.2, 0.3]) is True
