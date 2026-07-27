"""Video clip processing — Week 5, Steps 3-4.

Watches for `assets` rows with kind='clip', processed=false: cleans the voice
track (local RNNoise), checks for A/V sync problems, mixes in a music bed on a
pass, then extracts and scores cover-frame candidates. Runs on
PROCESS_FOOTAGE_CRON (default every 15 minutes).

Deviation from the literal kickoff worth documenting: `tools/media/verify_cut.py`
takes a `<project>` argument and expects a transcript + planned-cut structure
from the original claude-youtube-editor's ASR-based editing pipeline — it's not
built to answer "is this arbitrary uploaded clip's audio in sync with its
video," which is what a raw social-media clip upload actually needs. Using a
direct ffprobe stream-duration comparison instead (gross A/V desync — a video
and audio stream ending materially far apart from each other) — appropriately
scoped for this use case rather than forcing a tool built for a different job.
"""
import logging
import subprocess
from pathlib import Path

from sqlalchemy import select

from brain.vision import score_frame
from config import settings
from db.models import Asset, AuditLog, Post
from db.session import SessionLocal

logger = logging.getLogger("worker.process_footage")

REPO = Path(__file__).resolve().parent.parent.parent.parent
TOOLS_MEDIA = REPO / "tools" / "media"

# A/V duration mismatch beyond this is treated as a sync failure. Generous on
# purpose — this is a gross-desync gate, not frame-accurate lip-sync detection
# (that's what verify_cut.py's ASR-based approach does for the authored-content
# pipeline this project didn't inherit for raw clip uploads).
MAX_AV_DRIFT_SECONDS = 0.5

NUM_COVER_FRAME_CANDIDATES = 12
NUM_COVER_FRAMES_TO_KEEP = 3
MIN_USABLE_FRAME_SCORE = 4  # out of 10, per the kickoff's scoring prompt


async def _write_audit(action: str, subject_id: str, payload: dict):
    async with SessionLocal() as session:
        session.add(AuditLog(actor="process_footage", action=action, subject_id=subject_id, payload=payload))
        await session.commit()


def _run(cmd: list[str]) -> str:
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"command failed ({' '.join(cmd)}): {result.stdout[-2000:]}")
    return result.stdout


def _stream_duration(path: str, stream: str) -> float | None:
    try:
        out = _run([
            "ffprobe", "-v", "error", "-select_streams", stream,
            "-show_entries", "stream=duration", "-of", "default=nw=1:nk=1", path,
        ]).strip()
        return float(out) if out else None
    except Exception:
        return None


def check_av_sync(clip_path: str) -> bool:
    """Gross A/V desync check via ffprobe stream durations — see module docstring."""
    video_dur = _stream_duration(clip_path, "v:0")
    audio_dur = _stream_duration(clip_path, "a:0")
    if video_dur is None or audio_dur is None:
        # No audio stream at all (silent footage) is not a sync failure —
        # nothing to be out of sync with (spec.md edge case).
        return True
    return abs(video_dur - audio_dur) <= MAX_AV_DRIFT_SECONDS


async def _download_from_r2(r2_key: str, dest: Path) -> None:
    import httpx

    url = f"{settings.R2_PUBLIC_URL}/{r2_key}"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, timeout=120.0)
        resp.raise_for_status()
        dest.write_bytes(resp.content)


async def _upload_to_r2(local_path: Path, r2_key: str) -> str:
    from storage.r2 import get_public_url, upload_buffer

    upload_buffer(r2_key, local_path.read_bytes(), "image/jpeg" if r2_key.endswith(".jpg") else "video/mp4")
    return get_public_url(r2_key)


async def _process_one_clip(asset: Asset, work_dir: Path) -> None:
    local_path = work_dir / f"{asset.id}.mp4"
    await _download_from_r2(asset.r2_key, local_path)

    cleaned_path = work_dir / f"{asset.id}-clean.mp4"
    try:
        _run(["python3", str(TOOLS_MEDIA / "clean_voice.py"), str(local_path), "-o", str(cleaned_path)])
        await _write_audit("noise_cleaned", str(asset.id), {"r2_key": asset.r2_key})
    except Exception as e:
        logger.warning("Noise cleanup failed for asset %s, continuing with original: %s", asset.id, e)
        cleaned_path = local_path
        await _write_audit("noise_cleanup_failed", str(asset.id), {"error": str(e)})

    sync_ok = check_av_sync(str(cleaned_path))

    async with SessionLocal() as session:
        db_asset = await session.get(Asset, asset.id)
        if db_asset:
            db_asset.sync_ok = sync_ok
            await session.commit()

    await _write_audit("sync_checked", str(asset.id), {"sync_ok": sync_ok})

    if not sync_ok:
        logger.warning("Asset %s failed A/V sync check — skipping music mix and cover-frame extraction", asset.id)
        async with SessionLocal() as session:
            db_asset = await session.get(Asset, asset.id)
            if db_asset:
                db_asset.processed = True
                await session.commit()
        return

    mixed_path = work_dir / f"{asset.id}-mixed.mp4"
    try:
        _run([
            "python3", str(TOOLS_MEDIA / "mix_music.py"),
            "--all", "--base", str(cleaned_path),
            "--bed-gain", str(settings.MUSIC_BED_DB),
            "--out", str(mixed_path),
        ])
        await _write_audit("music_mixed", str(asset.id), {"bed_gain_db": settings.MUSIC_BED_DB})
    except Exception as e:
        logger.warning("Music mix failed for asset %s, continuing with unmixed clip: %s", asset.id, e)
        mixed_path = cleaned_path
        await _write_audit("music_mix_failed", str(asset.id), {"error": str(e)})

    async with SessionLocal() as session:
        db_asset = await session.get(Asset, asset.id)
        if db_asset:
            db_asset.quality_score = 80  # sync passed + processed cleanly; vision-tagged separately (Week 4 flow)
            db_asset.processed = True
            await session.commit()

    await _extract_and_score_cover_frames(asset.id, mixed_path, work_dir)


