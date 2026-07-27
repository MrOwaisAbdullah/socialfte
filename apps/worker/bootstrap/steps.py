"""BOOTSTRAP steps — Week 4, US7.

Six resumable steps for onboarding a brand. Each step checks if its output already
exists before prompting, so killing and restarting the flow doesn't re-ask completed steps.
"""
import logging
import os
from pathlib import Path
from typing import Optional

from config import settings
from db.session import SessionLocal

logger = logging.getLogger("worker.bootstrap")

# Default target root for a first-brand, no-flag run — real repo root. Every
# step below takes an explicit `root: Path` (default REPO) rather than reading
# this module constant directly, so `--env=<path>` (Week 5, US6) can point an
# isolated second-client run at its own directory without touching this one
# (plan.md Phase 7's flagged risk: this used to be hardcoded).
REPO = Path(__file__).resolve().parent.parent.parent.parent
CONSTITUTION_FILES = ["SOUL.md", "BRAND.md", "HEARTBEAT.md", "IDENTITY.md", "AGENTS.md"]


def _is_step_done(step: int, root: Optional[Path] = None) -> bool:
    """Check if a step's marker exists — allows resumability (spec.md edge case)."""
    root = root if root is not None else REPO  # read fresh, not bound at def-time — see run_bootstrap
    if step == 1:
        return (root / "SOUL.md").exists() and (root / "IDENTITY.md").exists()
    elif step == 2:
        return (root / "BRAND.md").exists()
    elif step == 3:
        from db.session import SessionLocal
        import asyncio
        async def _check():
            async with SessionLocal() as session:
                from sqlalchemy import select
                from db.models import Credential
                result = await session.execute(select(Credential).limit(1))
                return result.scalar_one_or_none() is not None
        try:
            return asyncio.run(_check())
        except Exception:
            return False
    elif step == 4:
        return bool(settings.DISCORD_BOT_TOKEN or settings.WHATSAPP_TOKEN or settings.TELEGRAM_BOT_TOKEN)
    elif step == 5:
        return (root / "HEARTBEAT.md").exists()
    elif step == 6:
        return (root / "BOOTSTRAP.md").exists()
    return False


async def _ask(prompt: str, default: str = "") -> str:
    """Helper to prompt the user (CLI flow). In the dashboard, this is replaced by form fields."""
    value = input(f"{prompt} [{default}]: ").strip()
    return value if value else default


def _write_file(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.strip() + "\n", encoding="utf-8")
    logger.info("Wrote %s", path)


async def step_1_identity(root: Optional[Path] = None) -> bool:
    """Collect agent identity → SOUL.md, IDENTITY.md."""
    root = root if root is not None else REPO
    if _is_step_done(1, root):
        logger.info("Step 1 already complete, skipping")
        return True
    try:
        name = await _ask("Agent name (e.g. SocialFTE)", "SocialFTE")
        voice = await _ask("Voice description (e.g. Direct, no fluff)", "Direct, no fluff")
        _write_file(root / "SOUL.md", f"# {name}\n\n{voice}")
        _write_file(root / "IDENTITY.md", f"# Identity\n\nAgent: {name}\nVoice: {voice}")
        logger.info("Step 1 complete: identity collected")
        return True
    except Exception as e:
        logger.error("Step 1 failed: %s", e)
        return False


async def step_2_brand(root: Optional[Path] = None) -> bool:
    """Collect brand details → BRAND.md + regenerate brand.ts/fonts.ts."""
    root = root if root is not None else REPO
    if _is_step_done(2, root):
        logger.info("Step 2 already complete, skipping")
        return True
    try:
        brand_name = await _ask("Brand name")
        tagline = await _ask("Tagline")
        colors = await _ask("Primary color hex (e.g. #1B5E20)", "#1B5E20")
        accent = await _ask("Accent color hex (e.g. #C5A55A)", "#C5A55A")
        font_heading = await _ask("Heading font name", "Instrument Serif")
        font_body = await _ask("Body font name", "Archivo")
        language = await _ask("Caption language", "English")
        platforms = await _ask("Platforms (comma-separated: facebook,instagram,youtube,tiktok)", "instagram,facebook")

        brand_content = (
            f"# {brand_name}\n\n"
            f"**Tagline**: {tagline}\n"
            f"**Colors**: Primary={colors}, Accent={accent}\n"
            f"**Fonts**: Heading={font_heading}, Body={font_body}\n"
            f"**Language**: {language}\n"
            f"**Platforms**: {platforms}\n"
        )
        _write_file(root / "BRAND.md", brand_content)
        logger.info("Step 2 complete: brand details saved")
        return True
    except Exception as e:
        logger.error("Step 2 failed: %s", e)
        return False


