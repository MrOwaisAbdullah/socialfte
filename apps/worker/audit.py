"""Shared audit-log helper.

Every action the worker takes writes an AuditLog DB row (CLAUDE.md: "Audit log every
action. No action is too small to log"). This module is the single place that does that
write, so it's also the single place that mirrors the same action to AGENT_LOG.md at the
repo root — a human-readable, tail-able log an operator can watch without querying
Postgres. Previously every job/publisher module defined its own near-identical
`_write_audit` helper that only wrote the DB row; those are being consolidated into this
one shared function so the two logs can never drift apart.
"""
import logging
from datetime import datetime, timezone
from pathlib import Path

from db.models import AuditLog
from db.session import SessionLocal

logger = logging.getLogger("worker.audit")

REPO = Path(__file__).resolve().parent.parent.parent
AGENT_LOG_PATH = REPO / "AGENT_LOG.md"


def _append_to_agent_log(actor: str, action: str, subject_id: str | None, payload: dict | None) -> None:
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    line = f"{timestamp} | {actor} | {action} | {subject_id or '-'} | {payload or {}}\n"
    try:
        with open(AGENT_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(line)
    except OSError as e:
        # Never let a logging side-effect take down the actual job — the DB row above is
        # the source of truth, this file is a convenience mirror of it.
        logger.warning("Could not append to AGENT_LOG.md: %s", e)


async def write_audit(actor: str, action: str, subject_id: str | None = None, payload: dict | None = None) -> None:
    """Write an AuditLog DB row and mirror it to AGENT_LOG.md."""
    async with SessionLocal() as session:
        session.add(AuditLog(actor=actor, action=action, subject_id=subject_id, payload=payload))
        await session.commit()
    _append_to_agent_log(actor, action, subject_id, payload)
