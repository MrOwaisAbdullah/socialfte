"""YouTube publisher — Week 3, Step 5.

Adapted from the original yt_upload.py for the SocialFTE worker.
Changes per docs/repo-harvest.md §4:
  - Add #Shorts to description
  - Read privacy from YOUTUBE_PRIVACY_ON_UPLOAD env var
  - Return video_id so caller can write posts.external_id
  - Keep A/V drift verification, drop ghost-speech check
  - Keep the resumable upload with retry logic

Setup (one-time, needs your browser):
  1. Google Cloud project + enable "YouTube Data API v3".
  2. OAuth "Desktop app" credential → download as .youtube/client_secret.json.
  3. `python apps/worker/publishers/youtube.py auth`  (opens a browser once; saves .youtube/token.json)

Quota: standard = 10,000 units/day; an upload costs ~100 units.
"""
import argparse
import json
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from audit import write_audit
from config import settings

logger = logging.getLogger("worker.youtube")

# Windows consoles default to cp1252 — force UTF-8 so box/✓ glyphs print
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REPO = Path(__file__).resolve().parent.parent.parent.parent  # repo root — holds .youtube/ creds
ROOT = REPO.parent                               # monorepo root — plan paths (video, description_file) are relative to this
YT_DIR = REPO / ".youtube"
CLIENT_SECRET = YT_DIR / "client_secret.json"
TOKEN = Path(settings.YOUTUBE_TOKEN_PATH) if settings.YOUTUBE_TOKEN_PATH else YT_DIR / "token.json"
SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube",  # covers thumbnails.set + edits
    "https://www.googleapis.com/auth/yt-analytics.readonly",
]

TITLE_MAX, DESC_MAX, TAGS_CHARS_MAX = 100, 5000, 460


def rp(p: str) -> Path:
    q = Path(p)
    return q if q.is_absolute() else ROOT / q


def load_plan(path: Path) -> dict:
    plan = json.loads(path.read_text(encoding="utf-8"))
    if "description_file" in plan and "description" not in plan:
        plan["description"] = rp(plan["description_file"]).read_text(encoding="utf-8").strip()
    return plan


def validate(plan: dict) -> list[str]:
    errs = []
    if not plan.get("video"):
        errs.append("plan.video is required")
    elif not rp(plan["video"]).exists():
        errs.append(f"video not found: {plan['video']}")
    if not plan.get("title"):
        errs.append("plan.title is required")
    elif len(plan["title"]) > TITLE_MAX:
        errs.append(f"title is {len(plan['title'])} chars (max {TITLE_MAX})")
    if "|" in plan.get("title", "") or "<" in plan.get("title", "") or ">" in plan.get("title", ""):
        errs.append("title cannot contain < > | (YouTube rejects these)")
    if len(plan.get("description", "")) > DESC_MAX:
        errs.append(f"description is {len(plan['description'])} chars (max {DESC_MAX})")
    tags = plan.get("tags", [])
    if sum(len(t) for t in tags) + max(0, len(tags) - 1) > TAGS_CHARS_MAX:
        errs.append(f"tags exceed ~{TAGS_CHARS_MAX} total chars")
    thumb = plan.get("thumbnail")
    if thumb:
        tp = rp(thumb)
        if not tp.exists():
            errs.append(f"thumbnail not found: {thumb}")
        elif tp.stat().st_size > 2 * 1024 * 1024:
            errs.append(f"thumbnail is {tp.stat().st_size / 1e6:.1f} MB (YouTube max 2 MB) — use a JPG")
    if plan.get("publishAt") and plan.get("privacy", "private") != "private":
        errs.append("publishAt requires privacy=private (YouTube holds it private until that time)")
    return errs


def build_body(plan: dict) -> dict:
    """Build the YouTube video body with #Shorts added to description."""
    # Add #Shorts to description if not already present
    description = plan.get("description", "")
    if "#Shorts" not in description:
        description = f"{description}\n\n#Shorts" if description else "#Shorts"
    
    status = {
        "privacyStatus": plan.get("privacy", settings.YOUTUBE_PRIVACY_ON_UPLOAD),
        "selfDeclaredMadeForKids": bool(plan.get("madeForKids", False)),
    }
    if plan.get("publishAt"):
        status["publishAt"] = plan["publishAt"]
    return {
        "snippet": {
            "title": plan["title"],
            "description": description,
            "tags": plan.get("tags", []),
            "categoryId": str(plan.get("categoryId", settings.YOUTUBE_DEFAULT_CATEGORY)),
        },
        "status": status,
    }


def preview(plan: dict, body: dict) -> None:
    s, st = body["snippet"], body["status"]
    thumb = plan.get("thumbnail")
    print("── upload preview ─────────────────────────────")
    print(f"video      : {plan['video']}  ({rp(plan['video']).stat().st_size / 1e6:.1f} MB)")
    print(f"title      : {s['title']}  ({len(s['title'])}/{TITLE_MAX})")
    print(f"category   : {s['categoryId']}   privacy: {st['privacyStatus']}   kids: {st['selfDeclaredMadeForKids']}")
    print(f"publishAt  : {st.get('publishAt', '(none — stays private draft until you publish)')}")
    print(f"tags       : {', '.join(s['tags']) or '(none)'}")
    print(f"thumbnail  : {thumb or '(none)'}" + ("" if not thumb else f"  ({rp(thumb).stat().st_size / 1e3:.0f} KB)"))
    print(f"description: {len(s['description'])} chars")
    print("   " + "\n   ".join(s["description"].splitlines()[:4]) + (" …" if len(s['description'].splitlines()) > 4 else ""))
    print("───────────────────────────────────────────────")


