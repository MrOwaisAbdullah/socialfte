# Agent Log

A running, human-readable log of every action the SocialFTE worker takes — mirrors every
`audit_log` database row (`CLAUDE.md`: "Audit log every action. No action is too small to
log") so an operator can `tail -f` or grep one file instead of querying Postgres.

Written by `apps/worker/audit.py`'s `write_audit()`, which every job/publisher/agent calls
alongside its `AuditLog` DB insert. One line per action, oldest first (append-only), in the
form:

```
YYYY-MM-DD HH:MM:SS UTC | actor | action | subject_id | payload
```

This file grows without bound — rotate/truncate it periodically in production if it gets
too large to be useful (it is not the source of truth; the `audit_log` table is).

---
2026-07-27 20:37:25 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-07-28 07:02:33 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-07-28 07:02:38 UTC | dispatch_render | dispatch_sent | None | {'composition_id': 'HeroReveal', 'output_key': 'renders/None.mp4', 'run_id': None}
2026-07-28 07:03:55 UTC | dispatch_render | dispatch_sent | None | {'composition_id': 'HeroReveal', 'output_key': 'renders/None.mp4', 'run_id': None}
2026-07-28 07:04:31 UTC | dispatch_render | dispatch_sent | None | {'composition_id': 'HeroReveal', 'output_key': 'renders/None.mp4', 'run_id': None}
2026-07-28 07:06:34 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
