"""Meta publisher — Week 3, Step 4.

Facebook Page + Instagram publishing via Graph API (version pinned by META_GRAPH_VERSION).
Every function writes an audit_log row on success and on failure.
Does NOT catch exceptions silently — let them bubble (caller handles state).
"""
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx

from audit import write_audit
from config import settings

logger = logging.getLogger("worker.meta")

GRAPH_API = f"https://graph.facebook.com/{settings.META_GRAPH_VERSION}"


async def _get_page_token() -> str:
    """Get the Facebook Page token from config or credentials."""
    if settings.META_PAGE_TOKEN:
        return settings.META_PAGE_TOKEN
    
    # Fallback: try to get from credentials table
    from db.credentials import get_token
    cred = await get_token("facebook")
    if cred and cred.get("access_token"):
        return cred["access_token"]
    
    raise ValueError("META_PAGE_TOKEN not configured and no facebook credential found")


async def _write_audit(actor: str, action: str, subject_id: str, payload: dict):
    """Write an audit_log row."""
    await write_audit(actor, action, subject_id, payload)


async def post_image(page_id: str, image_url: str, caption: str) -> str:
    """Post an image to a Facebook Page.
    
    Args:
        page_id: Facebook Page ID
        image_url: Public URL of the image (R2 public URL)
        caption: Post caption text
    
    Returns:
        The Facebook post ID (external_id)
    
    Raises:
        httpx.HTTPStatusError: If the API call fails
    """
    token = await _get_page_token()
    
    try:
        async with httpx.AsyncClient() as client:
            # Step 1: Create the photo container
            container_response = await client.post(
                f"{GRAPH_API}/{page_id}/photos",
                data={
                    "url": image_url,
                    "caption": caption,
                    "access_token": token,
                },
                timeout=60.0,
            )
            container_response.raise_for_status()
            container_data = container_response.json()
            container_id = container_data.get("id")
            
            if not container_id:
                raise ValueError(f"No container ID returned: {container_data}")
            
            # Step 2: Publish the container
            publish_response = await client.post(
                f"{GRAPH_API}/{page_id}/photos",
                data={
                    "published": "true",
                    "id": container_id,
                    "access_token": token,
                },
                timeout=60.0,
            )
            publish_response.raise_for_status()
            publish_data = publish_response.json()
            
            post_id = publish_data.get("id", container_id)
            
            # Write audit log
            await _write_audit(
                actor="meta_publisher",
                action="post_image_success",
                subject_id=post_id,
                payload={
                    "page_id": page_id,
                    "image_url": image_url,
                    "caption_length": len(caption),
                    "platform": "facebook",
                },
            )
            
            logger.info("Posted image to Facebook page %s: %s", page_id, post_id)
            return post_id
    
    except Exception as e:
        # Write audit log on failure
        await _write_audit(
            actor="meta_publisher",
            action="post_image_failed",
            subject_id=page_id,
            payload={
                "page_id": page_id,
                "image_url": image_url,
                "error": str(e),
                "platform": "facebook",
            },
        )
        raise


async def post_reel(page_id: str, video_url: str, caption: str) -> str:
    """Post a reel/video to a Facebook Page.

    Facebook Page Reels use the dedicated /{page-id}/video_reels edge (start ->
    upload -> finish), not the generic /{page-id}/videos endpoint — that endpoint
    accepts the upload but the result lands as a regular video, not a Reel.

    Args:
        page_id: Facebook Page ID
        video_url: Public URL of the video (R2 public URL)
        caption: Post caption text

    Returns:
        The Facebook video ID (external_id)

    Raises:
        httpx.HTTPStatusError: If the API call fails
    """
    token = await _get_page_token()

    try:
        async with httpx.AsyncClient() as client:
            # Step 1: Start the upload session — returns a video_id + upload_url
            start_response = await client.post(
                f"{GRAPH_API}/{page_id}/video_reels",
                json={
                    "upload_phase": "start",
                    "access_token": token,
                },
                timeout=60.0,
            )
            start_response.raise_for_status()
            start_data = start_response.json()
            video_id = start_data.get("video_id")
            upload_url = start_data.get("upload_url")

            if not video_id or not upload_url:
                raise ValueError(f"No video_id/upload_url returned: {start_data}")

            # Step 2: Upload the video. The upload_url host is rupload.facebook.com,
            # not graph.facebook.com. Pointing it at our public R2 URL via the
            # file_url header lets Meta's servers pull the bytes directly instead
            # of us downloading and re-uploading them.
            upload_response = await client.post(
                upload_url,
                headers={
                    "Authorization": f"OAuth {token}",
                    "file_url": video_url,
                },
                timeout=300.0,  # 5 minutes for large videos
            )
            upload_response.raise_for_status()

            # Step 3: Finish the session — publishes the Reel with caption
            finish_response = await client.post(
                f"{GRAPH_API}/{page_id}/video_reels",
                json={
                    "upload_phase": "finish",
                    "video_id": video_id,
                    "video_state": "PUBLISHED",
                    "description": caption,
                    "access_token": token,
                },
                timeout=60.0,
            )
            finish_response.raise_for_status()
            
            # Write audit log
            await _write_audit(
                actor="meta_publisher",
                action="post_reel_success",
                subject_id=video_id,
                payload={
                    "page_id": page_id,
                    "video_url": video_url,
                    "caption_length": len(caption),
                    "platform": "facebook",
                },
            )
            
            logger.info("Posted reel to Facebook page %s: %s", page_id, video_id)
            return video_id
    
    except Exception as e:
        # Write audit log on failure
        await _write_audit(
            actor="meta_publisher",
            action="post_reel_failed",
            subject_id=page_id,
            payload={
                "page_id": page_id,
                "video_url": video_url,
                "error": str(e),
                "platform": "facebook",
            },
        )
        raise


