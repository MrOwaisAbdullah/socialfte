# HEARTBEAT

Cron checklist for the SocialFTE worker. Deterministic APScheduler jobs only —
never the publishing path itself driven by an ad-hoc agent call.

| Schedule | Job | What it does |
|---|---|---|
| `*/15 * * * *` | `publish_due` | Publish approved posts past their `scheduled_at`. |
| `0 */6 * * *` | `collect_metrics` | Pull 24h and 7d performance windows for published posts. |
| `0 3 * * *` | `refresh_tokens` | Refresh any platform credential expiring within 7 days. |
| `0 4 * * *` | `compose_batch` | Draft tomorrow's posts. |
| `30 4 * * *` | `notify_review` | Send approval cards for drafted posts to Discord. |
| `0 5 * * 0` | `weekly_digest` | Summarize the week's performance → `MEMORY.md`. |

## Notes

- `refresh_tokens` runs before `compose_batch` and `notify_review` each day — a
  post should never enter the queue on a token that's about to expire.
- `publish_due` runs most frequently (every 15 minutes) because approval timing is
  unpredictable; the other jobs are once- or twice-daily.
- Any job that fails writes to the audit log and notifies the channel immediately
  (see `AGENTS.md`'s failure protocol) — it does not wait for the next scheduled run
  to report the problem.
