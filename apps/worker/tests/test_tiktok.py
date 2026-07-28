"""Tests for TikTok publisher — Week 3, Step 6.

Verifies draft_only mode writes correct post state.
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, timezone


@pytest.fixture(autouse=True)
def mock_deps():
    """Mock all dependencies for TikTok publisher tests."""
    with patch("publishers.tiktok.SessionLocal") as mock_session, \
         patch("notify.discord.send", new_callable=AsyncMock) as mock_send, \
         patch("publishers.tiktok.write_audit", new_callable=AsyncMock) as mock_write_audit:

        mock_send.return_value = "message_123"
        mock_session_instance = AsyncMock()
        mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_session_instance)
        mock_session.return_value.__aexit__ = AsyncMock(return_value=False)

        yield {
            "session": mock_session_instance,
            "discord_send": mock_send,
            "write_audit": mock_write_audit,
        }


@pytest.mark.asyncio
async def test_tiktok_draft_only_sets_state(mock_deps):
    """Draft-only mode should set post state to 'tiktok_ready'."""
    from publishers.tiktok import publish_video
    
    # Mock the post object
    mock_post = MagicMock()
    mock_post.state = "approved"
    
    with patch("publishers.tiktok.settings") as mock_settings:
        mock_settings.TIKTOK_MODE = "draft_only"
        
        with patch("publishers.tiktok.Post") as MockPost:
            # Setup the session.get to return our mock post
            mock_deps["session"].get.return_value = mock_post
            
            # Run the function
            await publish_video(
                post_id="test_post_123",
                video_url="https://media.yousufliving.com/video.mp4",
                caption="Test TikTok caption",
            )
            
            # Verify the state was updated
            assert mock_post.state == "tiktok_ready"


@pytest.mark.asyncio
async def test_tiktok_draft_only_sends_notification(mock_deps):
    """Draft-only mode should send a Discord notification with download link."""
    from publishers.tiktok import publish_video
    
    with patch("publishers.tiktok.settings") as mock_settings:
        mock_settings.TIKTOK_MODE = "draft_only"
        
        # Run the function
        await publish_video(
            post_id="test_post_123",
            video_url="https://media.yousufliving.com/video.mp4",
            caption="Test TikTok caption",
        )
        
        # Verify Discord notification was sent
        mock_deps["discord_send"].assert_called_once()
        call_args = mock_deps["discord_send"].call_args[0][0]
        assert "TikTok Ready" in call_args
        assert "https://media.yousufliving.com/video.mp4" in call_args
        assert "Test TikTok caption" in call_args


@pytest.mark.asyncio
async def test_tiktok_draft_only_writes_audit(mock_deps):
    """Draft-only mode should write an audit log."""
    from publishers.tiktok import publish_video
    
    with patch("publishers.tiktok.settings") as mock_settings:
        mock_settings.TIKTOK_MODE = "draft_only"
        
        # Run the function
        await publish_video(
            post_id="test_post_123",
            video_url="https://media.yousufliving.com/video.mp4",
            caption="Test TikTok caption",
        )
        
        # Verify audit log was written
        mock_deps["write_audit"].assert_called()
        actor, action, subject_id, payload = mock_deps["write_audit"].call_args[0]
        assert actor == "tiktok_publisher"
        assert action == "draft_ready"
        assert subject_id == "test_post_123"
        assert payload["platform"] == "tiktok"
        assert payload["mode"] == "draft_only"


@pytest.mark.asyncio
async def test_tiktok_direct_post_requires_token(mock_deps):
    """Direct-post mode should raise error if no token is configured."""
    from publishers.tiktok import publish_video
    
    with patch("publishers.tiktok.settings") as mock_settings:
        mock_settings.TIKTOK_MODE = "direct_post"
        mock_settings.TIKTOK_ACCESS_TOKEN = ""
        
        with pytest.raises(ValueError, match="TIKTOK_ACCESS_TOKEN not configured"):
            await publish_video(
                post_id="test_post_123",
                video_url="https://media.yousufliving.com/video.mp4",
                caption="Test TikTok caption",
            )


@pytest.mark.asyncio
async def test_tiktok_returns_none_for_draft_only(mock_deps):
    """Draft-only mode should return None (no external_id)."""
    from publishers.tiktok import publish_video
    
    with patch("publishers.tiktok.settings") as mock_settings:
        mock_settings.TIKTOK_MODE = "draft_only"
        
        result = await publish_video(
            post_id="test_post_123",
            video_url="https://media.yousufliving.com/video.mp4",
            caption="Test TikTok caption",
        )
        
        assert result is None
