"""Tests for main.py's _seed_templates() — inserts any DEFAULT_TEMPLATES slug
missing from the table without touching what's already there. Was "only seed
when the table is completely empty", which meant adding a new template to
DEFAULT_TEMPLATES (as happened when the 4 sample-post templates were added)
never reached a live, already-populated table on restart.
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
def mock_session():
    with patch("main.SessionLocal") as mock_session_factory:
        session = AsyncMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=session)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)
        yield session


@pytest.mark.asyncio
async def test_seed_templates_adds_only_missing_slugs(mock_session):
    from main import DEFAULT_TEMPLATES, _seed_templates

    all_slugs = [slug for slug, _ in DEFAULT_TEMPLATES]
    already_present = set(all_slugs[:3])
    mock_session.execute = AsyncMock(return_value=_make_scalar_result(list(already_present)))

    await _seed_templates()

    added_slugs = {call.args[0].slug for call in mock_session.add.call_args_list}
    assert added_slugs == set(all_slugs) - already_present
    mock_session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_seed_templates_noop_when_nothing_missing(mock_session):
    from main import DEFAULT_TEMPLATES, _seed_templates

    all_slugs = [slug for slug, _ in DEFAULT_TEMPLATES]
    mock_session.execute = AsyncMock(return_value=_make_scalar_result(all_slugs))

    await _seed_templates()

    mock_session.add.assert_not_called()
    mock_session.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_seed_templates_includes_sample_post_templates(mock_session):
    """The 4 sample-post-inspired templates must actually be in the seed
    list — a missing entry here means a fresh deployment's templates table
    never gets them, matching how before-after was never seeded (it's
    registered but not in DEFAULT_TEMPLATES)."""
    from main import DEFAULT_TEMPLATES

    slugs = {slug for slug, _ in DEFAULT_TEMPLATES}
    assert {"bold-headline", "exclusive-badge", "light-circle-frame", "sweet-dreams"} <= slugs