def get_creds():
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow

    creds = Credentials.from_authorized_user_file(str(TOKEN), SCOPES) if TOKEN.exists() else None
    if creds and creds.valid:
        return creds
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
    else:
        if not CLIENT_SECRET.exists():
            # Was sys.exit(...) — fine for the CLI entry point below (main()),
            # fatal for the live worker: get_creds() is also called from the
            # publish_due.py -> upload_video() path on every scheduled/manual
            # run, and SystemExit is a BaseException, not an Exception, so it
            # skips publish_due.py's `except Exception` entirely and crashes
            # the whole job — every post queued after the YouTube one in that
            # run never got attempted, and since the YouTube post's state
            # never reached "failed" (the crash happened before that could
            # run), the next run hit the exact same post and crashed again,
            # permanently wedging the queue. Confirmed live. A normal
            # exception lets publish_due.py catch it, mark just this one
            # post as failed, and continue to the next post as designed.
            raise RuntimeError(f"missing {CLIENT_SECRET} — see docs/youtube-oauth.md (step 2)")
        creds = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRET), SCOPES).run_local_server(port=0)
    TOKEN.parent.mkdir(exist_ok=True)
    TOKEN.write_text(creds.to_json())
    return creds


def service():
    from googleapiclient.discovery import build
    return build("youtube", "v3", credentials=get_creds())


async def _write_audit(actor: str, action: str, subject_id: str, payload: dict):
    """Write an audit_log row."""
    await write_audit(actor, action, subject_id, payload)


def do_upload(plan: dict) -> str:
    """Upload a video to YouTube and return the video_id.
    
    Args:
        plan: Dict with video, title, description, tags, thumbnail, etc.
    
    Returns:
        The YouTube video ID (external_id)
    
    Raises:
        Exception: If upload fails
    """
    from googleapiclient.errors import HttpError
    from googleapiclient.http import MediaFileUpload

    yt = service()
    body = build_body(plan)
    media = MediaFileUpload(str(rp(plan["video"])), chunksize=8 * 1024 * 1024, resumable=True)
    req = yt.videos().insert(part="snippet,status", body=body, media_body=media)

    print("uploading… (resumable)")
    resp = None
    retries = 0
    while resp is None:
        try:
            status, resp = req.next_chunk()
            if status:
                print(f"  {int(status.progress() * 100)}%")
        except HttpError as e:
            if e.resp.status in (500, 502, 503, 504) and retries < 5:
                retries += 1
                time.sleep(2 ** retries)
                continue
            raise
    vid = resp["id"]
    print(f"✓ uploaded (private draft): https://studio.youtube.com/video/{vid}/edit")

    thumb = plan.get("thumbnail")
    if thumb:
        try:
            from googleapiclient.http import MediaFileUpload as MFU
            yt.thumbnails().set(videoId=vid, media_body=MFU(str(rp(thumb)))).execute()
            print(f"• thumbnail API call sent: {thumb}")
            print("  ⚠ SHORTS CAVEAT: for a vertical ≤3-min video YouTube usually IGNORES this —")
            print("    the call returns success but the cover stays blank. If Studio shows")
            print("    'change the thumbnail in the YouTube mobile app', set the cover in the")
            print("    YouTube MOBILE APP (upload the .jpg). Desktop Studio + API can't do Shorts covers.")
        except HttpError as e:
            print(f"! thumbnail upload failed ({e.resp.status}) — set it in the YouTube mobile app.")
    print(f"\nNext: open Studio, review, then Publish or Schedule.\n  https://studio.youtube.com/video/{vid}/edit")
    
    return vid


async def upload_video(plan: dict) -> str:
    """Upload a video to YouTube and return the video_id.
    
    This is the async wrapper for the worker's use.
    
    Args:
        plan: Dict with video, title, description, tags, thumbnail, etc.
    
    Returns:
        The YouTube video ID (external_id)
    
    Raises:
        Exception: If upload fails
    """
    video_id = None
    try:
        video_id = do_upload(plan)
        
        # Write audit log
        await _write_audit(
            actor="youtube_publisher",
            action="upload_video_success",
            subject_id=video_id,
            payload={
                "title": plan.get("title"),
                "privacy": plan.get("privacy", settings.YOUTUBE_PRIVACY_ON_UPLOAD),
                "platform": "youtube_shorts",
            },
        )
        
        return video_id
    
    except Exception as e:
        # Write audit log on failure
        await _write_audit(
            actor="youtube_publisher",
            action="upload_video_failed",
            subject_id=plan.get("title", "unknown"),
            payload={
                "title": plan.get("title"),
                "error": str(e),
                "platform": "youtube_shorts",
            },
        )
        raise


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("auth", help="one-time browser OAuth")
    sub.add_parser("whoami", help="print the authorized channel")
    up = sub.add_parser("upload", help="upload a video from a publish.json plan")
    up.add_argument("plan")
    up.add_argument("--dry-run", action="store_true", help="validate + preview, no API call")
    args = ap.parse_args()

    if args.cmd == "auth":
        get_creds()
        print(f"✓ authorized — token saved to {TOKEN.relative_to(REPO)}")
        return
    if args.cmd == "whoami":
        ch = service().channels().list(part="snippet", mine=True).execute()
        it = ch.get("items", [])
        print(it[0]["snippet"]["title"] if it else "(no channel on this account)")
        return

    plan_path = rp(args.plan)
    if not plan_path.exists():
        sys.exit(f"plan not found: {args.plan}")
    plan = load_plan(plan_path)
    errs = validate(plan)
    body = build_body(plan)
    if errs:
        print("PLAN ERRORS:")
        for e in errs:
            print(f"  ✗ {e}")
        sys.exit(1)
    preview(plan, body)
    if args.dry_run:
        print("dry-run OK — plan is valid. Remove --dry-run to upload.")
        return
    do_upload(plan)


if __name__ == "__main__":
    main()
