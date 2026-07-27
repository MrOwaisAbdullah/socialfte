"""Performance metrics collector — Week 4, US4.

Collects published-post performance data (reach, likes, saves, comments, shares) on
a recurring schedule for platforms that expose it via API. Runs every 6 hours by
default (COLLECT_METRICS_CRON).

Per FR-009: manually-posted/draft-only posts are skipped without failing the run.
Per research.md Decision 4: Meta Graph API GET /{id}?fields=insights is broken
since ~May 2026. All insight fetches use the POST batch syntax (?ids=...) instead.
Per research.md Decision 5: YouTube credentials missing yt-analytics.readonly scope
are skipped with the reason recorded, not a hard failure.
"""
import logging
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select

from config import settings
from db.models import AuditLog, Credential, Metric, Post
from db.session import SessionLocal

logger = logging.getLogger("worker.collect_metrics")

try:
    import googleapiclient.discovery
    import googleapiclient.errors
except ImportError:
    googleapiclient = None  # type: ignore[assignment]


async def _fetch_page_insights(post: Post, access_token: str) -> dict | None:
    """Fetch Facebook Page post insights via the Graph API.

    Uses POST batch syntax (?ids=...) per research.md Decision 4 — the GET
    /{id}?fields=insights endpoint has been broken since ~May 2026.
    Returns a dict with reach/likes/comments/shares or None if unavailable.
    """
    if not post.external_id:
        return None
    async with httpx.AsyncClient() as client:
        url = f"https://graph.facebook.com/{settings.META_GRAPH_VERSION}/"
        params = {
            "ids": post.external_id,
            "fields": "insights.metric(post_reactions_like_total,post_impressions,post_saves,post_shares,post_comments),like_count,comments_count",
            "access_token": access_token,
        }
        resp = await client.post(url, params=params, timeout=15.0)
        if resp.status_code != 200:
            logger.warning("Facebook insights fetch failed for %s: %s", post.id, resp.text[:200])
            return None
        data = resp.json()
        post_data = data.get(post.external_id, {})
        return {
            "reach": _get_insight_value(post_data, "post_impressions"),
            "likes": post_data.get("like_count") or _get_insight_value(post_data, "post_reactions_like_total"),
            "comments": post_data.get("comments_count") or _get_insight_value(post_data, "post_comments"),
            "saves": _get_insight_value(post_data, "post_saves"),
            "shares": _get_insight_value(post_data, "post_shares"),
        }


def _get_insight_value(data: dict, metric_name: str) -> int | None:
    """Extract a metric value from the Graph API insights response format.

    Handles both direct response (data.insights.data) and batch response
    where data is already extracted from under the post ID key.
    """
    insights = data.get("insights", {}).get("data", [])
    for entry in insights:
        if entry.get("name") == metric_name:
            values = entry.get("values", [])
            if values:
                return values[-1].get("value")
    return None


async def _fetch_instagram_insights(post: Post, ig_user_id: str, access_token: str) -> dict | None:
    """Fetch Instagram media insights via the Graph API.

    Uses the same POST batch syntax (?ids=...) as Facebook Page posts, per
    research.md Decision 4 — the single-ID GET /{media-id}?fields=insights pattern
    has been broken (400 Authorization Error) for page tokens since ~May 2026, and
    that break applies to Instagram Business media insights the same way it does to
    Facebook Page posts, not just the Facebook side.
    """
    if not post.external_id:
        return None
    async with httpx.AsyncClient() as client:
        url = f"https://graph.facebook.com/{settings.META_GRAPH_VERSION}/"
        params = {
            "ids": post.external_id,
            "fields": "insights.metric(impressions,reach,likes,saved,comments,shares)",
            "access_token": access_token,
        }
        resp = await client.post(url, params=params, timeout=15.0)
        if resp.status_code != 200:
            logger.warning("Instagram insights fetch failed for %s: %s", post.id, resp.text[:200])
            return None
        data = resp.json().get(post.external_id, {})
        insights = data.get("insights", {}).get("data", [])
        result = {}
        for entry in insights:
            name = entry.get("name", "")
            values = entry.get("values", [])
            value = values[-1].get("value") if values else None
            if name == "reach":
                result["reach"] = value
            elif name == "likes":
                result["likes"] = value
            elif name == "saved":
                result["saves"] = value
            elif name == "comments":
                result["comments"] = value
            elif name == "shares":
                result["shares"] = value
            elif name == "impressions":
                result.setdefault("reach", value)
        return result or None


