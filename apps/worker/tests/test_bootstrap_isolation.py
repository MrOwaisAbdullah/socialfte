"""Tests for BOOTSTRAP's `--env=<path>` isolation — Week 5, US6 (T051).

Proves the second-brand simulation's core safety property: running the wizard
against an isolated client directory never reads or writes the real repo
root's identity files (SOUL.md, BRAND.md, HEARTBEAT.md, IDENTITY.md,
BOOTSTRAP.md) — the exact thing that would make onboarding a second client
unsafe if it were still true.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


REPO_IDENTITY_FILES = ["SOUL.md", "BRAND.md", "HEARTBEAT.md", "IDENTITY.md", "BOOTSTRAP.md"]


def _snapshot_repo_identity_files():
    """(exists, mtime) for each real repo-root identity file, before the run."""
    from bootstrap.steps import REPO

    snapshot = {}
    for name in REPO_IDENTITY_FILES:
        path = REPO / name
        snapshot[name] = (path.exists(), path.stat().st_mtime if path.exists() else None)
    return snapshot


@pytest.mark.asyncio
async def test_bootstrap_with_env_flag_never_touches_real_repo_files(tmp_path):
    """python -m worker bootstrap --env=<tmp_path>/.env writes only under tmp_path."""
    from bootstrap.steps import run_bootstrap

    # Pre-seed steps 1/2/5's outputs so they skip straight past their prompts —
    # mirrors clients/test-client-2/{SOUL.md,BRAND.md} being pre-seeded stubs.
    (tmp_path / "SOUL.md").write_text("# Test Agent Two\n", encoding="utf-8")
    (tmp_path / "IDENTITY.md").write_text("# Identity\nAgent: Test Agent Two\n", encoding="utf-8")
    (tmp_path / "BRAND.md").write_text("# Test Client 2\n", encoding="utf-8")
    (tmp_path / "HEARTBEAT.md").write_text("# Heartbeat\n", encoding="utf-8")

    before = _snapshot_repo_identity_files()

    with patch("bootstrap.steps._ask", new_callable=AsyncMock, return_value=""), \
         patch("brain.base.model", return_value="litellm/openrouter/free-model"), \
         patch("agents.Runner.run") as mock_run, \
         patch("httpx.AsyncClient.post") as mock_post, \
         patch("notify.discord.send") as mock_send, \
         patch("db.session.SessionLocal") as mock_session_factory:
        mock_run.return_value = MagicMock(final_output="ok")
        mock_post.return_value = MagicMock(status_code=200)
        mock_send.return_value = "message-id"

        mock_session = MagicMock()
        mock_execute_result = MagicMock()
        mock_execute_result.scalar.return_value = 0
        mock_execute_result.scalar_one_or_none.return_value = None
        mock_session.execute = AsyncMock(return_value=mock_execute_result)
        mock_session.commit = AsyncMock()
        mock_session_factory.return_value.__aenter__.return_value = mock_session
        mock_session_factory.return_value.__aexit__.return_value = False

        await run_bootstrap(tmp_path)

    after = _snapshot_repo_identity_files()

    # The real repo root's identity files: same existence, same mtime — untouched.
    assert before == after, "run_bootstrap(tmp_path) modified a real repo-root identity file"

    # The isolated client directory got its own completion marker.
    assert (tmp_path / "BOOTSTRAP.md").exists(), "BOOTSTRAP.md was not written to the isolated root"


def test_cli_env_flag_resolves_to_env_files_parent_directory(tmp_path):
    """cli.py's --env=<path>/.env should thread <path>'s parent (the client
    directory), not the .env file path itself, through to run_bootstrap as
    `root`. Not an async test — main() manages its own event loop via
    asyncio.run(), which can't be nested inside pytest-asyncio's loop."""
    from bootstrap.cli import main

    env_file = tmp_path / ".env"
    env_file.write_text("", encoding="utf-8")

    with patch("bootstrap.cli.run_bootstrap", new_callable=AsyncMock) as mock_run_bootstrap:
        main([f"--env={env_file}"])

        mock_run_bootstrap.assert_called_once()
        (called_root,), _ = mock_run_bootstrap.call_args
        assert called_root == tmp_path.resolve()
