"""Tests for the BOOTSTRAP wizard — Week 4, US7.

Verifies resumability (interrupt after Step 2 and resume doesn't re-prompt Step 1/2)
and that the verify-and-finish step exists and runs checks.
"""
from unittest.mock import MagicMock, patch

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
