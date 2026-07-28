"""Tests for video render dispatch — Week 5, Step 2.

Verifies dispatch_video_render() sends the correct workflow_dispatch inputs and
rejects an unknown composition before ever making a network call (FR-003).
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def mock_deps():
    with patch("jobs.dispatch_render.write_audit", new_callable=AsyncMock) as mock_write_audit, \
         patch("jobs.dispatch_render.settings.GITHUB_TOKEN", "fake-token"), \
         patch("jobs.dispatch_render.settings.GITHUB_REPO", "owner/repo"):
        yield {"write_audit": mock_write_audit}


@pytest.mark.asyncio
async def test_dispatch_rejects_unknown_composition(mock_deps):
    from jobs.dispatch_render import dispatch_video_render

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        with pytest.raises(ValueError, match="Unknown composition_id"):
            await dispatch_video_render("post-1", "NotARealComposition", {})

        mock_post.assert_not_called()


@pytest.mark.asyncio
async def test_dispatch_sends_correct_inputs(mock_deps):
    from jobs.dispatch_render import dispatch_video_render

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = b'{"workflow_run_id": 12345}'
    mock_response.json.return_value = {"workflow_run_id": 12345}
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post, \
         patch("asyncio.create_task") as mock_create_task:
        mock_post.return_value = mock_response

        run_id = await dispatch_video_render("post-1", "HeroReveal", {"headline": "Test"})

        assert run_id == "12345"
        mock_post.assert_called_once()
        call_args = mock_post.call_args
        assert "workflows" in call_args[0][0]
        assert "dispatches" in call_args[0][0]

        body = call_args[1]["json"]
        assert body["inputs"]["composition_id"] == "HeroReveal"
        assert body["inputs"]["output_key"] == "renders/post-1.mp4"
        assert '"headline": "Test"' in body["inputs"]["props"]

        # Polling must be scheduled as a background task, not awaited inline —
        # dispatch_video_render must return promptly regardless of render duration.
        mock_create_task.assert_called_once()


@pytest.mark.asyncio
async def test_dispatch_handles_204_response_without_run_id(mock_deps):
    """Older/Enterprise Server GitHub API behavior: 204 No Content, no run ID."""
    from jobs.dispatch_render import dispatch_video_render

    mock_response = MagicMock()
    mock_response.status_code = 204
    mock_response.content = b""
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post, \
         patch("asyncio.create_task") as mock_create_task:
        mock_post.return_value = mock_response

        run_id = await dispatch_video_render("post-1", "HeroReveal", {})

        assert run_id is None
        mock_create_task.assert_not_called()


@pytest.mark.asyncio
async def test_dispatch_rejects_missing_github_token(mock_deps):
    """An empty GITHUB_TOKEN must fail clearly before the network call, not
    bubble up httpx's "Illegal header value b'Bearer '" (confirmed live)."""
    from jobs.dispatch_render import dispatch_video_render

    with patch("jobs.dispatch_render.settings.GITHUB_TOKEN", ""), \
         patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        with pytest.raises(ValueError, match="GITHUB_TOKEN and GITHUB_REPO"):
            await dispatch_video_render("post-1", "HeroReveal", {})

        mock_post.assert_not_called()


@pytest.mark.asyncio
async def test_dispatch_rejects_missing_github_repo(mock_deps):
    from jobs.dispatch_render import dispatch_video_render

    with patch("jobs.dispatch_render.settings.GITHUB_REPO", ""), \
         patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        with pytest.raises(ValueError, match="GITHUB_TOKEN and GITHUB_REPO"):
            await dispatch_video_render("post-1", "HeroReveal", {})

        mock_post.assert_not_called()
