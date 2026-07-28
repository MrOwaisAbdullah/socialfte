"""Tests for persisted schedule overrides (job_schedules.py)."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def mock_session():
    with patch("job_schedules.SessionLocal") as mock_session_factory:
        session = AsyncMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=session)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)
        yield session


@pytest.mark.asyncio
async def test_get_overrides_returns_job_id_to_cron_map(mock_session):
    from job_schedules import get_overrides

    row1 = MagicMock(job_id="compose_batch", cron_expression="0 4 * * *")
    row2 = MagicMock(job_id="publish_due", cron_expression="*/10 * * * *")
    scalars_result = MagicMock()
    scalars_result.all.return_value = [row1, row2]
    execute_result = MagicMock()
    execute_result.scalars.return_value = scalars_result
    mock_session.execute = AsyncMock(return_value=execute_result)

    overrides = await get_overrides()

    assert overrides == {"compose_batch": "0 4 * * *", "publish_due": "*/10 * * * *"}


@pytest.mark.asyncio
async def test_save_override_updates_existing_row(mock_session):
    from job_schedules import save_override

    existing = MagicMock(job_id="compose_batch", cron_expression="0 4 * * *")
    mock_session.get = AsyncMock(return_value=existing)

    await save_override("compose_batch", "0 5 * * *")

    assert existing.cron_expression == "0 5 * * *"
    mock_session.add.assert_not_called()
    mock_session.commit.assert_awaited()


@pytest.mark.asyncio
async def test_save_override_creates_new_row_when_none_exists(mock_session):
    from job_schedules import save_override

    mock_session.get = AsyncMock(return_value=None)

    await save_override("compose_batch", "0 5 * * *")

    mock_session.add.assert_called_once()
    added = mock_session.add.call_args[0][0]
    assert added.job_id == "compose_batch"
    assert added.cron_expression == "0 5 * * *"
    mock_session.commit.assert_awaited()
