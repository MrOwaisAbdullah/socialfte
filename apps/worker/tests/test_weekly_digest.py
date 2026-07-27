"""Tests for the weekly digest — Week 4, US5.

Verifies a week with published posts produces a summary sent via Discord and appended
to MEMORY.md, and a week with zero posts reports the absence of activity.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _make_scalar_result(rows):
    scalar = MagicMock()
    scalar.all.return_value = rows
    result = MagicMock()
    result.scalars.return_value = scalar
    return result


@pytest.fixture(autouse=True)
def mock_deps():
    with patch("jobs.weekly_digest.SessionLocal") as mock_session_factory:
        mock_session = AsyncMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)
        yield {"session": mock_session}


@pytest.mark.asyncio
async def test_weekly_digest_with_posts(mock_deps, tmp_path):
    """A week with published posts produces a summary sent via Discord and appended to MEMORY.md."""
    from jobs.weekly_digest import weekly_digest

    mock_post = MagicMock(id="post-1", platform="instagram", published_at=MagicMock(),
                          external_id="ext-1", error=None)
    mock_metric = MagicMock(post_id="post-1", reach=150, likes=20, saves=8, comments=3, shares=5,
                            collected_at=MagicMock())

    mock_session = mock_deps["session"]

    async def execute_side_effect(stmt, **kwargs):
        scalar = _make_scalar_result
        stmt_str = str(stmt)
        if "Metric" in stmt_str:
            return _make_scalar_result([mock_metric])
        return _make_scalar_result([mock_post])

    mock_session.execute = execute_side_effect
    mock_session.add = AsyncMock()
    mock_session.commit = AsyncMock()

    mock_memory = tmp_path / "MEMORY.md"

    with patch("jobs.weekly_digest.Runner.run", new_callable=AsyncMock) as mock_run:
        mock_result = MagicMock()
        mock_result.final_output = "Good week — 1 post on Instagram, top reach 150."
        mock_run.return_value = mock_result

        with patch("notify.discord.send", new_callable=AsyncMock) as mock_send:
            with patch("jobs.weekly_digest.settings.MEMORY_MD_PATH", str(mock_memory)):
                await weekly_digest()
                assert mock_send.called
                assert mock_memory.exists()
                content = mock_memory.read_text(encoding="utf-8")
                assert "Week of" in content


@pytest.mark.asyncio
async def test_weekly_digest_zero_posts(mock_deps, tmp_path):
    """A week with zero published posts reports absence of activity."""
    from jobs.weekly_digest import weekly_digest

    mock_session = mock_deps["session"]

    async def execute_side_effect(stmt, **kwargs):
        return _make_scalar_result([])

    mock_session.execute = execute_side_effect
    mock_session.add = AsyncMock()
    mock_session.commit = AsyncMock()

    mock_memory = tmp_path / "MEMORY.md"
    mock_memory.write_text("# History", encoding="utf-8")

    with patch("notify.discord.send", new_callable=AsyncMock) as mock_send:
        with patch("jobs.weekly_digest.settings.MEMORY_MD_PATH", str(mock_memory)):
            await weekly_digest()
            assert mock_send.called
            content = mock_memory.read_text(encoding="utf-8")
            assert "no posts" in content.lower() or "No posts" in content
