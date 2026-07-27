"""Tests for the BOOTSTRAP wizard — Week 4, US7.

Verifies resumability (interrupt after Step 2 and resume doesn't re-prompt Step 1/2)
and that the verify-and-finish step exists and runs checks.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.mark.asyncio
async def test_bootstrap_resumable(tmp_path):
    """Interrupting after Step 2 and resuming does not re-prompt Step 1 or Step 2's questions."""
    from bootstrap.steps import _is_step_done

    soul = tmp_path / "SOUL.md"
    soul.write_text("# Test Agent\nDirect.", encoding="utf-8")
    identity = tmp_path / "IDENTITY.md"
    identity.write_text("# Identity\nAgent: Test Agent", encoding="utf-8")
    brand = tmp_path / "BRAND.md"
    brand.write_text("# Test Brand\nColors: #000", encoding="utf-8")

    with patch("bootstrap.steps.REPO", tmp_path):
        assert _is_step_done(1) is True
        assert _is_step_done(2) is True
        assert _is_step_done(3) is False


@pytest.mark.asyncio
async def test_bootstrap_verify_function_exists():
    """The verify-and-finish step function exists and is callable."""
    from bootstrap.steps import step_6_verify

    assert callable(step_6_verify)


@pytest.mark.asyncio
async def test_step_6_verify_runs_checks_on_first_run(tmp_path):
    """On a genuine first-time run (BOOTSTRAP.md not written yet), step_6_verify must
    actually execute its four checks — not silently skip them and report success.

    This is the scenario the inverted _is_step_done(6) guard broke: `not exists()`
    meant a brand-new setup (marker absent) looked "already done" and every check
    was skipped, so BOOTSTRAP.md was never actually written on a real first run.
    """
    import bootstrap.steps as steps_module

    # Deliberately not created — a genuine first-time run.

    with patch("brain.base.model", return_value="litellm/openrouter/free-model"), \
         patch("agents.Runner.run") as mock_run, \
         patch("httpx.AsyncClient.post") as mock_post, \
         patch("notify.discord.send") as mock_send, \
         patch("db.session.SessionLocal") as mock_session_factory:
        mock_run.return_value = MagicMock(final_output="ok")

        mock_response = MagicMock(status_code=200)
        mock_post.return_value = mock_response

        mock_send.return_value = "message-id"

        mock_session = MagicMock()
        mock_execute_result = MagicMock()
        mock_execute_result.scalar.return_value = 0
        mock_session.execute = AsyncMock(return_value=mock_execute_result)
        mock_session_factory.return_value.__aenter__.return_value = mock_session
        mock_session_factory.return_value.__aexit__.return_value = False

        # If the guard is still inverted, this returns True immediately without
        # calling Runner.run/httpx/notify.discord.send at all.
        await steps_module.step_6_verify(tmp_path)

        assert mock_run.called, "step_6_verify skipped its checks on a first-time run"
        assert (tmp_path / "BOOTSTRAP.md").exists(), "step_6_verify didn't write the completion marker"


@pytest.mark.asyncio
async def test_step_6_verify_skips_when_already_completed(tmp_path):
    """Once BOOTSTRAP.md already exists (a previous successful run), step_6_verify
    must return True immediately without re-running any checks."""
    import bootstrap.steps as steps_module

    marker = tmp_path / "BOOTSTRAP.md"
    marker.write_text("# Bootstrap Complete\n", encoding="utf-8")

    with patch("agents.Runner.run") as mock_run:
        result = await steps_module.step_6_verify(tmp_path)

        assert result is True
        mock_run.assert_not_called()
