"""Tests for the creative concepts generation job (jobs/create_concepts.py).

Was never tested at all before this — the job existed only as a manually-
invoked script and generated canned English-only text that bypassed every
quality guardrail in brain/composer.py. These tests cover the real-agent
replacement: write_caption() called CONCEPT_VARIATIONS times per concept,
hashtags folded into the caption text, partial-failure resilience, and that
_build_brand_tokens is built once per run, not once per concept.
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
    with patch("jobs.create_concepts.SessionLocal") as mock_session_factory, \
         patch("jobs.create_concepts.write_audit", new_callable=AsyncMock) as mock_write_audit, \
         patch("jobs.create_concepts._build_brand_tokens", new_callable=AsyncMock, return_value={}) as mock_brand:
        mock_session = AsyncMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)
        yield {"session": mock_session, "write_audit": mock_write_audit, "brand": mock_brand}


@pytest.mark.asyncio
async def test_generate_concept_variations_collects_headlines_and_captions():
    from jobs.create_concepts import _generate_concept_variations, CONCEPT_VARIATIONS

    asset = MagicMock(id="asset-1", piece="dining set", tier="tier1", variant="standard")

    with patch("jobs.create_concepts.write_caption", new_callable=AsyncMock) as mock_write:
        mock_write.return_value = ("Solid sheesham dining set.", "Solid Sheesham Set", ["#furniture", "#sheesham"])

        headlines, captions = await _generate_concept_variations(asset, "quality", {})

        assert mock_write.call_count == CONCEPT_VARIATIONS
        assert headlines == ["Solid Sheesham Set"] * CONCEPT_VARIATIONS
        # Hashtags folded into the caption text, matching compose_batch.py's
        # own caption_text construction.
        assert captions[0] == "Solid sheesham dining set.\n\n#furniture #sheesham"


@pytest.mark.asyncio
async def test_generate_concept_variations_passes_creative_direction():
    """The concept_type's creative direction must actually reach
    write_caption() — otherwise every concept_type would generate
    identically-angled content."""
    from jobs.create_concepts import _generate_concept_variations

    asset = MagicMock(id="asset-1", piece="dining set", tier="tier1", variant="standard")

    with patch("jobs.create_concepts.write_caption", new_callable=AsyncMock) as mock_write:
        mock_write.return_value = ("Caption.", "Headline", ["#tag"])

        await _generate_concept_variations(asset, "price-focused", {})

        _, kwargs = mock_write.call_args
        assert kwargs["creative_direction"] == "Emphasize value, savings, and smart purchasing decisions"


@pytest.mark.asyncio
async def test_generate_concept_variations_skips_failed_attempts():
    """One failed generation must not abort the whole concept — the
    remaining successful variations are still returned."""
    from jobs.create_concepts import _generate_concept_variations, CONCEPT_VARIATIONS

    asset = MagicMock(id="asset-1", piece="dining set", tier="tier1", variant="standard")

    # The CONCEPT_VARIATIONS calls run concurrently (asyncio.gather), so a
    # call-count-based side_effect function can't reliably target "the
    # first call" — all calls happen synchronously before any of them
    # actually runs. A side_effect list is consumed in call order instead,
    # which stays well-defined regardless of await interleaving.
    with patch("jobs.create_concepts.write_caption", new_callable=AsyncMock) as mock_write:
        mock_write.side_effect = [ConnectionError("model unreachable")] + [
            ("Caption.", "Headline", ["#tag"]) for _ in range(CONCEPT_VARIATIONS - 1)
        ]

        headlines, captions = await _generate_concept_variations(asset, "quality", {})

        assert mock_write.call_count == CONCEPT_VARIATIONS
        assert len(headlines) == CONCEPT_VARIATIONS - 1
        assert len(captions) == CONCEPT_VARIATIONS - 1


@pytest.mark.asyncio
async def test_create_concepts_stores_generated_concept(mock_deps):
    from jobs.create_concepts import create_concepts

    mock_asset = MagicMock(id="asset-1", piece="dining set", tier="tier1", variant="standard",
                           kind="photo", reject_reason=None, created_at=MagicMock())
    mock_session = mock_deps["session"]
    call_count = 0

    async def execute_side_effect(stmt, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return _make_scalar_result([mock_asset])
        # Every subsequent call is the "existing approved concepts" check.
        return _make_scalar_result([])

    mock_session.execute = execute_side_effect

    with patch("jobs.create_concepts.write_caption", new_callable=AsyncMock) as mock_write:
        mock_write.return_value = ("Solid sheesham dining set.", "Solid Sheesham Set", ["#furniture"])

        await create_concepts()

        assert mock_session.add.called
        added_concept = mock_session.add.call_args_list[0][0][0]
        assert added_concept.state == "draft"
        assert added_concept.headlines == ["Solid Sheesham Set"] * 3
        mock_deps["brand"].assert_awaited_once()


@pytest.mark.asyncio
async def test_create_concepts_skips_concept_when_all_variations_fail(mock_deps):
    """If every write_caption() call for a concept fails, no row should be
    stored — an empty-content concept is worse than no concept at all."""
    from jobs.create_concepts import create_concepts

    mock_asset = MagicMock(id="asset-1", piece="dining set", tier="tier1", variant="standard",
                           kind="photo", reject_reason=None, created_at=MagicMock())
    mock_session = mock_deps["session"]
    mock_session.execute = AsyncMock(side_effect=[
        _make_scalar_result([mock_asset]),
        _make_scalar_result([]),
        _make_scalar_result([]),
    ])

    with patch("jobs.create_concepts.write_caption", new_callable=AsyncMock) as mock_write:
        mock_write.side_effect = ConnectionError("model unreachable")

        await create_concepts()

        mock_session.add.assert_not_called()


@pytest.mark.asyncio
async def test_create_concepts_skips_asset_with_enough_approved_concepts(mock_deps):
    from jobs.create_concepts import create_concepts

    mock_asset = MagicMock(id="asset-1", piece="dining set", tier="tier1", variant="standard",
                           kind="photo", reject_reason=None, created_at=MagicMock())
    mock_session = mock_deps["session"]

    async def execute_side_effect(stmt, **kwargs):
        if execute_side_effect.calls == 0:
            execute_side_effect.calls += 1
            return _make_scalar_result([mock_asset])
        # 3 already-approved concepts — at the "already sufficient" threshold.
        return _make_scalar_result([MagicMock(), MagicMock(), MagicMock()])
    execute_side_effect.calls = 0

    mock_session.execute = execute_side_effect

    with patch("jobs.create_concepts.write_caption", new_callable=AsyncMock) as mock_write:
        await create_concepts()

        mock_write.assert_not_called()
        mock_session.add.assert_not_called()
