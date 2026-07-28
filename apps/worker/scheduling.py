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

    if day.startswith("*/") and hour.isdigit() and minute.isdigit() and month == dow == "*":
        return f"Every {day[2:]} days at {_clock(hour, minute)}"

    if dow.isdigit() and hour.isdigit() and minute.isdigit() and day == month == "*":
        return f"Weekly on {WEEKDAYS[int(dow) % 7]} at {_clock(hour, minute)}"

    if day.isdigit() and hour.isdigit() and minute.isdigit() and month == dow == "*":
        return f"Monthly on day {day} at {_clock(hour, minute)}"

    if hour.isdigit() and minute.isdigit() and day == month == dow == "*":
        return f"Daily at {_clock(hour, minute)}"

    return cron


class InvalidSchedule(ValueError):
    pass


def build_cron(shape: str, n: int | None = None, hour: int = 0, minute: int = 0,
                day_of_week: int | None = None, day: int | None = None) -> str:
    """Inverse of humanize_cron — builds a cron string from a structured
    schedule shape chosen in the UI (POST /jobs/{id}/schedule). Raises
    InvalidSchedule for out-of-range input rather than silently producing a
    cron expression that doesn't mean what the operator picked."""
    if shape == "every_n_minutes":
        if n is None or not (1 <= n <= 59):
            raise InvalidSchedule("n must be 1-59 for every_n_minutes")
        return f"*/{n} * * * *"
    if shape == "every_n_hours":
        if n is None or not (1 <= n <= 23):
            raise InvalidSchedule("n must be 1-23 for every_n_hours")
        if not (0 <= minute <= 59):
            raise InvalidSchedule("minute must be 0-59")
        return f"{minute} */{n} * * *"
    if shape == "every_n_days":
        if n is None or not (1 <= n <= 27):
            raise InvalidSchedule("n must be 1-27 for every_n_days")
        if not (0 <= hour <= 23) or not (0 <= minute <= 59):
            raise InvalidSchedule("hour must be 0-23 and minute 0-59")
        return f"{minute} {hour} */{n} * *"
    if shape == "hourly":
        if not (0 <= minute <= 59):
            raise InvalidSchedule("minute must be 0-59")
        return f"{minute} * * * *"
    if shape == "daily":
        if not (0 <= hour <= 23) or not (0 <= minute <= 59):
            raise InvalidSchedule("hour must be 0-23 and minute 0-59")
        return f"{minute} {hour} * * *"
    if shape == "weekly":
        if day_of_week is None or not (0 <= day_of_week <= 6):
            raise InvalidSchedule("day_of_week must be 0 (Sunday) - 6 (Saturday) for weekly")
        if not (0 <= hour <= 23) or not (0 <= minute <= 59):
            raise InvalidSchedule("hour must be 0-23 and minute 0-59")
        return f"{minute} {hour} * * {day_of_week}"
    if shape == "monthly":
        # 29-31 don't exist in every month — capping at 28 keeps "monthly"
        # actually meaning every month, not skipping February most years.
        if day is None or not (1 <= day <= 28):
            raise InvalidSchedule("day must be 1-28 for monthly")
        if not (0 <= hour <= 23) or not (0 <= minute <= 59):
            raise InvalidSchedule("hour must be 0-23 and minute 0-59")
        return f"{minute} {hour} {day} * *"
    raise InvalidSchedule(f"unknown schedule shape: {shape}")
