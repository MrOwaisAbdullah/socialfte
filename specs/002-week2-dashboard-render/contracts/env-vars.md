# Environment Variables — Dashboard Handoff (Story 8, FR-019)

Every variable `apps/dashboard/` actually reads, for the operator to fill in on
Dokploy. **No secret values are pre-filled here** — only names and, where safe,
non-secret defaults, per FR-019. Source: `docs/socialfte-spec-v2.md` §7 (the only
variables listed below are the subset the *dashboard* reads this week — the full
list also covers the worker, which isn't built until Week 3).

```bash
# Core
NODE_ENV=production
APP_URL=                              # e.g. https://social.yousufliving.com
SESSION_SECRET=                       # openssl rand -hex 32 — single shared session cookie (FR-008)
TZ=Asia/Karachi

# Database (Neon) — Drizzle client (research.md Decision 3)
DATABASE_URL=

# Storage (Cloudflare R2)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=                            # e.g. yl-social
R2_ENDPOINT=                          # https://<account-id>.r2.cloudflarestorage.com
R2_PUBLIC_URL=                        # e.g. https://media.yousufliving.com

# Rendering (Story 5)
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
RENDER_INTERNAL_SECRET=               # shared secret checked by /api/internal/render
```

## Not needed by the dashboard this week (listed in §7, but consumed by the worker starting Week 3)

`OPENROUTER_*`, `MODEL_*`, `REDIS_URL`, `META_*`, `YOUTUBE_*`, `TIKTOK_*`,
`DISCORD_*`/`WHATSAPP_*`/`TELEGRAM_*`, `GITHUB_*`, `CAP_*`,
`NO_TEMPLATE_REPEAT_WITHIN`, `NO_ASSET_REPEAT_WITHIN`,
`CAPTION_SIMILARITY_THRESHOLD`, `SCHEDULE_JITTER_MINUTES`, `EMBED_DIMENSIONS`.
`EMBED_DIMENSIONS` specifically is baked into `schema.sql`'s `caption_vec`
column at creation time (Story 1) rather than read at dashboard runtime — the
dashboard itself never computes an embedding.

## Compose service (`infra/docker-compose.yml`, Story 8)

Adds a single `yl-dashboard` service to the existing Dokploy project
(`docs/socialfte-spec-v2.md` §8) — does not modify or restart the already-running
Octively service on the same host (FR-018). The compose file references the
above variables by name (e.g. `env_file: .env` or Dokploy's own secret
injection) — it does not itself contain any secret value.
