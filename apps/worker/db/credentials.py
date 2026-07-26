"""Credential management — Week 3, Step 2.

Functions for token storage and expiry checking.
Drives AGENTS.md's token-refresh rule: never publish with < 7 days until expiry.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Credential
from db.session import SessionLocal
from config import settings


async def get_token(platform: str) -> Optional[dict]:
    """Get the current token for a platform.
    
    Args:
        platform: Platform name (facebook, instagram, youtube_shorts, tiktok)
    
    Returns:
        Dict with access_token, refresh_token, expires_at, meta or None if not found
    """
    async with SessionLocal() as session:
        result = await session.execute(
            select(Credential).where(Credential.platform == platform)
        )
        cred = result.scalar_one_or_none()
        if not cred:
            return None
        return {
            "platform": cred.platform,
            "access_token": cred.access_token,
            "refresh_token": cred.refresh_token,
            "expires_at": cred.expires_at,
            "meta": cred.meta,
        }


async def save_token(
    platform: str,
    access_token: str,
    refresh_token: Optional[str] = None,
    expires_at: Optional[datetime] = None,
    meta: Optional[dict] = None,
) -> Credential:
    """Save or update a platform token.
    
    Args:
        platform: Platform name (facebook, instagram, youtube_shorts, tiktok)
        access_token: The access token to store
        refresh_token: Optional refresh token for token refresh flow
        expires_at: When the token expires (None = never expires)
        meta: Optional platform-specific metadata (page_id, ig_user_id, etc.)
    
    Returns:
        The saved Credential object
    """
    async with SessionLocal() as session:
        result = await session.execute(
            select(Credential).where(Credential.platform == platform)
        )
        cred = result.scalar_one_or_none()
        
        if cred:
            # Update existing credential
            cred.access_token = access_token
            if refresh_token is not None:
                cred.refresh_token = refresh_token
            if expires_at is not None:
                cred.expires_at = expires_at
            if meta is not None:
                cred.meta = meta
            cred.updated_at = datetime.now(timezone.utc)
        else:
            # Create new credential
            cred = Credential(
                platform=platform,
                access_token=access_token,
                refresh_token=refresh_token,
                expires_at=expires_at,
                meta=meta,
            )
            session.add(cred)
        
        await session.commit()
        await session.refresh(cred)
        return cred


async def is_expiring_soon(platform: str, days: int = 7) -> bool:
    """Check if a platform token is expiring within the given number of days.
    
    Args:
        platform: Platform name to check
        days: Number of days to check (default: 7, from META_TOKEN_REFRESH_DAYS)
    
    Returns:
        True if token expires within `days` days or is already expired
    """
    async with SessionLocal() as session:
        result = await session.execute(
            select(Credential).where(Credential.platform == platform)
        )
        cred = result.scalar_one_or_none()
        
        if not cred:
            # No credential exists — consider it expired
            return True
        
        if cred.expires_at is None:
            # Token has no expiry (e.g., YouTube token, system-user token)
            return False
        
        # Check if expiry is within the threshold
        now = datetime.now(timezone.utc)
        threshold = now + timedelta(days=days)
        return cred.expires_at <= threshold


async def get_all_credentials() -> list[dict]:
    """Get all platform credentials.
    
    Returns:
        List of credential dicts for all platforms
    """
    async with SessionLocal() as session:
        result = await session.execute(select(Credential))
        creds = result.scalars().all()
        return [
            {
                "platform": cred.platform,
                "access_token": cred.access_token,
                "refresh_token": cred.refresh_token,
                "expires_at": cred.expires_at,
                "meta": cred.meta,
            }
            for cred in creds
        ]
