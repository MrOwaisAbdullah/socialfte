# Environment Variables: Week 3 — Worker, Publishers, Discord, Cron

**Source**: `docs/socialfte-spec-v2.md §7`

---

## Worker Configuration

```bash
# ─────────────────────────────────────────────
# CORE
# ─────────────────────────────────────────────
NODE_ENV=production
APP_URL=https://social.yousufliving.com
SESSION_SECRET=                       # openssl rand -hex 32
TZ=Asia/Karachi

# ─────────────────────────────────────────────
# DATABASE — Neon
# ─────────────────────────────────────────────
DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/socialfte?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://...                # for migrations
EMBED_DIMENSIONS=1536                                 # must match MODEL_EMBED

# ─────────────────────────────────────────────
# REDIS — Upstash (queue + rate-limit counters)
# ─────────────────────────────────────────────
REDIS_URL=rediss://default:pass@xxx.upstash.io:6379
```

---

## Platform Credentials

### Meta (Facebook + Instagram)
```bash
META_APP_ID=
META_APP_SECRET=
META_PAGE_ID=
META_PAGE_TOKEN=                                      # from /me/accounts, long-lived
META_IG_USER_ID=                                      # instagram_business_account id
META_GRAPH_VERSION=v20.0
META_TOKEN_REFRESH_DAYS=7                             # refresh when expiry is this close
```

**Token refresh endpoint**:
```
GET https://graph.facebook.com/{META_GRAPH_VERSION}/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id={META_APP_ID}
  &client_secret={META_APP_SECRET}
  &fb_exchange_token={current_token}
```

### YouTube
```bash
YOUTUBE_CLIENT_SECRETS_PATH=/app/secrets/client_secrets.json
YOUTUBE_TOKEN_PATH=/app/secrets/token.json
YOUTUBE_CHANNEL_ID=
YOUTUBE_DEFAULT_CATEGORY=26                           # Howto & Style
YOUTUBE_PRIVACY_ON_UPLOAD=private                     # flip to public after manual review
```

### TikTok
```bash
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_ACCESS_TOKEN=
TIKTOK_MODE=draft_only                                # draft_only | direct_post
```

---

## Notification Channel

### Discord (default)
```bash
NOTIFY_CHANNEL=discord                                # discord | whatsapp | telegram

DISCORD_BOT_TOKEN=                                    # for sending messages
DISCORD_PUBLIC_KEY=                                   # for ed25519 webhook verification
DISCORD_APPLICATION_ID=
DISCORD_CHANNEL_ID=
```

**Discord bot permissions** (from §4a):
- Send Messages
- Attach Files
- Embed Links

**Discord webhook endpoint**:
```
POST /api/webhooks/discord
```

**Ed25519 verification**:
```typescript
import nacl from "tweetnacl";

const valid = nacl.sign.detached.verify(
  Buffer.from(ts + body),
  Buffer.from(sig, "hex"),
  Buffer.from(process.env.DISCORD_PUBLIC_KEY!, "hex"),
);
```

---

## Rendering

```bash
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
RENDER_INTERNAL_URL=http://yl-dashboard:3000          # docker network, worker → dashboard
RENDER_INTERNAL_SECRET=                               # shared secret on /api/internal/*
```

---

## Publishing Rules

```bash
CAP_TIKTOK_PER_DAY=3
CAP_INSTAGRAM_PER_DAY=2
CAP_INSTAGRAM_STORIES_PER_DAY=5
CAP_FACEBOOK_PER_DAY=2
CAP_YOUTUBE_PER_DAY=1
```

**Per-platform cap check query**:
```sql
SELECT COUNT(*) FROM posts
WHERE platform = :platform AND state = 'published'
AND published_at >= now() - interval '1 day';
```

---

## Worker-Specific

```bash
# ─────────────────────────────────────────────
# WORKER
# ─────────────────────────────────────────────
WORKER_HOST=0.0.0.0
WORKER_PORT=8000

# APScheduler
SCHEDULER_TIMEZONE=Asia/Karachi

# Token refresh
TOKEN_REFRESH_CRON=0 3 * * *                         # daily at 03:00
TOKEN_REFRESH_DAYS=7                                 # refresh when expiry is this close

# Publish due
PUBLISH_DUE_CRON=*/15 * * * *                       # every 15 minutes

# Notify review
NOTIFY_REVIEW_CRON=30 4 * * *                        # daily at 04:30
NOTIFY_REVIEW_BATCH_LIMIT=10                         # max posts per run
```

---

## Docker

```bash
# ─────────────────────────────────────────────
# DOCKER
# ─────────────────────────────────────────────
DOCKER_BUILD=1                                       # triggers output: 'standalone' in next.config.ts
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

---

## Missing (Not Yet Configured)

These are required but not yet set in the environment:

| Variable | Status | Notes |
|----------|--------|-------|
| META_APP_ID | Pending | From Facebook Developer Portal |
| META_APP_SECRET | Pending | From Facebook Developer Portal |
| META_PAGE_TOKEN | Pending | From Graph API Explorer |
| META_IG_USER_ID | Pending | From /{page-id}?fields=instagram_business_account |
| YOUTUBE_CLIENT_SECRETS_PATH | Pending | Mount into Docker container |
| YOUTUBE_TOKEN_PATH | Pending | Created by `python -m worker.auth.youtube` |
| TIKTOK_CLIENT_KEY | Pending | From TikTok Developer Portal |
| TIKTOK_ACCESS_TOKEN | Pending | From TikTok OAuth flow |
| DISCORD_BOT_TOKEN | Pending | From Discord Developer Portal |
| DISCORD_PUBLIC_KEY | Pending | From Discord Application → General Information |
| DISCORD_APPLICATION_ID | Pending | From Discord Application → General Information |
| DISCORD_CHANNEL_ID | Pending | Right-click channel → Copy Channel ID |

**Week 3 scope**: Code that reads these env vars. Actual values are operator-supplied.
