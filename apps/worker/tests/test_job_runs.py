"""Tests for job execution tracking (job_runs.py) — tracked() must record a
job_runs row for both successful and failing runs, and label manual vs
scheduled runs correctly via the current_trigger contextvar.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def mock_session():
    with patch("job_runs.SessionLocal") as mock_session_factory:
        session = AsyncMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=session)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)
        session.get = AsyncMock(return_value=MagicMock())
        yield session


@pytest.mark.asyncio
async def test_tracked_records_success(mock_session):
    from job_runs import tracked

    async def ok_job():
        return None

    wrapped = tracked("test_job", ok_job)
    await wrapped()

    # One row added (the "running" start), then a get+commit for the finish.
    assert mock_session.add.call_count == 1
    started_run = mock_session.add.call_args[0][0]
    assert started_run.job_id == "test_job"
    assert started_run.status == "running"
    assert started_run.trigger == "scheduled"  # default context

    finished_run = mock_session.get.return_value
    assert finished_run.status == "success"
    assert finished_run.error is None


@pytest.mark.asyncio
async def test_tracked_records_failure_and_reraises(mock_session):
    from job_runs import tracked

    async def failing_job():
        raise ValueError("boom")

    wrapped = tracked("test_job", failing_job)

    with pytest.raises(ValueError, match="boom"):
        await wrapped()

    finished_run = mock_session.get.return_value
    assert finished_run.status == "failed"
    assert "boom" in finished_run.error


@pytest.mark.asyncio
async def test_tracked_labels_manual_trigger(mock_session):
    from job_runs import tracked, current_trigger

    async def ok_job():
        return None

    wrapped = tracked("test_job", ok_job)
    token = current_trigger.set("manual")
    try:
        await wrapped()
    finally:
        current_trigger.reset(token)

    started_run = mock_session.add.call_args[0][0]
    assert started_run.trigger == "manual"


@pytest.mark.asyncio
async def test_last_runs_empty_job_ids_returns_empty_dict():
    from job_runs import last_runs

    assert await last_runs([]) == {}
