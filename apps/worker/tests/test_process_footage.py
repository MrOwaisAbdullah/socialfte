"""Tests for video clip processing — Week 5, Steps 3-4.

Verifies the audio pipeline's pass/fail branching (US2) and the cover-frame
selection's top-3/usability-threshold behavior (US3).
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def test_check_av_sync_passes_when_durations_match():
    from jobs.process_footage import check_av_sync

    with patch("jobs.process_footage._stream_duration", side_effect=[10.0, 10.1]):
        assert check_av_sync("fake.mp4") is True


def test_check_av_sync_fails_on_gross_desync():
    from jobs.process_footage import check_av_sync

    with patch("jobs.process_footage._stream_duration", side_effect=[10.0, 4.0]):
        assert check_av_sync("fake.mp4") is False


def test_check_av_sync_passes_with_no_audio_stream():
    """Silent footage has nothing to be out of sync with (spec.md edge case)."""
    from jobs.process_footage import check_av_sync

    with patch("jobs.process_footage._stream_duration", side_effect=[10.0, None]):
        assert check_av_sync("fake.mp4") is True


@pytest.fixture(autouse=True)
def mock_deps():
    with patch("jobs.process_footage.SessionLocal") as mock_session, \
         patch("jobs.process_footage.write_audit", new_callable=AsyncMock) as mock_write_audit:
        mock_session_instance = AsyncMock()
        mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_session_instance)
        mock_session.return_value.__aexit__ = AsyncMock(return_value=False)
        yield {"session": mock_session_instance, "write_audit": mock_write_audit}


@pytest.mark.asyncio
async def test_process_one_clip_stops_after_failed_sync_check(mock_deps, tmp_path):
    """A clip that fails verify (sync check) is marked processed=true, sync_ok=false,
    and never reaches music mixing or cover-frame extraction."""
    from jobs.process_footage import _process_one_clip

    asset = MagicMock(id="asset-1", r2_key="clips/asset-1.mp4")
    mock_deps["session"].get = AsyncMock(return_value=asset)

    with patch("jobs.process_footage._download_from_r2", new_callable=AsyncMock), \
         patch("jobs.process_footage._run") as mock_run, \
         patch("jobs.process_footage.check_av_sync", return_value=False) as mock_sync, \
         patch("jobs.process_footage._extract_and_score_cover_frames", new_callable=AsyncMock) as mock_extract:
        mock_run.return_value = ""

        await _process_one_clip(asset, tmp_path)

        mock_sync.assert_called_once()
        assert asset.sync_ok is False
        assert asset.processed is True
        mock_extract.assert_not_called()


@pytest.mark.asyncio
async def test_process_one_clip_continues_after_passed_sync_check(mock_deps, tmp_path):
    """A clip that passes verify gets sync_ok=true, a quality_score, and proceeds
    to music mixing and cover-frame extraction."""
    from jobs.process_footage import _process_one_clip

    asset = MagicMock(id="asset-2", r2_key="clips/asset-2.mp4")
    mock_deps["session"].get = AsyncMock(return_value=asset)

    with patch("jobs.process_footage._download_from_r2", new_callable=AsyncMock), \
         patch("jobs.process_footage._run") as mock_run, \
         patch("jobs.process_footage.check_av_sync", return_value=True), \
         patch("jobs.process_footage._extract_and_score_cover_frames", new_callable=AsyncMock) as mock_extract:
        mock_run.return_value = ""

        await _process_one_clip(asset, tmp_path)

        assert asset.sync_ok is True
        assert asset.processed is True
        assert asset.quality_score is not None
        mock_extract.assert_called_once()


@pytest.mark.asyncio
async def test_cover_frames_selects_top_three_by_score(mock_deps, tmp_path):
    from jobs.process_footage import _extract_and_score_cover_frames

    mock_post = MagicMock(id="post-1")
    posts_result = MagicMock()
    posts_result.scalars.return_value.all.return_value = [mock_post]
    mock_deps["session"].execute = AsyncMock(return_value=posts_result)
    mock_deps["session"].get = AsyncMock(return_value=mock_post)

    scores = [MagicMock(score=s, reason="r") for s in [8, 3, 9, 2, 7, 1, 6, 5, 4, 8, 2, 9]]

    with patch("jobs.process_footage._run", return_value="6.0"), \
         patch("jobs.process_footage._upload_to_r2", new_callable=AsyncMock, return_value="https://example.com/f.jpg"), \
         patch("jobs.process_footage.score_frame", new_callable=AsyncMock, side_effect=scores):
        await _extract_and_score_cover_frames("asset-1", tmp_path / "clip.mp4", tmp_path)

        assert mock_post.cover_frame_candidates is not None
        assert len(mock_post.cover_frame_candidates) == 3
        top_scores = sorted([c["score"] for c in mock_post.cover_frame_candidates], reverse=True)
        assert top_scores == [9, 9, 8]


@pytest.mark.asyncio
async def test_cover_frames_reports_when_none_usable(mock_deps, tmp_path):
    """All 12 frames scoring below the usability threshold is reported (FR-010),
    not an empty/broken candidate list silently accepted."""
    from jobs.process_footage import _extract_and_score_cover_frames

    mock_post = MagicMock(id="post-1")
    posts_result = MagicMock()
    posts_result.scalars.return_value.all.return_value = [mock_post]
    mock_deps["session"].execute = AsyncMock(return_value=posts_result)
    mock_deps["session"].get = AsyncMock(return_value=mock_post)

    low_scores = [MagicMock(score=1, reason="blurry") for _ in range(12)]

    with patch("jobs.process_footage._run", return_value="6.0"), \
         patch("jobs.process_footage._upload_to_r2", new_callable=AsyncMock, return_value="https://example.com/f.jpg"), \
         patch("jobs.process_footage.score_frame", new_callable=AsyncMock, side_effect=low_scores):
        await _extract_and_score_cover_frames("asset-1", tmp_path / "clip.mp4", tmp_path)

        # No usable candidates -> the function must return before ever reaching
        # the per-post write loop (session.get is only called there).
        mock_deps["session"].get.assert_not_called()
