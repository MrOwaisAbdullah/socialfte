"""Tests for YouTube publisher — Week 3, Step 5.

Verifies #Shorts addition and privacy read from env var.
"""
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock


def test_get_creds_raises_normal_exception_not_systemexit(tmp_path):
    """get_creds() must raise a real Exception, not call sys.exit(), when
    client_secret.json is missing. sys.exit() raises SystemExit, a
    BaseException, which is NOT caught by publish_due.py's `except
    Exception` — confirmed live: a YouTube post with no client_secret
    crashed the entire publish_due job instead of just failing that one
    post, permanently wedging every post queued after it (the crashed post
    never reached state='failed', so the next run hit the same post and
    crashed again)."""
    from publishers import youtube

    missing_secret = tmp_path / "client_secret.json"
    missing_token = tmp_path / "token.json"
    assert not missing_secret.exists()

    with patch.object(youtube, "CLIENT_SECRET", missing_secret), \
         patch.object(youtube, "TOKEN", missing_token):
        with pytest.raises(Exception) as exc_info:
            youtube.get_creds()
        assert not isinstance(exc_info.value, SystemExit)
        assert "client_secret.json" in str(exc_info.value)


def test_build_body_adds_shorts_tag():
    """build_body should add #Shorts to description if not present."""
    from publishers.youtube import build_body
    
    plan = {
        "title": "Test Video",
        "description": "This is a test video description.",
        "tags": ["furniture", "karachi"],
    }
    
    body = build_body(plan)
    
    assert "#Shorts" in body["snippet"]["description"]
    assert body["snippet"]["description"].endswith("#Shorts")


def test_build_body_does_not_duplicate_shorts():
    """build_body should not add #Shorts if already present."""
    from publishers.youtube import build_body
    
    plan = {
        "title": "Test Video",
        "description": "This is a test video with #Shorts already.",
        "tags": ["furniture"],
    }
    
    body = build_body(plan)
    
    # Should only have one #Shorts
    assert body["snippet"]["description"].count("#Shorts") == 1


def test_build_body_empty_description():
    """build_body should handle empty description gracefully."""
    from publishers.youtube import build_body
    
    plan = {
        "title": "Test Video",
        "description": "",
        "tags": [],
    }
    
    body = build_body(plan)
    
    assert body["snippet"]["description"] == "#Shorts"


def test_build_body_no_description():
    """build_body should handle missing description key."""
    from publishers.youtube import build_body
    
    plan = {
        "title": "Test Video",
        "tags": [],
    }
    
    body = build_body(plan)
    
    assert body["snippet"]["description"] == "#Shorts"


def test_build_body_privacy_from_env():
    """build_body should read privacy from settings when not in plan."""
    from publishers.youtube import build_body
    
    plan = {
        "title": "Test Video",
        "description": "Test",
        "tags": [],
    }
    
    # Mock the settings to return a specific privacy setting
    with patch("publishers.youtube.settings") as mock_settings:
        mock_settings.YOUTUBE_PRIVACY_ON_UPLOAD = "private"
        mock_settings.YOUTUBE_DEFAULT_CATEGORY = 26
        
        body = build_body(plan)
        
        assert body["status"]["privacyStatus"] == "private"


def test_build_body_privacy_override():
    """build_body should use plan privacy if provided."""
    from publishers.youtube import build_body
    
    plan = {
        "title": "Test Video",
        "description": "Test",
        "tags": [],
        "privacy": "unlisted",
    }
    
    with patch("publishers.youtube.settings") as mock_settings:
        mock_settings.YOUTUBE_PRIVACY_ON_UPLOAD = "private"
        mock_settings.YOUTUBE_DEFAULT_CATEGORY = 26
        
        body = build_body(plan)
        
        # Plan privacy should override env setting
        assert body["status"]["privacyStatus"] == "unlisted"


def test_build_body_category_from_settings():
    """build_body should use category from settings."""
    from publishers.youtube import build_body
    
    plan = {
        "title": "Test Video",
        "description": "Test",
        "tags": [],
    }
    
    with patch("publishers.youtube.settings") as mock_settings:
        mock_settings.YOUTUBE_PRIVACY_ON_UPLOAD = "private"
        mock_settings.YOUTUBE_DEFAULT_CATEGORY = 28  # Science & Technology
        
        body = build_body(plan)
        
        assert body["snippet"]["categoryId"] == "28"


def test_validate_missing_video():
    """validate should reject plans without a video."""
    from publishers.youtube import validate
    
    plan = {
        "title": "Test Video",
        "description": "Test",
    }
    
    errs = validate(plan)
    
    assert any("plan.video is required" in e for e in errs)


def test_validate_missing_title():
    """validate should reject plans without a title."""
    from publishers.youtube import validate
    
    plan = {
        "video": "some_video.mp4",
        "description": "Test",
    }
    
    errs = validate(plan)
    
    assert any("plan.title is required" in e for e in errs)


def test_validate_title_too_long():
    """validate should reject titles over 100 chars."""
    from publishers.youtube import validate
    
    plan = {
        "title": "x" * 101,
        "video": "some_video.mp4",
        "description": "Test",
    }
    
    errs = validate(plan)
    
    assert any("chars (max 100)" in e for e in errs)


def test_validate_description_too_long():
    """validate should reject descriptions over 5000 chars."""
    from publishers.youtube import validate
    
    plan = {
        "title": "Test Video",
        "video": "some_video.mp4",
        "description": "x" * 5001,
    }
    
    errs = validate(plan)
    
    assert any("chars (max 5000)" in e for e in errs)
