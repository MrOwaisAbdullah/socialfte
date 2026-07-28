"""Tests for token refresh cron — Week 3, Step 3.

Verifies refresh_tokens job calls the refresh endpoint when token is expiring.
"""
import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch, MagicMock
import httpx


@pytest.fixture(autouse=True)
def mock_deps():
    """Mock all dependencies for refresh_tokens tests."""
    with patch("jobs.refresh_tokens.write_audit", new_callable=AsyncMock) as mock_write_audit, \
         patch("jobs.refresh_tokens.save_token") as mock_save, \
         patch("jobs.refresh_tokens.is_expiring_soon") as mock_expiring, \
         patch("jobs.refresh_tokens.get_all_credentials") as mock_get_creds, \
         patch("jobs.refresh_tokens.notify_token_refresh_failure") as mock_notify, \
         patch("jobs.refresh_tokens.settings") as mock_settings:

        # Isolate from real environment — these tests must pass with no .env present
        mock_settings.META_APP_ID = "test_app_id"
        mock_settings.META_APP_SECRET = "test_app_secret"
        mock_settings.META_GRAPH_VERSION = "v25.0"
        mock_settings.META_TOKEN_REFRESH_DAYS = 7
        mock_settings.TIKTOK_CLIENT_KEY = "test_client_key"
        mock_settings.TIKTOK_CLIENT_SECRET = "test_client_secret"

        yield {
            "write_audit": mock_write_audit,
            "save_token": mock_save,
            "is_expiring_soon": mock_expiring,
            "get_all_credentials": mock_get_creds,
            "notify_token_refresh_failure": mock_notify,
            "settings": mock_settings,
        }


@pytest.mark.asyncio
async def test_refresh_tokens_calls_meta_endpoint(mock_deps):
    """When a Facebook token is expiring, refresh_tokens should call the Meta endpoint."""
    from jobs.refresh_tokens import refresh_tokens
    
    # Setup: one credential expiring in 3 days
    mock_cred = {
        "platform": "facebook",
        "access_token": "old_token",
        "refresh_token": None,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=3),
        "meta": {"page_id": "123456"},
    }
    mock_deps["get_all_credentials"].return_value = [mock_cred]
    mock_deps["is_expiring_soon"].return_value = True
    
    # Mock the Meta refresh endpoint response
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"access_token": "new_long_lived_token", "token_type": "bearer", "expires_in": 5184000}
    mock_response.raise_for_status = MagicMock()
    
    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_response
        
        # Run the job
        await refresh_tokens()
        
        # Verify the endpoint was called with correct params
        mock_get.assert_called_once()
        call_args = mock_get.call_args
        assert "oauth/access_token" in call_args[0][0]
        assert call_args[1]["params"]["grant_type"] == "fb_exchange_token"
        assert call_args[1]["params"]["client_id"] != ""
        assert call_args[1]["params"]["fb_exchange_token"] == "old_token"


@pytest.mark.asyncio
async def test_refresh_tokens_saves_new_token(mock_deps):
    """When refresh succeeds, the new token should be saved."""
    from jobs.refresh_tokens import refresh_tokens
    
    # Setup: one credential expiring in 3 days
    mock_cred = {
        "platform": "facebook",
        "access_token": "old_token",
        "refresh_token": None,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=3),
        "meta": {"page_id": "123456"},
    }
    mock_deps["get_all_credentials"].return_value = [mock_cred]
    mock_deps["is_expiring_soon"].return_value = True
    
    # Mock the Meta refresh endpoint response
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"access_token": "new_long_lived_token", "expires_in": 5184000}
    mock_response.raise_for_status = MagicMock()
    
    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_response
        
        # Run the job
        await refresh_tokens()
        
        # Verify save_token was called with new token
        mock_deps["save_token"].assert_called_once()
        call_kwargs = mock_deps["save_token"].call_args[1]
        assert call_kwargs["platform"] == "facebook"
        assert call_kwargs["access_token"] == "new_long_lived_token"
        assert call_kwargs["expires_at"] > datetime.now(timezone.utc)


@pytest.mark.asyncio
async def test_refresh_tokens_notifies_on_failure(mock_deps):
    """When refresh fails, a URGENT notification should be sent."""
    from jobs.refresh_tokens import refresh_tokens
    
    # Setup: one credential expiring in 3 days
    mock_cred = {
        "platform": "facebook",
        "access_token": "old_token",
        "refresh_token": None,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=3),
        "meta": {"page_id": "123456"},
    }
    mock_deps["get_all_credentials"].return_value = [mock_cred]
    mock_deps["is_expiring_soon"].return_value = True
    
    # Mock the Meta refresh endpoint to fail
    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.side_effect = httpx.HTTPStatusError(
            message="Bad Request",
            request=MagicMock(),
            response=MagicMock(status_code=400, text="Invalid token"),
        )
        
        # Run the job
        await refresh_tokens()
        
        # Verify notification was sent
        mock_deps["notify_token_refresh_failure"].assert_called_once_with(
            "facebook",
            mock_cred["expires_at"],
        )


@pytest.mark.asyncio
async def test_refresh_tokens_skips_non_expiring(mock_deps):
    """Tokens not expiring soon should be skipped."""
    from jobs.refresh_tokens import refresh_tokens
    
    # Setup: one credential NOT expiring soon
    mock_cred = {
        "platform": "facebook",
        "access_token": "valid_token",
        "refresh_token": None,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=30),
        "meta": {"page_id": "123456"},
    }
    mock_deps["get_all_credentials"].return_value = [mock_cred]
    mock_deps["is_expiring_soon"].return_value = False
    
    # Run the job
    await refresh_tokens()
    
    # Verify no refresh was attempted
    mock_deps["save_token"].assert_not_called()
    mock_deps["notify_token_refresh_failure"].assert_not_called()