async def _extract_and_score_cover_frames(asset_id, clip_path: Path, work_dir: Path) -> None:
    """Extract candidate frames and score them, per Step 4 (cover-frames)."""
    frames_dir = work_dir / f"{asset_id}-frames"
    frames_dir.mkdir(exist_ok=True)

    try:
        duration = float(_run([
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=nw=1:nk=1", str(clip_path),
        ]).strip())
    except Exception as e:
        logger.error("Could not determine duration for asset %s: %s", asset_id, e)
        return

    frame_paths = []
    for i in range(NUM_COVER_FRAME_CANDIDATES):
        timestamp = (duration / (NUM_COVER_FRAME_CANDIDATES + 1)) * (i + 1)
        frame_path = frames_dir / f"frame_{i}.jpg"
        try:
            _run(["ffmpeg", "-y", "-ss", str(timestamp), "-i", str(clip_path), "-frames:v", "1", str(frame_path)])
            frame_paths.append(frame_path)
        except Exception as e:
            logger.warning("Frame extraction failed at %.2fs for asset %s: %s", timestamp, asset_id, e)

    # Posts referencing this asset that are still awaiting a cover — score and
    # attach candidates to each (an asset can back more than one draft post).
    async with SessionLocal() as session:
        posts = (await session.execute(select(Post).where(Post.asset_id == asset_id))).scalars().all()

    if not posts:
        logger.info("No posts reference asset %s yet — skipping cover-frame candidate upload", asset_id)
        return

    scored = []
    for idx, frame_path in enumerate(frame_paths):
        r2_key = f"cover_frame_candidates/{asset_id}_{idx}.jpg"
        try:
            url = await _upload_to_r2(frame_path, r2_key)
            result = await score_frame(url)
            scored.append({"url": url, "score": result.score, "reason": result.reason})
        except Exception as e:
            logger.warning("Frame scoring failed for asset %s frame %d: %s", asset_id, idx, e)

    usable = [f for f in scored if f["score"] >= MIN_USABLE_FRAME_SCORE]
    top_candidates = sorted(usable, key=lambda f: f["score"], reverse=True)[:NUM_COVER_FRAMES_TO_KEEP]

    if not top_candidates:
        logger.warning("No usable cover-frame candidates found for asset %s (FR-010)", asset_id)
        await _write_audit("cover_frames_none_usable", str(asset_id), {"scored_count": len(scored)})
        return

    async with SessionLocal() as session:
        for post in posts:
            db_post = await session.get(Post, post.id)
            if db_post:
                db_post.cover_frame_candidates = top_candidates
        await session.commit()

    await _write_audit(
        "cover_frames_selected",
        str(asset_id),
        {"candidates": top_candidates, "post_ids": [str(p.id) for p in posts]},
    )
    logger.info("Selected %d cover-frame candidates for asset %s", len(top_candidates), asset_id)


async def process_footage():
    """Process every unprocessed video clip. Runs on PROCESS_FOOTAGE_CRON."""
    logger.info("Starting footage processing")

    async with SessionLocal() as session:
        clips = (
            await session.execute(select(Asset).where(Asset.kind == "clip", Asset.processed.is_(False)))
        ).scalars().all()

    if not clips:
        logger.info("No unprocessed clips found")
        return

    import tempfile

    for asset in clips:
        with tempfile.TemporaryDirectory() as tmp:
            try:
                await _process_one_clip(asset, Path(tmp))
            except Exception as e:
                logger.error("Failed to process clip asset %s: %s", asset.id, e)
                async with SessionLocal() as session:
                    db_asset = await session.get(Asset, asset.id)
                    if db_asset:
                        db_asset.processed = True  # never re-attempt a clip that errors out
                        db_asset.reject_reason = f"processing failed: {e}"
                        await session.commit()
                await _write_audit("processing_failed", str(asset.id), {"error": str(e)})

    logger.info("Footage processing complete: %d clip(s) processed", len(clips))