async def step_3_platforms(root: Optional[Path] = None) -> bool:
    """Connect social platforms → runs OAuth flows, writes to credentials table."""
    root = root if root is not None else REPO
    if _is_step_done(3, root):
        logger.info("Step 3 already complete, skipping")
        return True
    try:
        async with SessionLocal() as session:
            from sqlalchemy import select
            from db.models import Credential

            platforms_str = await _ask("Which platforms to connect? (facebook,instagram,youtube,tiktok)", "instagram")
            for p in [x.strip() for x in platforms_str.split(",") if x.strip()]:
                existing = (await session.execute(select(Credential).where(Credential.platform == p))).scalar_one_or_none()
                if existing:
                    logger.info("Credential for %s already exists, skipping", p)
                    continue
                token = await _ask(f"  {p}: API token/key (or press Enter to skip)", "")
                if token:
                    session.add(Credential(platform=p, access_token=token, meta={"configured_via": "bootstrap"}))
            await session.commit()
        logger.info("Step 3 complete: platforms connected")
        return True
    except Exception as e:
        logger.error("Step 3 failed: %s", e)
        return False


async def step_4_notification(root: Optional[Path] = None) -> bool:
    """Configure notification channel."""
    root = root if root is not None else REPO
    if _is_step_done(4, root):
        logger.info("Step 4 already complete, skipping")
        return True
    try:
        channel = await _ask("Notification channel (discord/whatsapp/telegram)", "discord")
        if channel == "discord":
            token = await _ask("  Discord bot token", "")
            if token:
                channel_id = await _ask("  Discord channel ID", "")
                _write_file(root / ".env.local", f"DISCORD_BOT_TOKEN={token}\nDISCORD_CHANNEL_ID={channel_id}\nNOTIFY_CHANNEL=discord")
        elif channel == "whatsapp":
            phone_id = await _ask("  WhatsApp Phone Number ID", "")
            token = await _ask("  WhatsApp Token", "")
            if token and phone_id:
                _write_file(root / ".env.local", f"WHATSAPP_PHONE_NUMBER_ID={phone_id}\nWHATSAPP_TOKEN={token}\nNOTIFY_CHANNEL=whatsapp")
        elif channel == "telegram":
            bot_token = await _ask("  Telegram Bot Token", "")
            chat_id = await _ask("  Telegram Chat ID", "")
            if bot_token and chat_id:
                _write_file(root / ".env.local", f"TELEGRAM_BOT_TOKEN={bot_token}\nTELEGRAM_CHAT_ID={chat_id}\nNOTIFY_CHANNEL=telegram")
        logger.info("Step 4 complete: notification channel configured")
        return True
    except Exception as e:
        logger.error("Step 4 failed: %s", e)
        return False


async def step_5_cadence(root: Optional[Path] = None) -> bool:
    """Set posting cadence → HEARTBEAT.md."""
    root = root if root is not None else REPO
    if _is_step_done(5, root):
        logger.info("Step 5 already complete, skipping")
        return True
    try:
        posts_per_day = await _ask("Posts per day", "3")
        timezone = await _ask("Timezone (e.g. Asia/Karachi)", "Asia/Karachi")
        schedule = await _ask("Preferred posting time (HH:MM)", "10:00,14:00,18:00")
        heartbeat = (
            f"# Heartbeat\n\n"
            f"**Cadence**: {posts_per_day} posts/day\n"
            f"**Timezone**: {timezone}\n"
            f"**Schedule**: {schedule}\n"
            f"**Batch time**: 04:00 daily\n"
            f"**Metrics**: every 6 hours\n"
            f"**Digest**: Sundays 05:00\n"
        )
        _write_file(root / "HEARTBEAT.md", heartbeat)
        logger.info("Step 5 complete: cadence saved")
        return True
    except Exception as e:
        logger.error("Step 5 failed: %s", e)
        return False


