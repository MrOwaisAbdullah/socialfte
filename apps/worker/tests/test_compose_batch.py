"""Tests for the daily batch composer — Week 4, US3.

Verifies a full run produces posts in state='review' with real captions and render
URLs, that a forced anti-repeat violation causes a retry (not a published duplicate),
and that the render props include the asset image URL.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _make_scalar_result(rows):
    scalar = MagicMock()
    scalar.all.return_value = rows
    result = MagicMock()
    result.scalars.return_value = scalar
    return result


@pytest.fixture(autouse=True)
def mock_deps():
    # _get_approved_concept runs a real session.execute(select(Concept)...)
    # on every compose_batch() call now — left unmocked, it hijacks the
    # same call-count-keyed session.execute side_effect each test sets up
    # for asset/template rows, returning garbage that made
    # random.choice(concept["headlines"]) raise IndexError (a MagicMock's
    # auto __len__ is 0). Every real scenario here has no approved concepts
    # yet (the concepts table is genuinely empty in production too), so
    # None is also the honest default, not just a test convenience.
    with patch("jobs.compose_batch.SessionLocal") as mock_session_factory, \
         patch("jobs.compose_batch.write_audit", new_callable=AsyncMock) as mock_write_audit, \
         patch("jobs.compose_batch._get_approved_concept", new_callable=AsyncMock, return_value=None) as mock_get_concept:
        mock_session = AsyncMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)
        yield {"session": mock_session, "write_audit": mock_write_audit, "get_concept": mock_get_concept}


@pytest.mark.asyncio
async def test_compose_batch_produces_posts(mock_deps):
    """A full run (mocked caption_agent, mocked render) produces at least one post in state='review'."""
    from jobs.compose_batch import compose_batch

    mock_asset = MagicMock(id="asset-1", r2_key="photos/test.jpg", piece="chair", tier="tier1",
                           variant="standard", times_used=0, reject_reason=None,
                           created_at=MagicMock())
    mock_template = MagicMock(id="tmpl-1", slug="hero", display_name="Hero", created_at=MagicMock())

    mock_session = mock_deps["session"]
    call_count = 0

    async def execute_side_effect(stmt, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return _make_scalar_result([mock_asset])
        return _make_scalar_result([mock_template])

    mock_session.execute = execute_side_effect

    with patch("jobs.compose_batch.write_caption", new_callable=AsyncMock) as mock_write, \
         patch("jobs.compose_batch.embed", new_callable=AsyncMock) as mock_embed, \
         patch("jobs.compose_batch.anti_repeat.check_asset", new_callable=AsyncMock, return_value=True), \
         patch("jobs.compose_batch.anti_repeat.check_template", new_callable=AsyncMock, return_value=True), \
         patch("jobs.compose_batch.anti_repeat.check_caption", new_callable=AsyncMock, return_value=True), \
         patch("jobs.compose_batch.httpx.AsyncClient") as mock_httpx, \
         patch("jobs.compose_batch._get_target_platforms", new_callable=AsyncMock, return_value=["instagram"]), \
         patch("jobs.compose_batch.settings.IMAGE_POST_RATIO", 1.0):
        # IMAGE_POST_RATIO pinned to 1.0 — this test asserts on the
        # still-image path specifically (state='review'); leaving format
        # selection to random.random() made this test flaky (~30% of runs
        # picked "video", which 404s in this test since GITHUB_TOKEN isn't
        # mocked, landing the post in state='failed' instead).
        mock_write.return_value = ("Solid chair.", "Solid Sheesham Chair", ["#chair"])
        mock_embed.return_value = [0.1] * 10

        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {"url": "https://media.test.com/render.jpg"}
        mock_httpx_instance = AsyncMock()
        mock_httpx_instance.__aenter__ = AsyncMock(return_value=mock_httpx_instance)
        mock_httpx_instance.__aexit__ = AsyncMock(return_value=False)
        mock_httpx_instance.post = AsyncMock(return_value=mock_resp)
        mock_httpx.return_value = mock_httpx_instance

        await compose_batch()
        assert mock_session.add.called
        assert mock_session.commit.called

        # Verify post was created with state='review'
        post_call = mock_session.add.call_args_list[0]
        created_post = post_call[0][0]
        assert created_post.state == "review"
        assert created_post.platform == "instagram"


@pytest.mark.asyncio
async def test_compose_batch_drafts_without_connected_platforms(mock_deps):
    """No connected credentials must NOT block draft creation — only
    publish_due needs real tokens. compose_batch falls back to drafting for
    every known platform instead of returning early with zero posts."""
    from jobs.compose_batch import compose_batch, PLATFORM_FORMATS

    mock_asset = MagicMock(id="asset-4", r2_key="photos/test4.jpg", piece="chair", tier="tier1",
                           variant="standard", times_used=0, reject_reason=None,
                           created_at=MagicMock())
    mock_template = MagicMock(id="tmpl-4", slug="hero", display_name="Hero", created_at=MagicMock())

    mock_session = mock_deps["session"]
    call_count = 0

    async def execute_side_effect(stmt, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return _make_scalar_result([mock_asset])
        return _make_scalar_result([mock_template])

    mock_session.execute = execute_side_effect

    with patch("jobs.compose_batch.write_caption", new_callable=AsyncMock) as mock_write, \
         patch("jobs.compose_batch.embed", new_callable=AsyncMock) as mock_embed, \
         patch("jobs.compose_batch.anti_repeat.check_asset", new_callable=AsyncMock, return_value=True), \
         patch("jobs.compose_batch.anti_repeat.check_template", new_callable=AsyncMock, return_value=True), \
         patch("jobs.compose_batch.anti_repeat.check_caption", new_callable=AsyncMock, return_value=True), \
         patch("jobs.compose_batch.httpx.AsyncClient") as mock_httpx, \
         patch("jobs.compose_batch.dispatch_video_render", new_callable=AsyncMock), \
         patch("jobs.compose_batch._get_target_platforms", new_callable=AsyncMock, return_value=[]):
        mock_write.return_value = ("Solid chair.", "Solid Sheesham Chair", ["#chair"])
        mock_embed.return_value = [0.1] * 10

        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {"url": "https://media.test.com/render.jpg"}
        mock_httpx_instance = AsyncMock()
        mock_httpx_instance.__aenter__ = AsyncMock(return_value=mock_httpx_instance)
        mock_httpx_instance.__aexit__ = AsyncMock(return_value=False)
        mock_httpx_instance.post = AsyncMock(return_value=mock_resp)
        mock_httpx.return_value = mock_httpx_instance

        await compose_batch()

        # Composition proceeded (didn't return early) — a post was still
        # created, whichever path the fallback's first platform took (video
        # posts start 'draft' until the render callback; still images go
        # straight to 'review').
        assert mock_session.add.called
        post_call = mock_session.add.call_args_list[0]
        created_post = post_call[0][0]
        assert created_post.state in ("draft", "review")
        assert created_post.platform in PLATFORM_FORMATS


@pytest.mark.parametrize(
    "platform,ratio,random_value,expected",
    [
        ("tiktok", 0.7, 0.0, "video"),  # single-format platform ignores the ratio entirely
        ("youtube_shorts", 0.7, 0.99, "short"),
        ("facebook", 0.7, 0.5, "image"),  # 0.5 < 0.7 -> image
        ("facebook", 0.7, 0.8, "video"),  # 0.8 >= 0.7 -> video
        ("instagram", 0.3, 0.2, "image"),  # 0.2 < 0.3 -> image
        ("instagram", 0.3, 0.5, "video"),  # 0.5 >= 0.3 -> video
    ],
)
def test_choose_format(platform, ratio, random_value, expected):
    from jobs.compose_batch import _choose_format

    with patch("jobs.compose_batch.settings.IMAGE_POST_RATIO", ratio), \
         patch("jobs.compose_batch.random.random", return_value=random_value):
        assert _choose_format(platform) == expected


@pytest.mark.asyncio
async def test_platform_rotation_advances_on_failed_attempts_not_successes(mock_deps):
    """Platform selection must rotate per candidate attempted, not per
    successful composition — indexing by `composed` meant a failing first
    platform kept `composed` at 0, so every attempt retried the SAME
    platform and the loop never reached the others at all (confirmed live:
    only Facebook was ever attempted, Instagram never once)."""
    from jobs.compose_batch import compose_batch

    mock_asset_1 = MagicMock(id="asset-a", r2_key="photos/a.jpg", piece="chair", tier="tier1",
                             variant="standard", times_used=0, reject_reason=None,
                             created_at=MagicMock())
    mock_asset_2 = MagicMock(id="asset-b", r2_key="photos/b.jpg", piece="table", tier="tier1",
                             variant="standard", times_used=0, reject_reason=None,
                             created_at=MagicMock())
    mock_template = MagicMock(id="tmpl-5", slug="hero", display_name="Hero", created_at=MagicMock())

    mock_session = mock_deps["session"]
    call_count = 0

    async def execute_side_effect(stmt, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return _make_scalar_result([mock_asset_1, mock_asset_2])
        return _make_scalar_result([mock_template])

    mock_session.execute = execute_side_effect

    async def check_asset_side_effect(asset_id):
        # First asset always fails anti-repeat — attempt 0 must not succeed,
        # so composed stays 0 while attempt advances to 1.
        return asset_id != "asset-a"

    with patch("jobs.compose_batch.write_caption", new_callable=AsyncMock) as mock_write, \
         patch("jobs.compose_batch.embed", new_callable=AsyncMock) as mock_embed, \
         patch("jobs.compose_batch.anti_repeat.check_asset", new_callable=AsyncMock, side_effect=check_asset_side_effect), \
         patch("jobs.compose_batch.anti_repeat.check_template", new_callable=AsyncMock, return_value=True), \
         patch("jobs.compose_batch.anti_repeat.check_caption", new_callable=AsyncMock, return_value=True), \
         patch("jobs.compose_batch.httpx.AsyncClient") as mock_httpx, \
         patch("jobs.compose_batch._get_target_platforms", new_callable=AsyncMock, return_value=["facebook", "instagram"]):
        mock_write.return_value = ("Solid chair.", "Solid Sheesham Chair", ["#chair"])
        mock_embed.return_value = [0.1] * 10

        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {"url": "https://media.test.com/render.jpg"}
        mock_httpx_instance = AsyncMock()
        mock_httpx_instance.__aenter__ = AsyncMock(return_value=mock_httpx_instance)
        mock_httpx_instance.__aexit__ = AsyncMock(return_value=False)
        mock_httpx_instance.post = AsyncMock(return_value=mock_resp)
        mock_httpx.return_value = mock_httpx_instance

        await compose_batch()

        # asset-a (attempt 0) was rejected by anti-repeat before a platform
        # even gets used for rendering; asset-b (attempt 1) must have used
        # platforms[1 % 2] == "instagram", not platforms[0] == "facebook"
        # again (which the old `composed`-indexed bug would have picked).
        assert mock_session.add.called
        post_call = mock_session.add.call_args_list[0]
        created_post = post_call[0][0]
        assert created_post.platform == "instagram"


@pytest.mark.asyncio
async def test_anti_repeat_violation_retries(mock_deps):
    """Forced anti-repeat violation causes retry (not a published duplicate)."""
    from jobs.compose_batch import compose_batch

    mock_asset = MagicMock(id="asset-2", r2_key="photos/test2.jpg", piece="table", tier="tier1",
                           variant="standard", times_used=0, reject_reason=None,
                           created_at=MagicMock())
    mock_template = MagicMock(id="tmpl-2", slug="square", display_name="Square", created_at=MagicMock())

    mock_session = mock_deps["session"]
    call_count = 0

    async def execute_side_effect(stmt, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return _make_scalar_result([mock_asset])
        return _make_scalar_result([mock_template])

    mock_session.execute = execute_side_effect

    with patch("jobs.compose_batch.write_caption", new_callable=AsyncMock) as mock_write, \
         patch("jobs.compose_batch.embed", new_callable=AsyncMock) as mock_embed, \
         patch("jobs.compose_batch.anti_repeat.check_asset", new_callable=AsyncMock, return_value=True), \
         patch("jobs.compose_batch.anti_repeat.check_template", new_callable=AsyncMock, return_value=True), \
         patch("jobs.compose_batch.anti_repeat.check_caption", new_callable=AsyncMock, return_value=False), \
         patch("jobs.compose_batch._get_target_platforms", new_callable=AsyncMock, return_value=["instagram"]):
        mock_write.return_value = ("Test caption.", "Solid Table Deal", ["#test"])
        mock_embed.return_value = [0.1] * 10

        await compose_batch()

        assert mock_write.call_count > 1


@pytest.mark.asyncio
async def test_render_props_include_asset_image_url(mock_deps):
    """Render request includes the asset image URL from R2."""
    from jobs.compose_batch import compose_batch

    mock_asset = MagicMock(id="asset-3", r2_key="photos/chair.jpg", piece="chair", tier="tier1",
                           variant="standard", times_used=0, reject_reason=None,
                           created_at=MagicMock())
    mock_template = MagicMock(id="tmpl-3", slug="story", display_name="Story", created_at=MagicMock())

    mock_session = mock_deps["session"]
    call_count = 0

    async def execute_side_effect(stmt, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return _make_scalar_result([mock_asset])
        return _make_scalar_result([mock_template])

    mock_session.execute = execute_side_effect

    with patch("jobs.compose_batch.write_caption", new_callable=AsyncMock, return_value=("Caption.", "Solid Sheesham Chair", ["#tag"])), \
         patch("jobs.compose_batch.embed", new_callable=AsyncMock, return_value=[0.1] * 10), \
         patch("jobs.compose_batch.anti_repeat.check_asset", new_callable=AsyncMock, return_value=True), \
         patch("jobs.compose_batch.anti_repeat.check_template", new_callable=AsyncMock, return_value=True), \
         patch("jobs.compose_batch.anti_repeat.check_caption", new_callable=AsyncMock, return_value=True), \
         patch("jobs.compose_batch.httpx.AsyncClient") as mock_httpx, \
         patch("jobs.compose_batch._get_target_platforms", new_callable=AsyncMock, return_value=["instagram"]), \
         patch("jobs.compose_batch.settings") as mock_settings:
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {"url": "https://media.test.com/render.jpg"}
        mock_httpx_instance = AsyncMock()
        mock_httpx_instance.__aenter__ = AsyncMock(return_value=mock_httpx_instance)
        mock_httpx_instance.__aexit__ = AsyncMock(return_value=False)
        mock_httpx_instance.post = AsyncMock(return_value=mock_resp)
        mock_httpx.return_value = mock_httpx_instance

        mock_settings.R2_PUBLIC_URL = "https://pub-9482aec63df7420bb53018258d2b14ef.r2.dev"
        mock_settings.ANTI_REPEAT_MAX_RETRIES = 3
        mock_settings.RENDER_INTERNAL_URL = "http://localhost:3001"
        mock_settings.RENDER_INTERNAL_SECRET = "test-secret"
        # 1.0 forces _choose_format("instagram") to always pick "image" —
        # this test exercises the still-image render path specifically, and
        # must not be flaky depending on random.random()'s draw.
        mock_settings.IMAGE_POST_RATIO = 1.0

        await compose_batch()

        # Verify render was called with the asset's R2 image URL in props, under
        # the key the actual template registry requires (registry.ts) — the
        # unregistered "story" slug falls back to hero/carousel-slide's shape.
        post_call = mock_httpx_instance.post
        call_kwargs = post_call.call_args
        json_data = call_kwargs.kwargs["json"]
        assert "props" in json_data, f"Expected 'props' in json data, got keys: {list(json_data.keys())}"
        props = json_data["props"]
        assert "imageUrl" in props
        assert props["imageUrl"] == "https://pub-9482aec63df7420bb53018258d2b14ef.r2.dev/photos/chair.jpg"
        assert "brand" in json_data
        assert json_data["brand"]["colors"]["primary"]


@pytest.mark.asyncio
async def test_compose_batch_uses_approved_concept_when_available(mock_deps):
    """An approved concept's headline/caption must be used verbatim — not
    silently overwritten by a stale `caption` variable from a previous
    AI-generation branch, which is what happened before this was fixed
    (either a NameError on the very first candidate, or the concept's
    caption_text getting clobbered on later ones)."""
    from jobs.compose_batch import compose_batch

    mock_asset = MagicMock(id="asset-concept", r2_key="photos/bed.jpg", piece="bed", tier="tier1",
                           variant="standard", times_used=0, reject_reason=None,
                           created_at=MagicMock())
    mock_template = MagicMock(id="tmpl-concept", slug="hero", display_name="Hero", created_at=MagicMock())

    mock_session = mock_deps["session"]
    call_count = 0

    async def execute_side_effect(stmt, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return _make_scalar_result([mock_asset])
        return _make_scalar_result([mock_template])

    mock_session.execute = execute_side_effect

    approved_concept = {
        "id": "concept-1",
        "headlines": ["Solid Sheesham Bed"],
        "captions": ["A real, human-approved caption. #sheesham #bed"],
        "concept_type": "quality",
        "animation_style": None,
    }

    with patch("jobs.compose_batch.write_caption", new_callable=AsyncMock) as mock_write, \
         patch("jobs.compose_batch.embed", new_callable=AsyncMock, return_value=[0.1] * 10), \
         patch("jobs.compose_batch.anti_repeat.check_asset", new_callable=AsyncMock, return_value=True), \
         patch("jobs.compose_batch.anti_repeat.check_template", new_callable=AsyncMock, return_value=True), \
         patch("jobs.compose_batch.anti_repeat.check_caption", new_callable=AsyncMock, return_value=True), \
         patch("jobs.compose_batch.httpx.AsyncClient") as mock_httpx, \
         patch("jobs.compose_batch._get_target_platforms", new_callable=AsyncMock, return_value=["instagram"]), \
         patch("jobs.compose_batch._get_approved_concept", new_callable=AsyncMock, return_value=approved_concept), \
         patch("jobs.compose_batch.settings.IMAGE_POST_RATIO", 1.0):
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {"url": "https://media.test.com/render.jpg"}
        mock_httpx_instance = AsyncMock()
        mock_httpx_instance.__aenter__ = AsyncMock(return_value=mock_httpx_instance)
        mock_httpx_instance.__aexit__ = AsyncMock(return_value=False)
        mock_httpx_instance.post = AsyncMock(return_value=mock_resp)
        mock_httpx.return_value = mock_httpx_instance

        await compose_batch()

        # The concept's own caption must reach the Post row untouched — the
        # AI writer must never even be called when an approved concept exists.
        mock_write.assert_not_called()
        post_call = mock_session.add.call_args_list[0]
        created_post = post_call[0][0]
        assert created_post.caption == approved_concept["captions"][0]


@pytest.mark.asyncio
async def test_compose_batch_skips_concept_rejected_by_anti_repeat(mock_deps):
    """A fixed, human-approved concept can't be regenerated the way an AI
    draft can — an anti-repeat rejection must skip this candidate (and fall
    through to the next one), never loop or crash."""
    from jobs.compose_batch import compose_batch

    mock_asset_1 = MagicMock(id="asset-concept-a", r2_key="photos/a.jpg", piece="bed", tier="tier1",
                             variant="standard", times_used=0, reject_reason=None,
                             created_at=MagicMock())
    mock_asset_2 = MagicMock(id="asset-concept-b", r2_key="photos/b.jpg", piece="bed", tier="tier1",
                             variant="standard", times_used=0, reject_reason=None,
                             created_at=MagicMock())
    mock_template = MagicMock(id="tmpl-concept-2", slug="hero", display_name="Hero", created_at=MagicMock())

    mock_session = mock_deps["session"]
    call_count = 0

    async def execute_side_effect(stmt, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return _make_scalar_result([mock_asset_1, mock_asset_2])
        return _make_scalar_result([mock_template])

    mock_session.execute = execute_side_effect

    approved_concept = {
        "id": "concept-2",
        "headlines": ["Solid Sheesham Bed"],
        "captions": ["A caption too similar to a recent one. #sheesham"],
        "concept_type": "quality",
        "animation_style": None,
    }

    with patch("jobs.compose_batch.write_caption", new_callable=AsyncMock) as mock_write, \
         patch("jobs.compose_batch.embed", new_callable=AsyncMock, return_value=[0.1] * 10), \
         patch("jobs.compose_batch.anti_repeat.check_asset", new_callable=AsyncMock, return_value=True), \
         patch("jobs.compose_batch.anti_repeat.check_template", new_callable=AsyncMock, return_value=True), \
         patch("jobs.compose_batch.anti_repeat.check_caption", new_callable=AsyncMock, return_value=False), \
         patch("jobs.compose_batch._get_target_platforms", new_callable=AsyncMock, return_value=["instagram"]), \
         patch("jobs.compose_batch._get_approved_concept", new_callable=AsyncMock, return_value=approved_concept):
        await compose_batch()

        # No infinite loop, no crash, no post created, no AI fallback for
        # either candidate — both get skipped and the run just ends.
        mock_write.assert_not_called()
        mock_session.add.assert_not_called()