async def post_ig_image(ig_user_id: str, image_url: str, caption: str) -> str:
    """Post an image to Instagram.
    
    Instagram image publishing requires a two-step flow:
    1. Create a container (POST /{ig-user-id}/media)
    2. Publish the container (POST /{ig-user-id}/media_publish)
    
    Args:
        ig_user_id: Instagram Business Account ID
        image_url: Public URL of the image (R2 public URL)
        caption: Post caption text
    
    Returns:
        The Instagram media ID (external_id)
    
    Raises:
        httpx.HTTPStatusError: If the API call fails
    """
    token = await _get_page_token()
    
    try:
        async with httpx.AsyncClient() as client:
            # Step 1: Create the container
            container_response = await client.post(
                f"{GRAPH_API}/{ig_user_id}/media",
                data={
                    "image_url": image_url,
                    "caption": caption,
                    "access_token": token,
                },
                timeout=60.0,
            )
            container_response.raise_for_status()
            container_data = container_response.json()
            container_id = container_data.get("id")
            
            if not container_id:
                raise ValueError(f"No container ID returned: {container_data}")
            
            # Step 2: Wait for container to be ready (poll status)
            max_retries = 30
            for i in range(max_retries):
                status_response = await client.get(
                    f"{GRAPH_API}/{container_id}",
                    params={
                        "fields": "status_code",
                        "access_token": token,
                    },
                    timeout=30.0,
                )
                status_response.raise_for_status()
                status_data = status_response.json()
                
                if status_data.get("status_code") == "FINISHED":
                    break
                elif status_data.get("status_code") == "ERROR":
                    raise ValueError(f"Container processing failed: {status_data}")
                
                # Wait before next poll
                import asyncio
                await asyncio.sleep(2)
            else:
                raise ValueError(f"Container not ready after {max_retries} retries")
            
            # Step 3: Publish the container
            publish_response = await client.post(
                f"{GRAPH_API}/{ig_user_id}/media_publish",
                data={
                    "creation_id": container_id,
                    "access_token": token,
                },
                timeout=60.0,
            )
            publish_response.raise_for_status()
            publish_data = publish_response.json()
            
            post_id = publish_data.get("id", container_id)
            
            # Write audit log
            await _write_audit(
                actor="meta_publisher",
                action="post_ig_image_success",
                subject_id=post_id,
                payload={
                    "ig_user_id": ig_user_id,
                    "image_url": image_url,
                    "caption_length": len(caption),
                    "platform": "instagram",
                },
            )
            
            logger.info("Posted image to Instagram %s: %s", ig_user_id, post_id)
            return post_id
    
    except Exception as e:
        # Write audit log on failure
        await _write_audit(
            actor="meta_publisher",
            action="post_ig_image_failed",
            subject_id=ig_user_id,
            payload={
                "ig_user_id": ig_user_id,
                "image_url": image_url,
                "error": str(e),
                "platform": "instagram",
            },
        )
        raise