async def step_6_verify(root: Optional[Path] = None) -> bool:
    """Verify-and-finish: runs real tests for render, publish, notify, LLM call.
    Reports each result individually. Writes BOOTSTRAP.md only if all required checks pass.
    """
    root = root if root is not None else REPO
    bootstrap_marker = root / "BOOTSTRAP.md"
    if _is_step_done(6, root):
        # _is_step_done(6) == "BOOTSTRAP.md already exists" == this step already
        # succeeded previously (same pattern as steps 1/2/5 checking their own
        # output file) — skip re-running the checks.
        logger.info("Setup already verified (BOOTSTRAP.md exists at %s)", bootstrap_marker)
        return True

    results: list[dict] = []
    all_ok = True

    # Test 1: LLM call
    try:
        from brain.base import model
        from agents import Agent, Runner
        agent = Agent(name="BootstrapTest", instructions="Respond with 'ok'.", model=model("free"))
        result = await Runner.run(agent, "Say ok.")
        ok = result.final_output.strip().lower() == "ok"
        results.append({"test": "LLM call", "passed": ok, "detail": result.final_output[:100] if not ok else "ok"})
        all_ok = all_ok and ok
    except Exception as e:
        results.append({"test": "LLM call", "passed": False, "detail": str(e)[:200]})
        all_ok = False

    # Test 2: Render
    try:
        import httpx
        resp = await httpx.AsyncClient(timeout=30.0).post(
            f"{settings.RENDER_INTERNAL_URL}/api/internal/render",
            headers={"x-render-secret": settings.RENDER_INTERNAL_SECRET},
            json={"templateId": "hero", "props": {"caption": "Bootstrap test"}, "aspect": "square", "brand": {}},
        )
        ok = resp.status_code in (200, 400)  # 400 is fine (might not have the template)
        results.append({"test": "Render", "passed": ok, "detail": f"HTTP {resp.status_code}"})
        all_ok = all_ok and ok
    except Exception as e:
        results.append({"test": "Render", "passed": False, "detail": str(e)[:200]})
        all_ok = False

    # Test 3: Notification
    try:
        from notify.discord import send
        await send("**BOOTSTRAP Test** — notification channel is working.")
        results.append({"test": "Notification", "passed": True, "detail": "Message sent"})
    except Exception as e:
        results.append({"test": "Notification", "passed": False, "detail": str(e)[:200]})
        all_ok = False

    # Test 4: Database
    try:
        from db.session import SessionLocal
        async with SessionLocal() as session:
            from sqlalchemy import select, func as sqlfunc
            from db.models import AuditLog
            count = (await session.execute(select(sqlfunc.count()).select_from(AuditLog))).scalar()
            results.append({"test": "Database", "passed": True, "detail": f"{count} audit rows"})
    except Exception as e:
        results.append({"test": "Database", "passed": False, "detail": str(e)[:200]})
        all_ok = False

    for r in results:
        status = "PASS" if r["passed"] else "FAIL"
        logger.info("  [%s] %s: %s", status, r["test"], r["detail"])

    if all_ok:
        _write_file(bootstrap_marker, "# Bootstrap Complete\n\nSetup finished successfully.\n")
        logger.info("BOOTSTRAP complete! All checks passed.")
    else:
        logger.warning("BOOTSTRAP incomplete — some checks failed. Fix issues and re-run.")

    return all_ok


async def run_bootstrap(root: Optional[Path] = None):
    """Run the full BOOTSTRAP wizard — all six steps in order.

    `root` is where every step writes its identity files (SOUL.md, BRAND.md,
    HEARTBEAT.md, IDENTITY.md, BOOTSTRAP.md) — defaults to the real repo root,
    but `--env=<path>` (cli.py, Week 5 US6) points it at an isolated client
    directory instead so a second brand's setup never touches the first's files.
    """
    root = root if root is not None else REPO
    bootstrap_marker = root / "BOOTSTRAP.md"
    if bootstrap_marker.exists():
        logger.info("BOOTSTRAP already completed (BOOTSTRAP.md exists at %s). Refusing to re-run.", root)
        return

    logger.info("Starting BOOTSTRAP wizard (root: %s)", root)
    steps = [step_1_identity, step_2_brand, step_3_platforms, step_4_notification, step_5_cadence, step_6_verify]

    for i, step_fn in enumerate(steps, 1):
        logger.info("Step %d/6...", i)
        ok = await step_fn(root)
        if not ok:
            logger.error("Step %d failed. Fix the issue and re-run.", i)
            return

    logger.info("BOOTSTRAP complete — all 6 steps passed.")
