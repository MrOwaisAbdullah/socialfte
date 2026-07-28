"""Tests for cron <-> human-friendly schedule text (scheduling.py)."""
import pytest
from apscheduler.triggers.cron import CronTrigger

from scheduling import trigger_to_cron, humanize_cron


@pytest.mark.parametrize(
    "cron,expected_text",
    [
        ("0 3 * * *", "Daily at 3:00 AM"),
        ("*/15 * * * *", "Every 15 minutes"),
        ("30 4 * * *", "Daily at 4:30 AM"),
        ("0 4 * * *", "Daily at 4:00 AM"),
        ("0 */6 * * *", "Every 6 hours"),
        ("0 5 * * 0", "Weekly on Sunday at 5:00 AM"),
        ("0 5 * * 1", "Weekly on Monday at 5:00 AM"),
        ("0 9 15 * *", "Monthly on day 15 at 9:00 AM"),
        ("30 * * * *", "Hourly at :30"),
        ("15 13 * * *", "Daily at 1:15 PM"),
        ("0 0 * * *", "Daily at 12:00 AM"),
        ("0 12 * * *", "Daily at 12:00 PM"),
    ],
)
def test_trigger_roundtrip_and_humanize(cron, expected_text):
    """Every real cron pattern this app uses reconstructs exactly from the
    APScheduler trigger and humanizes to the expected text."""
    trigger = CronTrigger.from_crontab(cron)
    reconstructed = trigger_to_cron(trigger)
    assert reconstructed == cron
    assert humanize_cron(reconstructed) == expected_text


def test_humanize_falls_back_on_unsupported_shape():
    """A cron shape none of the known patterns cover (a list of specific
    days) returns the raw expression rather than a wrong/misleading label."""
    assert humanize_cron("0 9 1,15 * *") == "0 9 1,15 * *"


def test_humanize_falls_back_on_malformed_input():
    assert humanize_cron("not a cron") == "not a cron"
