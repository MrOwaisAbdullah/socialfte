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
2026-07-28 09:41:16 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-07-28 09:45:27 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-07-28 11:26:14 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-07-28 17:04:41 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-07-28 17:04:45 UTC | dispatch_render | dispatch_rejected | None | {'composition_id': 'HeroReveal', 'reason': 'GITHUB_TOKEN or GITHUB_REPO not configured'}
2026-07-28 17:08:55 UTC | dispatch_render | dispatch_rejected | None | {'composition_id': 'HeroReveal', 'reason': 'GITHUB_TOKEN or GITHUB_REPO not configured'}
2026-07-28 17:10:27 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-07-28 17:10:29 UTC | dispatch_render | dispatch_rejected | None | {'composition_id': 'HeroReveal', 'reason': 'GITHUB_TOKEN or GITHUB_REPO not configured'}
2026-07-28 18:20:19 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-07-28 19:01:15 UTC | dispatch_render | dispatch_rejected | None | {'composition_id': 'HeroReveal', 'reason': 'GITHUB_TOKEN or GITHUB_REPO not configured'}
2026-07-28 19:03:34 UTC | dispatch_render | dispatch_rejected | None | {'composition_id': 'HeroReveal', 'reason': 'GITHUB_TOKEN or GITHUB_REPO not configured'}
2026-07-28 19:05:29 UTC | dispatch_render | dispatch_rejected | None | {'composition_id': 'HeroReveal', 'reason': 'GITHUB_TOKEN or GITHUB_REPO not configured'}
2026-07-28 19:06:45 UTC | dispatch_render | dispatch_rejected | None | {'composition_id': 'HeroReveal', 'reason': 'GITHUB_TOKEN or GITHUB_REPO not configured'}
2026-07-28 19:07:01 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-07-28 19:07:04 UTC | dispatch_render | dispatch_rejected | None | {'composition_id': 'HeroReveal', 'reason': 'GITHUB_TOKEN or GITHUB_REPO not configured'}
2026-07-28 19:14:05 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-07-28 19:18:02 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-07-28 19:40:11 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-07-30 16:41:23 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-07-30 16:47:27 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-08-01 07:21:38 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-08-01 07:30:25 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-08-01 07:33:26 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-08-01 07:55:02 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-08-01 08:57:52 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-08-01 09:07:49 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-08-01 09:25:26 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-08-01 11:02:11 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-08-01 11:23:38 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-08-01 11:23:41 UTC | dispatch_render | dispatch_rejected | None | {'composition_id': 'HeroReveal', 'reason': 'GITHUB_TOKEN or GITHUB_REPO not configured'}
2026-08-01 14:10:00 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-08-01 14:39:56 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-08-01 14:40:03 UTC | dispatch_render | dispatch_rejected | None | {'composition_id': 'HeroReveal', 'reason': 'GITHUB_TOKEN or GITHUB_REPO not configured'}
2026-08-02 08:23:37 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-08-02 08:47:33 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-08-02 08:47:35 UTC | dispatch_render | dispatch_rejected | None | {'composition_id': 'HeroReveal', 'reason': 'GITHUB_TOKEN or GITHUB_REPO not configured'}
2026-08-02 11:33:08 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-08-02 12:25:33 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-08-02 12:25:36 UTC | dispatch_render | dispatch_rejected | None | {'composition_id': 'HeroReveal', 'reason': 'GITHUB_TOKEN or GITHUB_REPO not configured'}
2026-08-02 13:02:05 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-08-04 16:18:33 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-08-04 16:22:15 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-08-04 16:35:19 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-08-04 16:40:06 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-08-04 17:21:32 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-08-04 18:18:13 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
2026-08-04 18:33:52 UTC | collect_metrics | metrics_collected | post-1 | {'platform': 'facebook', 'window_24h': True, 'window_7d': True}
