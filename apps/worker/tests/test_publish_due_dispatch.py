"""Tests for jobs.publish_due._dispatch_publisher()'s format routing.

Separate from test_publish_due.py because that file's autouse fixture mocks
_dispatch_publisher() away entirely for every test — these need the real
implementation.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_dispatch_publisher_routes_facebook_video_to_post_reel():
    """compose_batch.py's PLATFORM_FORMATS calls Facebook's video format
    "video", not "reel" — but post_reel() is the only Facebook video
    publisher that exists. Confirmed live: every composed Facebook video
    post hit the unsupported-format branch and failed with "Unsupported
    Facebook format: video" before ever reaching the Graph API (7 posts,
    one real incident). format_type="video" must route the same place
    format_type="reel" does."""
    from jobs.publish_due import _dispatch_publisher

    mock_post = MagicMock(platform="facebook", format="video", render_url="https://x/video.mp4", caption="Test")

    with patch("jobs.publish_due.settings.META_PAGE_ID", "page_123"), \
         patch("publishers.meta.post_reel", new_callable=AsyncMock, return_value="fb_video_1") as mock_post_reel, \
         patch("publishers.meta.post_image", new_callable=AsyncMock) as mock_post_image:
        result = await _dispatch_publisher(mock_post)

    assert result == "fb_video_1"
    mock_post_reel.assert_called_once_with("page_123", "https://x/video.mp4", "Test")
    mock_post_image.assert_not_called()


@pytest.mark.asyncio
async def test_dispatch_publisher_routes_instagram_video_to_post_ig_reel():
    """Same "video" vs "reel" vocabulary mismatch on the Instagram branch."""
    from jobs.publish_due import _dispatch_publisher

    mock_post = MagicMock(platform="instagram", format="video", render_url="https://x/video.mp4", caption="Test")

    with patch("jobs.publish_due.settings.META_IG_USER_ID", "ig_123"), \
         patch("publishers.meta.post_ig_reel", new_callable=AsyncMock, return_value="ig_video_1") as mock_post_ig_reel, \
         patch("publishers.meta.post_ig_image", new_callable=AsyncMock) as mock_post_ig_image:
        result = await _dispatch_publisher(mock_post)

    assert result == "ig_video_1"
    mock_post_ig_reel.assert_called_once_with("ig_123", "https://x/video.mp4", "Test")
    mock_post_ig_image.assert_not_called()


@pytest.mark.asyncio
async def test_dispatch_publisher_still_rejects_truly_unsupported_facebook_format():
    from jobs.publish_due import _dispatch_publisher

    mock_post = MagicMock(platform="facebook", format="carousel", render_url="https://x/img.jpg", caption="Test")

    with patch("jobs.publish_due.settings.META_PAGE_ID", "page_123"):
        with pytest.raises(ValueError, match="Unsupported Facebook format: carousel"):
            await _dispatch_publisher(mock_post)
