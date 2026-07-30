"""Tests for the vision-tagging retry job (retag_assets.py) — catches assets
whose upload-time fire-and-forget /vision/tag call failed and never retried.
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
    with patch("jobs.retag_assets.SessionLocal") as mock_session_factory, \
         patch("jobs.retag_assets.write_audit", new_callable=AsyncMock) as mock_write_audit:
        mock_session = AsyncMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)
        yield {"session": mock_session, "write_audit": mock_write_audit}


@pytest.mark.asyncio
async def test_retag_assets_noop_when_nothing_untagged(mock_deps):
    from jobs.retag_assets import retag_assets

    mock_deps["session"].execute = AsyncMock(return_value=_make_scalar_result([]))

    with patch("jobs.retag_assets._analyze_asset", new_callable=AsyncMock) as mock_analyze:
        await retag_assets()
        mock_analyze.assert_not_called()


@pytest.mark.asyncio
async def test_retag_assets_updates_asset_fields(mock_deps):
    from jobs.retag_assets import retag_assets

    mock_asset = MagicMock(id="asset-1", r2_key="assets/photo.png")
    mock_session = mock_deps["session"]

    call_count = 0

    async def execute_side_effect(stmt, **kwargs):
        nonlocal call_count
        call_count += 1
        return _make_scalar_result([mock_asset])

    mock_session.execute = execute_side_effect

    mock_row = MagicMock()
    mock_session.get = AsyncMock(return_value=mock_row)

    mock_analysis = MagicMock(piece="chair", tier="tier1", variant="standard",
                               quality_score=85, lighting_ok=True, composition_ok=True)

    with patch("jobs.retag_assets._analyze_asset", new_callable=AsyncMock, return_value=mock_analysis), \
         patch("jobs.retag_assets.settings") as mock_settings:
        mock_settings.R2_PUBLIC_URL = "https://media.test.com"
        await retag_assets()

    assert mock_row.piece == "chair"
    assert mock_row.quality_score == 85
    assert mock_row.reject_reason is None
    mock_session.commit.assert_awaited()
    assert mock_deps["write_audit"].await_count == 2  # asset_tagged + asset_quality_checked


@pytest.mark.asyncio
async def test_retag_assets_sets_reject_reason_below_threshold(mock_deps):
    from jobs.retag_assets import QUALITY_SCORE_REJECT_THRESHOLD, retag_assets

    mock_asset = MagicMock(id="asset-2", r2_key="assets/blurry.png")
    mock_session = mock_deps["session"]
    mock_session.execute = AsyncMock(return_value=_make_scalar_result([mock_asset]))
    mock_row = MagicMock()
    mock_session.get = AsyncMock(return_value=mock_row)

    mock_analysis = MagicMock(piece="chair", tier="tier1", variant="standard",
                               quality_score=QUALITY_SCORE_REJECT_THRESHOLD - 1, lighting_ok=False, composition_ok=True)

    with patch("jobs.retag_assets._analyze_asset", new_callable=AsyncMock, return_value=mock_analysis), \
         patch("jobs.retag_assets.settings") as mock_settings:
        mock_settings.R2_PUBLIC_URL = "https://media.test.com"
        await retag_assets()

    assert mock_row.reject_reason == "poor lighting"


@pytest.mark.asyncio
async def test_retag_assets_continues_after_one_failure(mock_deps):
    """One asset's vision call raising must not abort the rest of the batch."""
    from jobs.retag_assets import retag_assets

    mock_asset_1 = MagicMock(id="asset-3", r2_key="assets/a.png")
    mock_asset_2 = MagicMock(id="asset-4", r2_key="assets/b.png")
    mock_session = mock_deps["session"]
    mock_session.execute = AsyncMock(return_value=_make_scalar_result([mock_asset_1, mock_asset_2]))
    mock_row = MagicMock()
    mock_session.get = AsyncMock(return_value=mock_row)

    mock_analysis = MagicMock(piece="table", tier="tier1", variant="standard",
                               quality_score=90, lighting_ok=True, composition_ok=True)

    async def analyze_side_effect(image_url, original_filename=None):
        if "a.png" in image_url:
            raise RuntimeError("vision API timeout")
        return mock_analysis

    with patch("jobs.retag_assets._analyze_asset", new_callable=AsyncMock, side_effect=analyze_side_effect), \
         patch("jobs.retag_assets.settings") as mock_settings:
        mock_settings.R2_PUBLIC_URL = "https://media.test.com"
        await retag_assets()

    # asset-2 (b.png) still got tagged despite asset-1 (a.png) failing.
    assert mock_row.piece == "table"


@pytest.mark.asyncio
async def test_retag_assets_marks_asset_missing_on_404(mock_deps):
    """Confirmed live: a user deleted files directly from R2, leaving assets
    rows with a permanently 404ing r2_key. Before this fix, a failed vision
    call just logged an error and left quality_score NULL — the exact
    condition this job selects on — so a dead asset got retried forever,
    every run. A confirmed 'image fetch 404' error must mark the row
    rejected instead, so it's excluded from future runs."""
    from jobs.retag_assets import retag_assets

    mock_asset = MagicMock(id="asset-5", r2_key="assets/deleted.png")
    mock_session = mock_deps["session"]
    mock_session.execute = AsyncMock(return_value=_make_scalar_result([mock_asset]))
    mock_row = MagicMock()
    mock_session.get = AsyncMock(return_value=mock_row)

    async def analyze_side_effect(image_url, original_filename=None):
        raise RuntimeError(
            'OpenrouterException - {"error":{"message":"Received 404 status code '
            'when fetching image from URL: https://pub-test.r2.dev/assets/deleted.png"}}'
        )

    with patch("jobs.retag_assets._analyze_asset", new_callable=AsyncMock, side_effect=analyze_side_effect), \
         patch("jobs.retag_assets.settings") as mock_settings:
        mock_settings.R2_PUBLIC_URL = "https://media.test.com"
        await retag_assets()

    assert mock_row.quality_score == 0
    assert mock_row.reject_reason == "R2 object not found (404) — file appears to have been deleted from storage"
    mock_session.commit.assert_awaited()


@pytest.mark.asyncio
async def test_retag_assets_leaves_transient_failure_untouched(mock_deps):
    """A non-404 failure (rate limit, timeout, bad response) must NOT mark
    the asset rejected — it should stay eligible for retry on the next run,
    unlike the confirmed-missing-image case above."""
    from jobs.retag_assets import retag_assets

    mock_asset = MagicMock(id="asset-6", r2_key="assets/flaky.png")
    mock_session = mock_deps["session"]
    mock_session.execute = AsyncMock(return_value=_make_scalar_result([mock_asset]))
    mock_row = MagicMock()
    mock_session.get = AsyncMock(return_value=mock_row)

    async def analyze_side_effect(image_url, original_filename=None):
        raise RuntimeError("rate limit exceeded")

    with patch("jobs.retag_assets._analyze_asset", new_callable=AsyncMock, side_effect=analyze_side_effect), \
         patch("jobs.retag_assets.settings") as mock_settings:
        mock_settings.R2_PUBLIC_URL = "https://media.test.com"
        await retag_assets()

    mock_session.get.assert_not_called()
    mock_session.commit.assert_not_awaited()
