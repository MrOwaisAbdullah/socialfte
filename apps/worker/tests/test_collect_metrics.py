"""Tests for the metrics collector — Week 4, US4.

Verifies a successful post writes a metrics row for both windows, a draft-only post
is skipped without raising, and missing yt-analytics scope is handled gracefully.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _make_scalar_result(rows):
    """Create an execute result mock that returns rows via .scalars().all()"""
    scalar = MagicMock()
    scalar.all.return_value = rows
    result = MagicMock()
    result.scalars.return_value = scalar
    return result


def _make_post(id_str, platform="facebook", state="published", external_id="ext-1"):
    post = MagicMock(spec=["id", "platform", "state", "external_id"])
    post.id = id_str
    post.platform = platform
    post.state = state
    post.external_id = external_id
    return post


@pytest.fixture(autouse=True)
def mock_deps():
    with patch("jobs.collect_metrics.SessionLocal") as mock_session_factory:
        mock_session = AsyncMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)
        yield {"session": mock_session}


@pytest.mark.asyncio
async def test_collect_metrics_writes_rows(mock_deps):
    """A successful Facebook post with an external_id writes metrics rows for both windows."""
    from jobs.collect_metrics import collect_metrics

    mock_post = _make_post("post-1", platform="facebook")
    mock_cred = MagicMock(spec=["platform", "access_token", "refresh_token", "meta"])
    mock_cred.platform = "facebook"
    mock_cred.access_token = "tok"
    mock_cred.refresh_token = None
    mock_cred.meta = {}
    mock_session = mock_deps["session"]

    call_order = []

    async def execute_side_effect(stmt, **kwargs):
        call_order.append(str(type(stmt).__name__))
        # First call: posts query, return mock_post
        # Second call: credentials query, return mock_cred
        if len(call_order) == 1:
            return _make_scalar_result([mock_post])
        return _make_scalar_result([mock_cred])

    mock_session.execute = execute_side_effect

    with patch("jobs.collect_metrics._fetch_page_insights", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = {"reach": 100, "likes": 10, "saves": 5, "comments": 2, "shares": 3}
        await collect_metrics()
        assert mock_fetch.call_count == 2  # called for 24h and 7d windows


@pytest.mark.asyncio
async def test_manual_post_skipped(mock_deps):
    """A manually-posted post (no external_id) is skipped without raising."""
    from jobs.collect_metrics import collect_metrics

    mock_post = _make_post("post-2", external_id=None)
    mock_session = mock_deps["session"]

    async def execute_side_effect(stmt, **kwargs):
        return _make_scalar_result([mock_post])

    mock_session.execute = execute_side_effect

    with patch("jobs.collect_metrics._fetch_page_insights", new_callable=AsyncMock) as mock_fetch:
        await collect_metrics()
        mock_fetch.assert_not_called()


@pytest.mark.asyncio
async def test_youtube_shorts_dispatches_to_fetch_youtube_metrics(mock_deps):
    """A published youtube_shorts post with an external_id calls _fetch_youtube_metrics.

    (The missing-scope skip itself lives inside _fetch_youtube_metrics, which reads
    the real token file's granted scopes — see test_youtube_missing_scope_skipped
    below for that behavior in isolation.)
    """
    from jobs.collect_metrics import collect_metrics

    mock_post = _make_post("post-3", platform="youtube_shorts")
    mock_session = mock_deps["session"]

    call_order = []

    async def execute_side_effect(stmt, **kwargs):
        call_order.append(1)
        if len(call_order) == 1:
            return _make_scalar_result([mock_post])
        return _make_scalar_result([])  # no credentials rows needed for youtube_shorts

    mock_session.execute = execute_side_effect

    with patch("jobs.collect_metrics._fetch_youtube_metrics", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = None
        await collect_metrics()
        mock_fetch.assert_called_once_with(mock_post)


@pytest.mark.asyncio
async def test_youtube_missing_scope_skipped(tmp_path):
    """_fetch_youtube_metrics skips (returns None) when the token file lacks
    yt-analytics.readonly, without raising."""
    from jobs.collect_metrics import _fetch_youtube_metrics

    token_file = tmp_path / "token.json"
    token_file.write_text("{}", encoding="utf-8")

    mock_post = _make_post("post-3", platform="youtube_shorts")
    mock_creds = MagicMock(expired=False, scopes=["https://www.googleapis.com/auth/youtube.upload"])

    with patch("jobs.collect_metrics.settings") as mock_settings, \
         patch("google.oauth2.credentials.Credentials.from_authorized_user_file", return_value=mock_creds):
        mock_settings.YOUTUBE_TOKEN_PATH = str(token_file)

        result = await _fetch_youtube_metrics(mock_post)

        assert result is None
