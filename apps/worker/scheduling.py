"""Cron <-> human-friendly schedule text, and APScheduler CronTrigger
introspection. Used by main.py's GET /jobs (display) and, later, the
schedule-editing endpoint (building a cron string back from a structured
UI choice).
"""
from apscheduler.triggers.cron import CronTrigger

CRON_FIELD_ORDER = ["minute", "hour", "day", "month", "day_of_week"]
WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]


def trigger_to_cron(trigger: CronTrigger) -> str:
    """Reconstruct a standard 5-field cron string (minute hour day month
    day_of_week) from an APScheduler CronTrigger. APScheduler's own
    str(trigger) is a verbose "cron[month='*', day='*', ...]" repr, not a
    usable cron expression — this is what the dashboard's Jobs page actually
    needs to show something readable."""
    fields = {f.name: str(f) for f in trigger.fields}
    return " ".join(fields.get(name, "*") for name in CRON_FIELD_ORDER)


def _clock(hour: str, minute: str) -> str:
    h, m = int(hour), int(minute)
    suffix = "AM" if h < 12 else "PM"
    h12 = h % 12 or 12
    return f"{h12}:{m:02d} {suffix}"


def humanize_cron(cron: str) -> str:
    """Best-effort human-friendly text for the simple cron shapes this app
    actually uses (every N minutes/hours, daily, weekly, monthly at a fixed
    time) — falls back to the raw cron string for anything more complex than
    that (ranges, lists, step values on day/month, etc.)."""
    parts = cron.split()
    if len(parts) != 5:
        return cron
    minute, hour, day, month, dow = parts

    if minute.startswith("*/") and hour == day == month == dow == "*":
        return f"Every {minute[2:]} minutes"

    if hour.startswith("*/") and minute.isdigit() and day == month == dow == "*":
        return f"Every {hour[2:]} hours"

    if hour == "*" and minute.isdigit() and day == month == dow == "*":
        return f"Hourly at :{int(minute):02d}"

    if dow.isdigit() and hour.isdigit() and minute.isdigit() and day == month == "*":
        return f"Weekly on {WEEKDAYS[int(dow) % 7]} at {_clock(hour, minute)}"

    if day.isdigit() and hour.isdigit() and minute.isdigit() and month == dow == "*":
        return f"Monthly on day {day} at {_clock(hour, minute)}"

    if hour.isdigit() and minute.isdigit() and day == month == dow == "*":
        return f"Daily at {_clock(hour, minute)}"

    return cron
