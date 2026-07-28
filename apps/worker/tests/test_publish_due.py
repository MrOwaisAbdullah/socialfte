"""Tests for publish due job — Week 3, Step 7.

Verifies a post past its scheduled_at gets published and a cap-exceeded post gets skipped.
"""
import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch, MagicMock


@pytest.fixture(autouse=True)
def mock_deps():
    """Mock all dependencies for publish_due tests."""
    with patch("jobs.publish_due.SessionLocal") as mock_session, \
         patch("jobs.publish_due._check_platform_cap") as mock_cap, \
         patch("jobs.publish_due._dispatch_publisher") as mock_dispatch, \
         patch("jobs.publish_due.send") as mock_send, \
         patch("jobs.publish_due.write_audit", new_callable=AsyncMock) as mock_write_audit:

        # Setup mock session
        mock_session_instance = AsyncMock()
        mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_session_instance)
        mock_session.return_value.__aexit__ = AsyncMock(return_value=False)

        yield {
            "session": mock_session_instance,
            "check_cap": mock_cap,
            "dispatch": mock_dispatch,
            "send": mock_send,
            "write_audit": mock_write_audit,
        }


@pytest.mark.asyncio
async def test_publish_due_publishes_past_scheduled(mock_deps):
    """Post past its scheduled_at should be published."""
    from jobs.publish_due import publish_due
    
    # Create a mock post that's past its scheduled time
    mock_post = MagicMock()
    mock_post.id = "test_post_123"
    mock_post.platform = "facebook"
    mock_post.format = "image"
    mock_post.scheduled_at = datetime.now(timezone.utc) - timedelta(hours=1)
    mock_post.state = "approved"
    mock_post.render_url = "https://media.yousufliving.com/image.jpg"
    mock_post.caption = "Test caption"
    
    # Setup the mock query result
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [mock_post]
    mock_deps["session"].execute.return_value = mock_result
    
    # Setup cap check to allow publishing
    mock_deps["check_cap"].return_value = True
    
    # Setup publisher to return external_id
    mock_deps["dispatch"].return_value = "fb_post_456"
    
    # Run the job
    await publish_due()
    
    # Verify the publisher was called
    mock_deps["dispatch"].assert_called_once_with(mock_post)
    
    # Verify the post state was updated
    assert mock_post.state == "published"
    assert mock_post.published_at is not None
    assert mock_post.external_id == "fb_post_456"


@pytest.mark.asyncio
async def test_publish_due_skips_cap_exceeded(mock_deps):
    """Post that exceeds platform cap should be skipped."""
    from jobs.publish_due import publish_due
    
    # Create a mock post
    mock_post = MagicMock()
    mock_post.id = "test_post_123"
    mock_post.platform = "facebook"
    mock_post.format = "image"
    mock_post.scheduled_at = datetime.now(timezone.utc) - timedelta(hours=1)
    mock_post.state = "approved"
    
    # Setup the mock query result
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [mock_post]
    mock_deps["session"].execute.return_value = mock_result
    
    # Setup cap check to deny publishing
    mock_deps["check_cap"].return_value = False
    
    # Run the job
    await publish_due()
    
    # Verify the publisher was NOT called
    mock_deps["dispatch"].assert_not_called()


@pytest.mark.asyncio
async def test_publish_due_handles_failure(mock_deps):
    """Failed publish should update post state to 'failed' and notify."""
    from jobs.publish_due import publish_due
    
    # Create a mock post
    mock_post = MagicMock()
    mock_post.id = "test_post_123"
    mock_post.platform = "facebook"
    mock_post.format = "image"
    mock_post.scheduled_at = datetime.now(timezone.utc) - timedelta(hours=1)
    mock_post.state = "approved"
    
    # Setup the mock query result
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [mock_post]
    mock_deps["session"].execute.return_value = mock_result
    
    # Setup cap check to allow publishing
    mock_deps["check_cap"].return_value = True
    
    # Setup publisher to raise an error
    mock_deps["dispatch"].side_effect = ValueError("API rate limit exceeded")
    
    # Run the job
    await publish_due()
    
    # Verify the post state was updated to failed
    assert mock_post.state == "failed"
    assert mock_post.error == "API rate limit exceeded"
    
    # Verify notification was sent
    mock_deps["send"].assert_called_once()
    call_args = mock_deps["send"].call_args[0][0]
    assert "Publish Failed" in call_args
    assert "API rate limit exceeded" in call_args


@pytest.mark.asyncio
async def test_publish_due_no_posts_due(mock_deps):
    """When no posts are due, the job should complete without errors."""
    from jobs.publish_due import publish_due
    
    # Setup the mock query result (empty)
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_deps["session"].execute.return_value = mock_result
    
    # Run the job
    await publish_due()
    
    # Verify no publishing was attempted
    mock_deps["dispatch"].assert_not_called()
    mock_deps["send"].assert_not_called()


@pytest.mark.asyncio
async def test_publish_due_writes_audit_on_success(mock_deps):
    """Successful publish should write an audit log."""
    from jobs.publish_due import publish_due
    
    # Create a mock post
    mock_post = MagicMock()
    mock_post.id = "test_post_123"
    mock_post.platform = "facebook"
    mock_post.format = "image"
    mock_post.scheduled_at = datetime.now(timezone.utc) - timedelta(hours=1)
    mock_post.state = "approved"
    mock_post.render_url = "https://media.yousufliving.com/image.jpg"
    mock_post.caption = "Test caption"
    
    # Setup the mock query result
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [mock_post]
    mock_deps["session"].execute.return_value = mock_result
    
    # Setup cap check to allow publishing
    mock_deps["check_cap"].return_value = True
    
    # Setup publisher to return external_id
    mock_deps["dispatch"].return_value = "fb_post_456"
    
    # Run the job
    await publish_due()

    # Verify audit log was written
    mock_deps["write_audit"].assert_called()
    actor, action, subject_id, payload = mock_deps["write_audit"].call_args[0]
    assert actor == "publish_due"
    assert action == "publish_success"
    assert subject_id == "test_post_123"
    assert payload["platform"] == "facebook"
    assert payload["external_id"] == "fb_post_456"