async def _fetch_youtube_metrics(post: Post) -> dict | None:
    """Fetch YouTube video analytics via the YouTube Reporting API.

    Uses reports.query with dimensions=video, filters=video==<id>.

    YouTube credentials are NOT stored in the `credentials` DB table — Week 3's
    publishers/youtube.py OAuth flow persists them to a local token file
    (YOUTUBE_TOKEN_PATH), a different mechanism than Meta/TikTok's DB-backed
    storage. Read from that same file here rather than assuming a `credentials`
    row exists for youtube_shorts (it never does).

    Checks the token's actual granted `scopes` (a real attribute on the loaded
    Credentials object) for yt-analytics.readonly before calling the API — tokens
    issued before that scope was added to SCOPES (research.md Decision 5) will be
    missing it and are skipped, not treated as a hard failure. This does NOT
    attempt interactive re-auth (unlike publishers/youtube.py's get_creds()) since
    this runs from an unattended cron job — a missing/unrefreshable token is
    logged and skipped, never blocks on a browser flow.
    """
    if not post.external_id:
        return None
    if not settings.YOUTUBE_TOKEN_PATH:
        return None

    from pathlib import Path

    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials

    token_path = Path(settings.YOUTUBE_TOKEN_PATH)
    if not token_path.exists():
        logger.info("No YouTube token file at %s — skipping metrics for post %s", token_path, post.id)
        return None

    creds = Credentials.from_authorized_user_file(str(token_path))
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())

    if "https://www.googleapis.com/auth/yt-analytics.readonly" not in (creds.scopes or []):
        logger.info("YouTube token missing yt-analytics.readonly scope — skipping metrics for post %s", post.id)
        return None

    try:
        youtube_analytics = googleapiclient.discovery.build("youtubeAnalytics", "v2", credentials=creds)
        now = datetime.now(timezone.utc)

        for window_name, days_back in [("24h", 1), ("7d", 7)]:
            start = (now - timedelta(days=days_back)).strftime("%Y-%m-%d")
            end = now.strftime("%Y-%m-%d")
            response = youtube_analytics.reports().query(
                ids="channel==MINE",
                startDate=start,
                endDate=end,
                metrics="views,likes,comments,shares",
                dimensions="video",
                filters=f"video=={post.external_id}",
            ).execute()
            rows = response.get("rows", [])
            if rows:
                return {
                    "reach": rows[0][0],  # views
                    "likes": rows[0][1],
                    "comments": rows[0][2],
                    "shares": rows[0][3],
                }
        return None
    except googleapiclient.errors.HttpError as e:
        if "accessNotConfigured" in str(e) or "yt-analytics" in str(e):
            logger.warning("YouTube analytics not configured for post %s — skipping", post.id)
            return None
        raise


async def _write_metric(post_id, window, metrics: dict | None, error: str | None = None):
    async with SessionLocal() as session:
        session.add(
            Metric(
                post_id=post_id,
                window=window,
                reach=metrics.get("reach") if metrics else None,
                likes=metrics.get("likes") if metrics else None,
                saves=metrics.get("saves") if metrics else None,
                comments=metrics.get("comments") if metrics else None,
                shares=metrics.get("shares") if metrics else None,
                error=error,
            )
        )
        await session.commit()


async def _write_audit(action: str, subject_id: str, payload: dict):
    async with SessionLocal() as session:
        session.add(AuditLog(actor="collect_metrics", action=action, subject_id=subject_id, payload=payload))
        await session.commit()


async def collect_metrics():
    """Collect performance metrics for published posts.
    
    Iterates all published posts with external_ids. For each, fetches metrics
    from the appropriate platform API and writes rows to the metrics table.
    Isolates per-post failures so one broken post doesn't abort the entire run.
    """
    logger.info("Starting metrics collection")

    async with SessionLocal() as session:
        published = (
            await session.execute(
                select(Post).where(
                    Post.state == "published",
                    Post.external_id.isnot(None),
                    Post.platform.in_(["facebook", "instagram", "youtube_shorts"]),
                )
            )
        ).scalars().all()

    if not published:
        logger.info("No published posts with external IDs to collect metrics for")
        return

    creds = {}
    async with SessionLocal() as session:
        rows = (await session.execute(select(Credential))).scalars().all()
        for c in rows:
            creds[c.platform] = c

    for post in published:
        try:
            await _collect_for_post(post, creds)
        except Exception as e:
            logger.error("Failed to collect metrics for post %s: %s", post.id, e)
            await _write_metric(post.id, "24h", None, error=str(e)[:500])
            await _write_metric(post.id, "7d", None, error=str(e)[:500])


async def _collect_for_post(post: Post, creds: dict):
    platform = post.platform
    metrics_24h = None
    metrics_7d = None

    if platform == "facebook" and "facebook" in creds:
        token = creds["facebook"].access_token
        metrics_24h = await _fetch_page_insights(post, token)
        metrics_7d = await _fetch_page_insights(post, token)

    elif platform == "instagram" and "instagram" in creds:
        token = creds.get("instagram", creds.get("facebook", None))
        if token:
            token = token.access_token
            ig_user_id = settings.META_IG_USER_ID
            metrics_24h = await _fetch_instagram_insights(post, ig_user_id, token)
            metrics_7d = await _fetch_instagram_insights(post, ig_user_id, token)

    elif platform == "youtube_shorts":
        # YouTube credentials live in a local token file (YOUTUBE_TOKEN_PATH), not
        # the `credentials` DB table — _fetch_youtube_metrics reads that file
        # directly and returns None (skip, not raise) for a missing/scopeless token.
        metrics_24h = await _fetch_youtube_metrics(post)
        metrics_7d = metrics_24h  # YouTube reports.query handles date range server-side

    if metrics_24h is not None:
        await _write_metric(post.id, "24h", metrics_24h)
    if metrics_7d is not None:
        await _write_metric(post.id, "7d", metrics_7d)

    await _write_audit(
        "metrics_collected",
        str(post.id),
        {
            "platform": platform,
            "window_24h": metrics_24h is not None,
            "window_7d": metrics_7d is not None,
        },
    )
    logger.debug("Collected metrics for post %s (%s)", post.id, platform)