async def post_ig_reel(ig_user_id: str, video_url: str, caption: str) -> str:
    """Post a reel/video to Instagram.
    
    Instagram reel publishing requires:
    1. Create a container (POST /{ig-user-id}/media with media_type=REELS)
    2. Wait for container to be ready
    3. Publish the container
    
    Args:
        ig_user_id: Instagram Business Account ID
        video_url: Public URL of the video (R2 public URL)
        caption: Post caption text
    
    Returns:
        The Instagram media ID (external_id)
    
    Raises:
        httpx.HTTPStatusError: If the API call fails
    """
    token = await _get_page_token()
    
    try:
        async with httpx.AsyncClient() as client:
            # Step 1: Create the container for reels
            container_response = await client.post(
                f"{GRAPH_API}/{ig_user_id}/media",
                data={
                    "media_type": "REELS",
                    "video_url": video_url,
                    "caption": caption,
                    "share_to_feed": "false",
                    "access_token": token,
                },
                timeout=60.0,
            )
            container_response.raise_for_status()
            container_data = container_response.json()
            container_id = container_data.get("id")
            
            if not container_id:
                raise ValueError(f"No container ID returned: {container_data}")
            
            # Step 2: Wait for container to be ready (poll status)
            max_retries = 60  # Reels take longer to process
            for i in range(max_retries):
                status_response = await client.get(
                    f"{GRAPH_API}/{container_id}",
                    params={
                        "fields": "status_code",
                        "access_token": token,
                    },
                    timeout=30.0,
                )
                status_response.raise_for_status()
                status_data = status_response.json()
                
                if status_data.get("status_code") == "FINISHED":
                    break
                elif status_data.get("status_code") == "ERROR":
                    raise ValueError(f"Container processing failed: {status_data}")
                
                # Wait before next poll
                import asyncio
                await asyncio.sleep(5)  # Reels need more time
            else:
                raise ValueError(f"Container not ready after {max_retries} retries")
            
            # Step 3: Publish the container
            publish_response = await client.post(
                f"{GRAPH_API}/{ig_user_id}/media_publish",
                data={
                    "creation_id": container_id,
                    "access_token": token,
                },
                timeout=60.0,
            )
            publish_response.raise_for_status()
            publish_data = publish_response.json()
            
            post_id = publish_data.get("id", container_id)
            
            # Write audit log
            await _write_audit(
                actor="meta_publisher",
                action="post_ig_reel_success",
                subject_id=post_id,
                payload={
                    "ig_user_id": ig_user_id,
                    "video_url": video_url,
                    "caption_length": len(caption),
                    "platform": "instagram",
                },
            )
            
            logger.info("Posted reel to Instagram %s: %s", ig_user_id, post_id)
            return post_id
    
    except Exception as e:
        # Write audit log on failure
        await _write_audit(
            actor="meta_publisher",
            action="post_ig_reel_failed",
            subject_id=ig_user_id,
            payload={
                "ig_user_id": ig_user_id,
                "video_url": video_url,
                "error": str(e),
                "platform": "instagram",
            },
        )
        raise


async def post_story(ig_user_id: str, image_url: str) -> str:
    """Post a story to Instagram.
    
    Stories expire after 24 hours automatically.
    
    Args:
        ig_user_id: Instagram Business Account ID
        image_url: Public URL of the image (R2 public URL)
    
    Returns:
        The Instagram media ID (external_id)
    
    Raises:
        httpx.HTTPStatusError: If the API call fails
    """
    token = await _get_page_token()
    
    try:
        async with httpx.AsyncClient() as client:
            # Create the story container
            container_response = await client.post(
                f"{GRAPH_API}/{ig_user_id}/media",
                data={
                    "media_type": "STORIES",
                    "image_url": image_url,
                    "access_token": token,
                },
                timeout=60.0,
            )
            container_response.raise_for_status()
            container_data = container_response.json()
            container_id = container_data.get("id")
            
            if not container_id:
                raise ValueError(f"No container ID returned: {container_data}")
            
            # Publish the story
            publish_response = await client.post(
                f"{GRAPH_API}/{ig_user_id}/media_publish",
                data={
                    "creation_id": container_id,
                    "access_token": token,
                },
                timeout=60.0,
            )
            publish_response.raise_for_status()
            publish_data = publish_response.json()
            
            story_id = publish_data.get("id", container_id)
            
            # Write audit log
            await _write_audit(
                actor="meta_publisher",
                action="post_story_success",
                subject_id=story_id,
                payload={
                    "ig_user_id": ig_user_id,
                    "image_url": image_url,
                    "platform": "instagram",
                    "format": "story",
                },
            )
            
            logger.info("Posted story to Instagram %s: %s", ig_user_id, story_id)
            return story_id
    
    except Exception as e:
        # Write audit log on failure
        await _write_audit(
            actor="meta_publisher",
            action="post_story_failed",
            subject_id=ig_user_id,
            payload={
                "ig_user_id": ig_user_id,
                "image_url": image_url,
                "error": str(e),
                "platform": "instagram",
                "format": "story",
            },
        )
        raise
