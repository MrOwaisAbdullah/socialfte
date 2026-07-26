"""Tests for credential management — Week 3, Step 2.

Verifies is_expiring_soon correctly flags tokens expiring within the threshold.
"""
import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch, MagicMock

# Mock the database module before importing credentials
@pytest.fixture(autouse=True)
def mock_db_session():
    """Mock database session for all tests."""
    with patch("db.credentials.SessionLocal") as mock_session:
        mock_session_instance = AsyncMock()
        mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_session_instance)
        mock_session.return_value.__aexit__ = AsyncMock(return_value=False)
        yield mock_session_instance


@pytest.mark.asyncio
async def test_is_expiring_soon_with_token_expiring_in_5_days(mock_db_session):
    """Token expiring in 5 days should be flagged (threshold is 7 days)."""
    from db.credentials import is_expiring_soon
    
    # Create a mock credential expiring in 5 days
    mock_cred = MagicMock()
    mock_cred.expires_at = datetime.now(timezone.utc) + timedelta(days=5)
    
    # Setup the mock query result
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_cred
    mock_db_session.execute.return_value = mock_result
    
    # Should be flagged as expiring soon
    result = await is_expiring_soon("facebook", days=7)
    assert result is True


@pytest.mark.asyncio
async def test_is_expiring_soon_with_token_expiring_in_10_days(mock_db_session):
    """Token expiring in 10 days should NOT be flagged (threshold is 7 days)."""
    from db.credentials import is_expiring_soon
    
    # Create a mock credential expiring in 10 days
    mock_cred = MagicMock()
    mock_cred.expires_at = datetime.now(timezone.utc) + timedelta(days=10)
    
    # Setup the mock query result
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_cred
    mock_db_session.execute.return_value = mock_result
    
    # Should NOT be flagged
    result = await is_expiring_soon("facebook", days=7)
    assert result is False


@pytest.mark.asyncio
async def test_is_expiring_soon_with_already_expired_token(mock_db_session):
    """Already expired token should be flagged."""
    from db.credentials import is_expiring_soon
    
    # Create a mock credential that expired yesterday
    mock_cred = MagicMock()
    mock_cred.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
    
    # Setup the mock query result
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_cred
    mock_db_session.execute.return_value = mock_result
    
    # Should be flagged
    result = await is_expiring_soon("facebook", days=7)
    assert result is True


@pytest.mark.asyncio
async def test_is_expiring_soon_with_no_credential(mock_db_session):
    """No credential exists should be treated as expired."""
    from db.credentials import is_expiring_soon
    
    # Setup the mock query result (no credential found)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db_session.execute.return_value = mock_result
    
    # Should be flagged
    result = await is_expiring_soon("facebook", days=7)
    assert result is True


@pytest.mark.asyncio
async def test_is_expiring_soon_with_no_expiry(mock_db_session):
    """Token with no expiry (None) should NOT be flagged."""
    from db.credentials import is_expiring_soon
    
    # Create a mock credential with no expiry
    mock_cred = MagicMock()
    mock_cred.expires_at = None
    
    # Setup the mock query result
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_cred
    mock_db_session.execute.return_value = mock_result
    
    # Should NOT be flagged
    result = await is_expiring_soon("youtube_shorts", days=7)
    assert result is False


@pytest.mark.asyncio
async def test_is_expiring_soon_custom_threshold(mock_db_session):
    """Custom threshold (days=3) should work correctly."""
    from db.credentials import is_expiring_soon
    
    # Create a mock credential expiring in 5 days
    mock_cred = MagicMock()
    mock_cred.expires_at = datetime.now(timezone.utc) + timedelta(days=5)
    
    # Setup the mock query result
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_cred
    mock_db_session.execute.return_value = mock_result
    
    # With 3-day threshold, 5 days should NOT be flagged
    result = await is_expiring_soon("facebook", days=3)
    assert result is False
    
    # With 7-day threshold, 5 days SHOULD be flagged
    result = await is_expiring_soon("facebook", days=7)
    assert result is True
