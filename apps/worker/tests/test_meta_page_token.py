"""Tests for publishers.meta._get_page_token()'s page-scoped-token derivation.

Separate from test_meta.py because that file's autouse fixture mocks
_get_page_token() away entirely for every test — these need the real
implementation.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_get_page_token_derives_page_scoped_token():
    """A System User (or regular User) token is not itself valid for
    posting to /{page-id}/photos — Graph API needs the derived
    PAGE-scoped token. Confirmed live: pasting the System User's own
    token into META_PAGE_TOKEN made every publish attempt fail with a 403
    "(#200) publish_actions... deprecated" error. _get_page_token() must
    call GET /{page-id}?fields=access_token and return the derived token,
    not the raw configured one."""
    from publishers.meta import _get_page_token

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {"access_token": "derived_page_scoped_token"}

    with patch("publishers.meta.settings.META_PAGE_TOKEN", "raw_system_user_token"), \
         patch("publishers.meta.settings.META_PAGE_ID", "page_123"), \
         patch("httpx.AsyncClient.get", new_callable=AsyncMock, return_value=mock_response):
        token = await _get_page_token()

    assert token == "derived_page_scoped_token"
    assert token != "raw_system_user_token"


@pytest.mark.asyncio
async def test_get_page_token_falls_back_when_derivation_fails():
    """If the derivation call itself fails (e.g. the configured token is
    already page-scoped, which doesn't support this same derivation),
    fall back to using the configured token as-is rather than hard-failing
    every publish attempt."""
    from publishers.meta import _get_page_token

    with patch("publishers.meta.settings.META_PAGE_TOKEN", "already_page_scoped_token"), \
         patch("publishers.meta.settings.META_PAGE_ID", "page_123"), \
         patch("httpx.AsyncClient.get", new_callable=AsyncMock, side_effect=Exception("boom")):
        token = await _get_page_token()

    assert token == "already_page_scoped_token"


@pytest.mark.asyncio
async def test_get_page_token_raises_without_any_token():
    from publishers.meta import _get_page_token

    with patch("publishers.meta.settings.META_PAGE_TOKEN", ""), \
         patch("db.credentials.get_token", new_callable=AsyncMock, return_value=None):
        with pytest.raises(ValueError, match="META_PAGE_TOKEN not configured"):
            await _get_page_token()
