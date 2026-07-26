"""Tests for notify review job — Week 3, Step 9.

Verifies batch limit of 10 and summary card for >10 posts.
"""
import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch, MagicMock


def _make_post(i: int) -> MagicMock:
    post = MagicMock()
    post.id = f"post_{i}"
    post.platform = "facebook"
    post.format = "image"
    post.scheduled_at = datetime.now(timezone.utc) + timedelta(hours=i)
    post.state = "review"
    return post


@pytest.fixture(autouse=True)
def mock_deps():
    """Mock all dependencies for notify_review tests."""
    with patch("jobs.notify_review.SessionLocal") as mock_session, \
         patch("jobs.notify_review.send", new_callable=AsyncMock) as mock_send, \
         patch("jobs.notify_review.send_approval", new_callable=AsyncMock) as mock_send_approval:

        mock_session_instance = AsyncMock()
        mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_session_instance)
        mock_session.return_value.__aexit__ = AsyncMock(return_value=False)

        yield {
            "session": mock_session_instance,
            "send": mock_send,
            "send_approval": mock_send_approval,
        }


@pytest.mark.asyncio
async def test_notify_review_no_posts(mock_deps):
    """When no posts are pending review, no cards should be sent."""
    from jobs.notify_review import notify_review

    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_deps["session"].execute.return_value = mock_result

    await notify_review()

    mock_deps["send"].assert_not_called()
    mock_deps["send_approval"].assert_not_called()


@pytest.mark.asyncio
async def test_notify_review_under_batch_limit_no_summary(mock_deps):
    """5 posts (under the 10 batch limit) should send 5 cards and no summary."""
    from jobs.notify_review import notify_review

    posts = [_make_post(i) for i in range(5)]
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = posts
    mock_deps["session"].execute.return_value = mock_result

    await notify_review()

    mock_deps["send"].assert_not_called()
    assert mock_deps["send_approval"].call_count == 5


@pytest.mark.asyncio
async def test_notify_review_over_batch_limit_sends_summary_and_ten_cards(mock_deps):
    """15 posts (over the 10 batch limit) should send one summary + 10 cards."""
    from jobs.notify_review import notify_review

    posts = [_make_post(i) for i in range(15)]
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = posts
    mock_deps["session"].execute.return_value = mock_result

    await notify_review()

    mock_deps["send"].assert_called_once()
    summary_text = mock_deps["send"].call_args[0][0]
    assert "15" in summary_text
    assert "10" in summary_text

    assert mock_deps["send_approval"].call_count == 10


@pytest.mark.asyncio
async def test_notify_review_writes_audit_per_card(mock_deps):
    """Each sent approval card should write an audit_log row."""
    from jobs.notify_review import notify_review

    posts = [_make_post(0)]
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = posts
    mock_deps["session"].execute.return_value = mock_result

    await notify_review()

    mock_deps["session"].add.assert_called()
    audit_call = mock_deps["session"].add.call_args[0][0]
    assert audit_call.actor == "notify_review"
    assert audit_call.action == "approval_card_sent"
    assert audit_call.subject_id == "post_0"
