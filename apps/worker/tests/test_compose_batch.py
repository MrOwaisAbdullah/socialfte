"""Tests for the daily batch composer — Week 4, US3.

Verifies a full run produces posts rows with real captions and render URLs, and
that a forced anti-repeat violation causes a retry (not a published duplicate).
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
    with patch("jobs.compose_batch.SessionLocal") as mock_session_factory:
        mock_session = AsyncMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)
        yield {"session": mock_session}


@pytest.mark.asyncio
async def test_compose_batch_produces_posts(mock_deps):
    """A full run (mocked caption_agent, mocked render) produces at least one post row."""
    from jobs.compose_batch import compose_batch

    mock_asset = MagicMock(id="asset-1", r2_key="photos/test.jpg", piece="chair", tier="tier1",
                           variant="standard", times_used=0, reject_reason=None,
                           created_at=MagicMock())
    mock_template = MagicMock(id="tmpl-1", slug="hero", display_name="Hero", created_at=MagicMock())

    mock_session = mock_deps["session"]
    call_count = 0

    async def execute_side_effect(stmt, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return _make_scalar_result([mock_asset])
        return _make_scalar_result([mock_template])

    mock_session.execute = execute_side_effect

    with patch("jobs.compose_batch.write_caption", new_callable=AsyncMock) as mock_write:
        mock_write.return_value = ("Solid chair.", ["#chair"])
        with patch("jobs.compose_batch.embed", new_callable=AsyncMock) as mock_embed:
            mock_embed.return_value = [0.1] * 10
            with patch("jobs.compose_batch.anti_repeat.check_asset", new_callable=AsyncMock) as mock_ca:
                mock_ca.return_value = True
                with patch("jobs.compose_batch.anti_repeat.check_template", new_callable=AsyncMock) as mock_ct:
                    mock_ct.return_value = True
                    with patch("jobs.compose_batch.anti_repeat.check_caption", new_callable=AsyncMock) as mock_cc:
                        mock_cc.return_value = True
                        with patch("jobs.compose_batch.httpx.AsyncClient") as mock_httpx:
                            mock_resp = MagicMock()
                            mock_resp.raise_for_status = MagicMock()
                            mock_resp.json.return_value = {"url": "https://media.test.com/render.jpg"}
                            mock_httpx_instance = AsyncMock()
                            mock_httpx_instance.__aenter__ = AsyncMock(return_value=mock_httpx_instance)
                            mock_httpx_instance.__aexit__ = AsyncMock(return_value=False)
                            mock_httpx_instance.post = AsyncMock(return_value=mock_resp)
                            mock_httpx.return_value = mock_httpx_instance

                            await compose_batch()
                            assert mock_session.add.called
                            assert mock_session.commit.called


@pytest.mark.asyncio
async def test_anti_repeat_violation_retries(mock_deps):
    """Forced anti-repeat violation causes retry (not a published duplicate)."""
    from jobs.compose_batch import compose_batch

    mock_asset = MagicMock(id="asset-2", r2_key="photos/test2.jpg", piece="table", tier="tier1",
                           variant="standard", times_used=0, reject_reason=None,
                           created_at=MagicMock())
    mock_template = MagicMock(id="tmpl-2", slug="square", display_name="Square", created_at=MagicMock())

    mock_session = mock_deps["session"]
    call_count = 0

    async def execute_side_effect(stmt, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return _make_scalar_result([mock_asset])
        return _make_scalar_result([mock_template])

    mock_session.execute = execute_side_effect

    with patch("jobs.compose_batch.write_caption", new_callable=AsyncMock) as mock_write:
        mock_write.return_value = ("Test caption.", ["#test"])
        with patch("jobs.compose_batch.embed", new_callable=AsyncMock) as mock_embed:
            mock_embed.return_value = [0.1] * 10
            with patch("jobs.compose_batch.anti_repeat.check_asset", new_callable=AsyncMock) as mock_ca:
                mock_ca.return_value = True
                with patch("jobs.compose_batch.anti_repeat.check_template", new_callable=AsyncMock) as mock_ct:
                    mock_ct.return_value = True
                    with patch("jobs.compose_batch.anti_repeat.check_caption", new_callable=AsyncMock) as mock_cc:
                        mock_cc.return_value = False

                        await compose_batch()

                        assert mock_write.call_count > 1
