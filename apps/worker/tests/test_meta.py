"""Tests for Meta publisher — Week 3, Step 4.

Verifies the image container → publish two-step flow for Instagram.
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import httpx


@pytest.fixture(autouse=True)
def mock_deps():
    """Mock all dependencies for meta publisher tests."""
    with patch("publishers.meta._get_page_token") as mock_get_token, \
         patch("publishers.meta.write_audit", new_callable=AsyncMock) as mock_write_audit:

        # Setup mock token
        mock_get_token.return_value = "test_page_token"

        yield {
            "write_audit": mock_write_audit,
            "get_token": mock_get_token,
        }


@pytest.mark.asyncio
async def test_post_ig_image_two_step_flow(mock_deps):
    """Instagram image posting should use the two-step container → publish flow."""
    from publishers.meta import post_ig_image
    
    # Mock the container creation response
    mock_container_response = MagicMock()
    mock_container_response.status_code = 200
    mock_container_response.json.return_value = {"id": "container_123"}
    mock_container_response.raise_for_status = MagicMock()
    
    # Mock the status check response
    mock_status_response = MagicMock()
    mock_status_response.status_code = 200
    mock_status_response.json.return_value = {"status_code": "FINISHED"}
    mock_status_response.raise_for_status = MagicMock()
    
    # Mock the publish response
    mock_publish_response = MagicMock()
    mock_publish_response.status_code = 200
    mock_publish_response.json.return_value = {"id": "ig_media_456"}
    mock_publish_response.raise_for_status = MagicMock()
    
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post, \
         patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        
        # Setup post mock to return different responses based on call
        mock_post.side_effect = [
            mock_container_response,  # Step 1: Create container
            mock_publish_response,    # Step 3: Publish container
        ]
        
        # Setup get mock for status check
        mock_get.return_value = mock_status_response
        
        # Run the function
        result = await post_ig_image(
            ig_user_id="ig_user_123",
            image_url="https://media.yousufliving.com/image.jpg",
            caption="Test caption for Instagram",
        )
        
        # Verify the result
        assert result == "ig_media_456"
        
        # Verify the two-step flow was called correctly
        assert mock_post.call_count == 2
        
        # First call: Create container
        first_call = mock_post.call_args_list[0]
        assert "ig_user_123/media" in first_call[0][0]
        assert first_call[1]["data"]["image_url"] == "https://media.yousufliving.com/image.jpg"
        assert first_call[1]["data"]["caption"] == "Test caption for Instagram"
        
        # Second call: Publish container
        second_call = mock_post.call_args_list[1]
        assert "ig_user_123/media_publish" in second_call[0][0]
        assert second_call[1]["data"]["creation_id"] == "container_123"


@pytest.mark.asyncio
async def test_post_ig_image_writes_audit_on_success(mock_deps):
    """Successful Instagram image post should write an audit log."""
    from publishers.meta import post_ig_image
    
    # Mock successful responses
    mock_container_response = MagicMock()
    mock_container_response.status_code = 200
    mock_container_response.json.return_value = {"id": "container_123"}
    mock_container_response.raise_for_status = MagicMock()
    
    mock_status_response = MagicMock()
    mock_status_response.status_code = 200
    mock_status_response.json.return_value = {"status_code": "FINISHED"}
    mock_status_response.raise_for_status = MagicMock()
    
    mock_publish_response = MagicMock()
    mock_publish_response.status_code = 200
    mock_publish_response.json.return_value = {"id": "ig_media_456"}
    mock_publish_response.raise_for_status = MagicMock()
    
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post, \
         patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        
        mock_post.side_effect = [mock_container_response, mock_publish_response]
        mock_get.return_value = mock_status_response
        
        await post_ig_image(
            ig_user_id="ig_user_123",
            image_url="https://media.yousufliving.com/image.jpg",
            caption="Test caption",
        )
        
        # Verify audit log was written
        mock_deps["write_audit"].assert_called_once()
        actor, action, subject_id, payload = mock_deps["write_audit"].call_args[0]
        assert actor == "meta_publisher"
        assert action == "post_ig_image_success"
        assert subject_id == "ig_media_456"
        assert payload["platform"] == "instagram"


@pytest.mark.asyncio
async def test_post_ig_image_writes_audit_on_failure(mock_deps):
    """Failed Instagram image post should write an audit log."""
    from publishers.meta import post_ig_image
    
    # Mock failed container creation
    mock_container_response = MagicMock()
    mock_container_response.status_code = 200
    mock_container_response.json.return_value = {"id": "container_123"}
    mock_container_response.raise_for_status = MagicMock()
    
    mock_status_response = MagicMock()
    mock_status_response.status_code = 200
    mock_status_response.json.return_value = {"status_code": "ERROR"}
    mock_status_response.raise_for_status = MagicMock()
    
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post, \
         patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        
        mock_post.return_value = mock_container_response
        mock_get.return_value = mock_status_response
        
        with pytest.raises(ValueError, match="Container processing failed"):
            await post_ig_image(
                ig_user_id="ig_user_123",
                image_url="https://media.yousufliving.com/image.jpg",
                caption="Test caption",
            )
        
        # Verify audit log was written
        mock_deps["write_audit"].assert_called_once()
        actor, action, subject_id, payload = mock_deps["write_audit"].call_args[0]
        assert actor == "meta_publisher"
        assert action == "post_ig_image_failed"
        assert payload["platform"] == "instagram"
        assert "Container processing failed" in payload["error"]


@pytest.mark.asyncio
async def test_post_image_facebook_single_call_flow(mock_deps):
    """Facebook Page Photos publish immediately on a single POST (url +
    caption, no `published` param — defaults to true). There is no real
    two-step container-then-publish model here, unlike Instagram. A
    second "publish the container" call used to exist and was actively
    harmful: it sometimes 400'd on a photo that had already published
    from the first call, making this function raise for an already-live
    post — publish_due.py then marked a successful publish as `failed`.
    Confirmed live: 33 real posts went out in ~6 minutes because the
    daily cap (which only counts state='published') never engaged, since
    posts never reached that state despite actually being live."""
    from publishers.meta import post_image

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"id": "fb_post_101"}
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_response

        result = await post_image(
            page_id="page_123",
            image_url="https://media.yousufliving.com/image.jpg",
            caption="Test Facebook post",
        )

        assert result == "fb_post_101"
        assert mock_post.call_count == 1
        call = mock_post.call_args_list[0]
        assert "page_123/photos" in call[0][0]
        assert call[1]["data"]["url"] == "https://media.yousufliving.com/image.jpg"
        assert "published" not in call[1]["data"]


@pytest.mark.asyncio
async def test_post_image_includes_alt_text_when_given(mock_deps):
    """alt_text_custom should reach the Graph API request when alt_text is
    passed, using Graph API's actual field name for Page photos."""
    from publishers.meta import post_image

    mock_response = MagicMock()
    mock_response.json.return_value = {"id": "fb_post_1"}
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_response
        await post_image(
            page_id="page_123",
            image_url="https://media.yousufliving.com/image.jpg",
            caption="Test",
            alt_text="Bed by Yousuf Living",
        )
        first_call = mock_post.call_args_list[0]
        assert first_call[1]["data"]["alt_text_custom"] == "Bed by Yousuf Living"


