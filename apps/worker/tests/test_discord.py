"""Tests for Discord notification — Week 3, Step 8.

Verifies send_approval creates correct embed structure.
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, timezone


@pytest.fixture(autouse=True)
def mock_deps():
    """Mock all dependencies for Discord notification tests."""
    with patch("notify.discord.settings") as mock_settings:
        mock_settings.DISCORD_BOT_TOKEN = "test_bot_token"
        mock_settings.DISCORD_CHANNEL_ID = "123456789"
        
        yield {"settings": mock_settings}


@pytest.mark.asyncio
async def test_send_basic_message(mock_deps):
    """send() should post a basic text message to Discord."""
    from notify.discord import send
    
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"id": "message_123"}
    mock_response.raise_for_status = MagicMock()
    
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_response
        
        result = await send("Hello Discord!")
        
        assert result == "message_123"
        mock_post.assert_called_once()
        call_args = mock_post.call_args
        assert "channels/123456789/messages" in call_args[0][0]
        assert call_args[1]["json"]["content"] == "Hello Discord!"


@pytest.mark.asyncio
async def test_send_with_media_url(mock_deps):
    """send() with media_url should include an embed."""
    from notify.discord import send
    
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"id": "message_456"}
    mock_response.raise_for_status = MagicMock()
    
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_response
        
        result = await send("Check this out!", "https://example.com/image.jpg")
        
        assert result == "message_456"
        call_args = mock_post.call_args
        assert call_args[1]["json"]["embeds"][0]["image"]["url"] == "https://example.com/image.jpg"


@pytest.mark.asyncio
async def test_send_approval_creates_correct_structure(mock_deps):
    """send_approval() should create an embed with correct structure."""
    from notify.discord import send_approval
    
    # Create a mock post
    mock_post = MagicMock()
    mock_post.id = "post_123"
    mock_post.platform = "facebook"
    mock_post.format = "image"
    mock_post.caption = "Test caption for approval"
    mock_post.render_url = "https://media.yousufliving.com/render.jpg"
    mock_post.scheduled_at = datetime(2026, 7, 28, 15, 0, tzinfo=timezone.utc)
    mock_post.cover_frame_candidates = None
    
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"id": "approval_789"}
    mock_response.raise_for_status = MagicMock()
    
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post_req:
        mock_post_req.return_value = mock_response
        
        result = await send_approval(mock_post)
        
        assert result == "approval_789"
        
        # Verify the embed structure
        call_args = mock_post_req.call_args
        payload = call_args[1]["json"]
        
        assert len(payload["embeds"]) == 1
        embed = payload["embeds"][0]
        
        assert "FACEBOOK" in embed["title"]
        assert "image" in embed["title"]
        assert embed["description"] == "Test caption for approval"
        assert embed["color"] == 0x1B4332  # Brand primary
        assert embed["image"]["url"] == "https://media.yousufliving.com/render.jpg"
        assert "Scheduled" in embed["footer"]["text"]
        
        # Verify the buttons
        assert len(payload["components"]) == 1
        buttons = payload["components"][0]["components"]
        assert len(buttons) == 3
        
        assert buttons[0]["label"] == "Approve"
        assert buttons[0]["custom_id"] == "approve:post_123"
        assert buttons[0]["style"] == 3  # Success (green)
        
        assert buttons[1]["label"] == "Edit"
        assert buttons[1]["custom_id"] == "edit:post_123"
        assert buttons[1]["style"] == 2  # Secondary (grey)
        
        assert buttons[2]["label"] == "Skip"
        assert buttons[2]["custom_id"] == "skip:post_123"
        assert buttons[2]["style"] == 4  # Danger (red)


@pytest.mark.asyncio
async def test_send_approval_truncates_long_caption(mock_deps):
    """send_approval() should truncate captions over 2000 chars."""
    from notify.discord import send_approval
    
    # Create a mock post with a very long caption
    mock_post = MagicMock()
    mock_post.id = "post_456"
    mock_post.platform = "instagram"
    mock_post.format = "reel"
    mock_post.caption = "x" * 2500  # 2500 chars
    mock_post.render_url = "https://media.yousufliving.com/render.jpg"
    mock_post.scheduled_at = datetime(2026, 7, 28, 15, 0, tzinfo=timezone.utc)
    mock_post.cover_frame_candidates = None
    
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"id": "approval_999"}
    mock_response.raise_for_status = MagicMock()
    
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post_req:
        mock_post_req.return_value = mock_response
        
        await send_approval(mock_post)
        
        # Verify caption is truncated
        call_args = mock_post_req.call_args
        payload = call_args[1]["json"]
        description = payload["embeds"][0]["description"]
        
        assert len(description) <= 2003  # 2000 + "..."
        assert description.endswith("...")


@pytest.mark.asyncio
async def test_send_approval_no_render_url(mock_deps):
    """send_approval() should handle posts without render_url."""
    from notify.discord import send_approval
    
    mock_post = MagicMock()
    mock_post.id = "post_789"
    mock_post.platform = "youtube_shorts"
    mock_post.format = "short"
    mock_post.caption = "YouTube Short caption"
    mock_post.render_url = None
    mock_post.scheduled_at = datetime(2026, 7, 28, 15, 0, tzinfo=timezone.utc)
    mock_post.cover_frame_candidates = None
    
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"id": "approval_111"}
    mock_response.raise_for_status = MagicMock()
    
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post_req:
        mock_post_req.return_value = mock_response
        
        await send_approval(mock_post)
        
        # Verify no image in embed
        call_args = mock_post_req.call_args
        payload = call_args[1]["json"]
        embed = payload["embeds"][0]
        
        assert "image" not in embed
        assert "YOUTUBE_SHORTS" in embed["title"]


@pytest.mark.asyncio
async def test_send_approval_adds_cover_frame_picker(mock_deps):
    """send_approval() should add a preview embed + button per cover-frame candidate."""
    from notify.discord import send_approval

    mock_post = MagicMock()
    mock_post.id = "post_321"
    mock_post.platform = "tiktok"
    mock_post.format = "video"
    mock_post.caption = "Video post caption"
    mock_post.render_url = None
    mock_post.scheduled_at = datetime(2026, 7, 28, 15, 0, tzinfo=timezone.utc)
    mock_post.cover_frame_candidates = [
        {"url": "https://example.com/f1.jpg", "score": 9, "reason": "sharp"},
        {"url": "https://example.com/f2.jpg", "score": 8, "reason": "good"},
        {"url": "https://example.com/f3.jpg", "score": 7, "reason": "ok"},
    ]

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"id": "approval_321"}
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post_req:
        mock_post_req.return_value = mock_response

        await send_approval(mock_post)

        payload = mock_post_req.call_args[1]["json"]

        # 1 approval embed + 3 cover-frame preview embeds
        assert len(payload["embeds"]) == 4
        assert payload["embeds"][1]["image"]["url"] == "https://example.com/f1.jpg"
        assert payload["embeds"][2]["image"]["url"] == "https://example.com/f2.jpg"
        assert payload["embeds"][3]["image"]["url"] == "https://example.com/f3.jpg"

        # Approve/Edit/Skip row + a second row of 3 cover-frame buttons
        assert len(payload["components"]) == 2
        cover_buttons = payload["components"][1]["components"]
        assert len(cover_buttons) == 3
        assert cover_buttons[0]["custom_id"] == "cover:post_321:1"
        assert cover_buttons[1]["custom_id"] == "cover:post_321:2"
        assert cover_buttons[2]["custom_id"] == "cover:post_321:3"


@pytest.mark.asyncio
async def test_send_approval_no_cover_frame_row_when_empty(mock_deps):
    """A post with no cover-frame candidates should get exactly one action row."""
    from notify.discord import send_approval

    mock_post = MagicMock()
    mock_post.id = "post_654"
    mock_post.platform = "facebook"
    mock_post.format = "image"
    mock_post.caption = "Image post"
    mock_post.render_url = "https://example.com/render.jpg"
    mock_post.scheduled_at = datetime(2026, 7, 28, 15, 0, tzinfo=timezone.utc)
    mock_post.cover_frame_candidates = None

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"id": "approval_654"}
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post_req:
        mock_post_req.return_value = mock_response

        await send_approval(mock_post)

        payload = mock_post_req.call_args[1]["json"]
        assert len(payload["embeds"]) == 1
        assert len(payload["components"]) == 1