@pytest.mark.asyncio
async def test_post_image_omits_alt_text_when_not_given(mock_deps):
    """No alt_text passed (asset had no `piece` on record) must mean the
    field is left out of the request entirely, not sent as an empty string."""
    from publishers.meta import post_image

    mock_response = MagicMock()
    mock_response.json.return_value = {"id": "fb_post_1"}
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_response
        await post_image(
            page_id="page_123",
            image_url="https://media.yousufliving.com/image.jpg",
            caption="Test",
        )
        first_call = mock_post.call_args_list[0]
        assert "alt_text_custom" not in first_call[1]["data"]


@pytest.mark.asyncio
async def test_post_ig_image_includes_alt_text_when_given(mock_deps):
    """alt_text should reach the Graph API request using Instagram's actual
    field name (different from Facebook's alt_text_custom)."""
    from publishers.meta import post_ig_image

    mock_container_response = MagicMock()
    mock_container_response.json.return_value = {"id": "container_1"}
    mock_container_response.raise_for_status = MagicMock()
    mock_status_response = MagicMock()
    mock_status_response.json.return_value = {"status_code": "FINISHED"}
    mock_status_response.raise_for_status = MagicMock()
    mock_publish_response = MagicMock()
    mock_publish_response.json.return_value = {"id": "ig_media_1"}
    mock_publish_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post, \
         patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_post.side_effect = [mock_container_response, mock_publish_response]
        mock_get.return_value = mock_status_response
        await post_ig_image(
            ig_user_id="ig_user_123",
            image_url="https://media.yousufliving.com/image.jpg",
            caption="Test",
            alt_text="Bed by Yousuf Living",
        )
        first_call = mock_post.call_args_list[0]
        assert first_call[1]["data"]["alt_text"] == "Bed by Yousuf Living"
