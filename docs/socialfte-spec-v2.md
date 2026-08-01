# SocialFTE — Technical Spec v2

**Author:** Owais Abdullah · **Method:** SDD with Claude Code
**Supersedes:** `yl-social-fte-plan.md` and `socialfte-spec.md`
**Base repo:** fork of `hassancs91/claude-youtube-editor`
**Founding client:** Yousuf Living

---

## 1. The stack, and what each thing costs

| Layer | Choice | Cost |
|---|---|---|
| LLM gateway | OpenRouter (single key, all models) | pay-per-token, ~$1–2/mo at 200 posts |
| Model router | LiteLLM | free, self-hosted |
| Agent framework | OpenAI Agents SDK (Python) | free |
| Database | Neon Postgres + pgvector | free tier, scales to zero |
| Object storage | Cloudflare R2 (2nd bucket on existing account) | free tier, 10 GB, zero egress |
| Cache / queue | Upstash Redis | free tier |
| Dashboard | Next.js 15 + TypeScript | free |
| Static render | Puppeteer | free |
| Video render | Remotion on GitHub Actions | free (≤3 employees licence) |
| Media tools | ffmpeg, faster-whisper, RNNoise | free |
| Base images | Antigravity / AI Studio, batched manually | free tier |
| Notification | Discord bot | free |
| Hosting | Dokploy on existing VPS | already paid |
| **Total** | | **under $5/client/month** |

---

## 2. Model routing

### The vision question, settled

DeepSeek V4 Flash and V4 Pro are **text-only on every API you can actually call**. The
official DeepSeek docs list JSON mode, function calling, thinking mode, FIM, and 1M
context — no image, no vision, no multimodal. OpenRouter's model pages don't flag vision
either. Third-party claims about "DeepSeek Vision" refer to research architecture or
proprietary cloud wrappers (Tencent CloudBase), not the callable endpoint.

So vision jobs go to Gemini. Text jobs go to DeepSeek. This is a cost win anyway —
DeepSeek Flash is $0.09/M input, roughly the cheapest capable model available.

### Routing table

| Job | Model | OpenRouter ID | Input $/M |
|---|---|---|---|
| Caption writing, hashtags | DeepSeek V4 Flash | `deepseek/deepseek-v4-flash-latest` | 0.09 |
| Weekly digest, planning | DeepSeek V4 Flash | `deepseek/deepseek-v4-flash-latest` | 0.09 |
| Hero post, brand-voice audit | DeepSeek V4 Pro | `deepseek/deepseek-v4-pro` | 0.435 |
| Asset tagging (vision) | Gemini 2.5 Flash | `google/gemini-2.5-flash` | ~0.075 |
| Image quality gate (vision) | Gemini 2.5 Flash | `google/gemini-2.5-flash` | ~0.075 |
| Cover-frame selection (vision) | Gemini 2.5 Flash | `google/gemini-2.5-flash` | ~0.075 |
| Dev / testing | DeepSeek V4 Flash free | `deepseek/deepseek-v4-flash-latest:free` | 0 |
| Embeddings (anti-repeat) | OpenAI small | `openai/text-embedding-3-small` | 0.02 |

**Why OpenRouter and not direct APIs:** one key instead of four, automatic fallback when
a provider is down, and you swap models by changing a string. OpenRouter also does
prompt caching, which cuts repeated-context cost 60–80% — relevant because every agent
call re-sends SOUL.md + BRAND.md + AGENTS.md.

### LiteLLM config

`apps/worker/config/litellm.yaml`

```yaml
model_list:
  - model_name: caption
    litellm_params:
      model: openrouter/deepseek/deepseek-v4-flash-latest
      api_key: os.environ/OPENROUTER_API_KEY
      api_base: https://openrouter.ai/api/v1

  - model_name: judgement
    litellm_params:
      model: openrouter/deepseek/deepseek-v4-pro
      api_key: os.environ/OPENROUTER_API_KEY
      api_base: https://openrouter.ai/api/v1

  - model_name: vision
    litellm_params:
      model: openrouter/google/gemini-2.5-flash
      api_key: os.environ/OPENROUTER_API_KEY
      api_base: https://openrouter.ai/api/v1

  - model_name: embed
    litellm_params:
      model: openrouter/openai/text-embedding-3-small
      api_key: os.environ/OPENROUTER_API_KEY

router_settings:
  routing_strategy: simple-shuffle
  num_retries: 3
  fallbacks:
    - caption: ["judgement"]
    - vision: ["judgement"]

litellm_settings:
  drop_params: true
  set_verbose: false
```

Every agent asks for `caption`, `judgement`, or `vision` — never a provider name.
Swapping DeepSeek for Qwen or Kimi later is a one-line change in this file.

### Agents SDK wiring

```python
# apps/worker/agents/base.py
from agents import Agent, ModelSettings
from agents.extensions.models.litellm_model import LitellmModel
import os

OR_KEY = os.environ["OPENROUTER_API_KEY"]

def model(name: str) -> LitellmModel:
    return LitellmModel(
        model=f"openrouter/{MODEL_MAP[name]}",
        api_key=OR_KEY,
    )

MODEL_MAP = {
    "caption":   "deepseek/deepseek-v4-flash-latest",
    "judgement": "deepseek/deepseek-v4-pro",
    "vision":    "google/gemini-2.5-flash",
    "free":      "deepseek/deepseek-v4-flash-latest:free",
}

caption_agent = Agent(
    name="CaptionWriter",
    instructions=load_prompt("SOUL.md", "BRAND.md", "skills/caption-writer"),
    model=model("caption"),
    model_settings=ModelSettings(temperature=0.8),
)

vision_agent = Agent(
    name="AssetTagger",
    instructions=load_prompt("skills/asset-tagging"),
    model=model("vision"),
    model_settings=ModelSettings(temperature=0.2),
)
```

---

## 3. Where the free tools actually fit

This is the part that causes confusion. Antigravity, OpenCode, and Claude Code are
**development and manual-task surfaces**. They are not APIs. Nothing in the cron pipeline
calls them.

| Tool | Used for | In the automated pipeline? |
|---|---|---|
| **Antigravity** | Generating the base image library, once per quarter. You sit there, prompt, curate, download | No |
| **Claude Code** | Writing the code, running SDD checkpoints, editing skills | No |
| **OpenCode** | Same as Claude Code but MIT-licensed and model-agnostic — useful if you want it on the VPS | No |
| **OpenRouter** | Every runtime LLM call | Yes — this is the only one |

### The image library, concretely

```
ONCE PER QUARTER (manual, ~2 sessions):
  Antigravity or AI Studio
    → 40 room renders across tier 1/2/3 × standard/bridal
    → you curate down to the best 25
    → upload via dashboard Assets screen
    → Gemini Flash tags each one (piece, tier, variant, quality score)
    → stored in R2 + assets table

EVERY DAY (automated, free):
  composer picks an asset from the library
    → picks a template
    → DeepSeek Flash writes the caption
    → Puppeteer composites template over the asset
    → PNG to R2
```

No image generation in the pipeline. The library is generated by hand and remixed
infinitely by code. This is why free-tier image quotas never become a blocker.

If you later want generated images in the pipeline, the path is Gemini's image model via
OpenRouter — but a rate-limited free tier will stall a 3 a.m. batch job. Keep the library
approach.

---

## 4. Notification channel — Discord is the default

**Telegram is out for Pakistan.** It requires a VPN, which kills it for any client-facing
deployment and makes it unreliable for you too. Discord works without a VPN and has a
better approval UX anyway (real buttons, not text replies).

Order of support:

1. **Discord** — default, built first
2. **WhatsApp Business Cloud API** — built second, for non-technical clients
3. **Telegram** — supported in code, off by default

All three implement one interface:

```python
class Notifier(Protocol):
    async def send(self, text: str, media_url: str | None = None) -> str: ...
    async def send_approval(self, post: Post) -> str: ...
```

The worker never knows which one is active. `NOTIFY_CHANNEL=discord` switches it.

### 4a. Discord setup (full flow)

Webhooks can send but cannot receive button clicks. For approve/skip buttons you need a
bot application.

**Setup steps (goes in BOOTSTRAP wizard):**

```
1. https://discord.com/developers/applications → New Application
2. Bot tab → Reset Token → copy → DISCORD_BOT_TOKEN
3. General Information → copy Public Key → DISCORD_PUBLIC_KEY
4. OAuth2 → URL Generator
     scopes: bot, applications.commands
     permissions: Send Messages, Attach Files, Embed Links
   → open the generated URL → add bot to your server
5. In Discord: right-click your channel → Copy Channel ID → DISCORD_CHANNEL_ID
   (needs Developer Mode on: Settings → Advanced → Developer Mode)
6. Back in the portal: General Information → Interactions Endpoint URL
     https://social.yourbrand.com/api/webhooks/discord
   Discord sends a PING to verify — your endpoint must respond correctly or it rejects
```

**Sending an approval card:**

```python
# apps/worker/notify/discord.py
import httpx, os

API = "https://discord.com/api/v10"
HEADERS = {"Authorization": f"Bot {os.environ['DISCORD_BOT_TOKEN']}"}

async def send_approval(post):
    payload = {
        "embeds": [{
            "title": f"{post.platform.upper()} · {post.format}",
            "description": post.caption[:2000],
            "image": {"url": post.render_url},
            "footer": {"text": f"Scheduled {post.scheduled_at:%a %d %b, %H:%M}"},
            "color": 0x1B4332,  # brand primary
        }],
        "components": [{
            "type": 1,
            "components": [
                {"type": 2, "style": 3, "label": "Approve",
                 "custom_id": f"approve:{post.id}"},
                {"type": 2, "style": 2, "label": "Edit",
                 "custom_id": f"edit:{post.id}"},
                {"type": 2, "style": 4, "label": "Skip",
                 "custom_id": f"skip:{post.id}"},
            ],
        }],
    }
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{API}/channels/{os.environ['DISCORD_CHANNEL_ID']}/messages",
            headers=HEADERS, json=payload,
        )
    return r.json()["id"]
```

**Receiving the button click** — the dashboard handles this, because Discord requires a
public HTTPS endpoint and the dashboard already has one.

```typescript
// apps/dashboard/app/api/webhooks/discord/route.ts
import nacl from "tweetnacl";

export async function POST(req: Request) {
  const sig  = req.headers.get("x-signature-ed25519")!;
  const ts   = req.headers.get("x-signature-timestamp")!;
  const body = await req.text();

  // Discord requires ed25519 signature verification or it deactivates your endpoint
  const valid = nacl.sign.detached.verify(
    Buffer.from(ts + body),
    Buffer.from(sig, "hex"),
    Buffer.from(process.env.DISCORD_PUBLIC_KEY!, "hex"),
  );
  if (!valid) return new Response("bad signature", { status: 401 });

  const body_ = JSON.parse(body);
  if (body_.type === 1) return Response.json({ type: 1 });      // PING → PONG

  if (body_.type === 3) {                                        // button click
    const [action, postId] = body_.data.custom_id.split(":");
    const state = { approve: "approved", skip: "skipped" }[action];
    if (state) await db.update(posts).set({ state }).where(eq(posts.id, postId));
    return Response.json({
      type: 7,  // UPDATE_MESSAGE — edits the original card in place
      data: { content: `**${action.toUpperCase()}D**`, components: [] },
    });
  }
}
```

That `type: 1 → PONG` branch is not optional. Discord pings the endpoint on save and
periodically after; fail it and the endpoint is disabled silently.

### 4b. WhatsApp Business Cloud API

Same Meta app you use for Facebook and Instagram — one developer app, three products.

```
1. developers.facebook.com → your app → Add Product → WhatsApp
2. API Setup → note the test phone number ID → WHATSAPP_PHONE_NUMBER_ID
3. Add your own number as a recipient (test mode allows 5)
4. For production: Business Settings → System Users → create one
     → Generate Token with whatsapp_business_messaging + whatsapp_business_management
     → this token does NOT expire → WHATSAPP_TOKEN
5. Configuration → Webhook → https://social.yourbrand.com/api/webhooks/whatsapp
     verify token → WHATSAPP_VERIFY_TOKEN
     subscribe to: messages
```

**The 24-hour window rule:** you can send free-form interactive messages only within 24h
of the user messaging you. Outside that, you need a pre-approved template. Practical
workaround: your daily digest at 04:00 is a **template** message ("You have {n} posts to
review"), you reply anything, and that opens a 24h window in which all the individual
approval cards are free-form and free.

```python
# apps/worker/notify/whatsapp.py
async def send_approval(post):
    payload = {
        "messaging_product": "whatsapp",
        "to": os.environ["WHATSAPP_TO"],
        "type": "interactive",
        "interactive": {
            "type": "button",
            "header": {"type": "image", "image": {"link": post.render_url}},
            "body": {"text": post.caption[:1024]},
            "action": {"buttons": [
                {"type": "reply", "reply": {"id": f"approve:{post.id}", "title": "Approve"}},
                {"type": "reply", "reply": {"id": f"skip:{post.id}",    "title": "Skip"}},
            ]},
        },
    }
    url = f"https://graph.facebook.com/v20.0/{os.environ['WHATSAPP_PHONE_NUMBER_ID']}/messages"
    ...
```

### 4c. Telegram (supported, off by default)

```
1. Message @BotFather → /newbot → copy token → TELEGRAM_BOT_TOKEN
2. Message your new bot once
3. GET https://api.telegram.org/bot{token}/getUpdates → read chat.id → TELEGRAM_CHAT_ID
4. Set webhook:
   POST https://api.telegram.org/bot{token}/setWebhook
   { "url": "https://social.yourbrand.com/api/webhooks/telegram" }
```

Inline keyboard buttons work the same way as Discord's. Keep the code, default it off.

---

## 5. Platform connections

### Meta (Facebook Page + Instagram) — one token covers both

```
1. developers.facebook.com/apps → Create App → type: Business
2. Add Product → Facebook Login for Business, and → Instagram
3. Instagram must be a Business or Creator account, linked to the FB Page
4. Permissions needed:
     pages_show_list
     pages_read_engagement
     pages_manage_posts
     instagram_basic
     instagram_content_publish
     instagram_manage_insights
     read_insights
5. Graph API Explorer → generate a User Token with those scopes
6. Exchange for a long-lived token (~60 days):
     GET /oauth/access_token
       ?grant_type=fb_exchange_token
       &client_id={app-id}
       &client_secret={app-secret}
       &fb_exchange_token={short-lived-token}
7. Get the Page token (this one does NOT expire if derived from a long-lived user token):
     GET /me/accounts  → data[].access_token → META_PAGE_TOKEN
8. Get the IG business account id:
     GET /{page-id}?fields=instagram_business_account → META_IG_USER_ID
```

**Media must be at a public URL.** Meta fetches server-side. This is why R2 with a public
prefix on `media.yourbrand.com` is required, not optional.

**Token refresh cron runs daily at 03:00.** Even though Page tokens derived from long-lived
user tokens don't expire, the user token behind them does. Refresh it before day 55 or
publishing dies silently.

### YouTube

```
1. console.cloud.google.com → new project
2. Enable "YouTube Data API v3"
3. Credentials → Create → OAuth client ID → type: Desktop app
4. Download client_secrets.json → mount into worker container
5. First run: python -m worker.auth.youtube
     → opens browser → consent → writes token.json (refresh token, long-lived)
6. Scope: https://www.googleapis.com/auth/youtube.upload
```

Free, no card. `tools/yt_upload.py` from the cloned repo already handles the OAuth dance
and the A/V drift checks — retarget it to 9:16 and add `#Shorts`.

### TikTok

Unaudited API clients can only post `SELF_ONLY`. The audit is a serial multi-week review.
For the first 90 days, don't fight it:

```
Pipeline renders the video → uploads to R2 → writes a posts row in state 'approved'
→ Discord card says "TikTok ready — tap to download" with the R2 link
→ you download and upload in the TikTok app (about 20 seconds)
```

Build `publishers/tiktok.py` with a `DRAFT_ONLY` flag so the audited path can be switched
on later without a rewrite.

---

## 6. BOOTSTRAP — the onboarding flow

Runs once. Available two ways: `python -m worker bootstrap` (CLI) or the dashboard's
`/setup` route. Writes the identity files, then deletes `BOOTSTRAP.md`.

### Step 1 — Agent identity
```
Agent name?                          [Sora]
Communication style?                 (direct / warm / playful)
→ writes SOUL.md, IDENTITY.md
```

### Step 2 — Brand
```
Brand name?                          [Yousuf Living]
Tagline?                             [Workshop Price. Showroom Quality.]
Primary product category?            [bedroom furniture]
Price range (currency + low/high)?   [PKR 190,000 – 330,000]
Primary colour (hex)?                [#1B4332]
Accent colour (hex)?                 [#C9A227]
Heading font?                        [Instrument Serif]
Body font?                           [Archivo]
Logo upload                          → R2
Languages for captions?              (English / Roman Urdu / mixed)
Mention prices in captions?          (always / sometimes / never)
Primary CTA?                         (WhatsApp / visit showroom / website)
→ writes BRAND.md + packages/remotion/src/brand.ts + fonts.ts
→ runs /brand-setup skill, renders a proof card so you see it before continuing
```

### Step 3 — Platforms
```
Which platforms?                     [x] Facebook  [x] Instagram
                                     [x] YouTube   [x] TikTok
For each → OAuth flow (§5) → tokens written to credentials table
→ writes active platform list to TOOLS.md
```

### Step 4 — Notification channel
```
Channel?                             (Discord / WhatsApp / Telegram)
→ walks the setup for the chosen one (§4)
→ sends a test message, waits for you to confirm you received it
→ writes NOTIFY_CHANNEL + credentials to .env
```

### Step 5 — Cadence
```
Posts per day:
  TikTok           [2]   (max 3)
  Instagram Reels  [1]   (max 2)
  Instagram Stories[3]   (max 5)
  Facebook         [1]   (max 2)
  YouTube Shorts   [1]   (max 1)
Preferred posting hours?             [11:00, 15:00, 20:00]
Timezone?                            [Asia/Karachi]
→ writes HEARTBEAT.md
```

### Step 6 — Verify and finish
```
✓ Test render (template + dummy props → PNG in R2)
✓ Test post to each platform (private/draft)
✓ Test notification delivered
✓ Test LLM call through OpenRouter
✓ Delete BOOTSTRAP.md
```

Nothing about the client is hardcoded. A second client is a fresh deployment plus a
30-minute wizard run.

---

## 7. Complete environment variables

`.env.example`

```bash
# ─────────────────────────────────────────────
# CORE
# ─────────────────────────────────────────────
NODE_ENV=production
APP_URL=https://social.yousufliving.com
SESSION_SECRET=                       # openssl rand -hex 32
TZ=Asia/Karachi

# ─────────────────────────────────────────────
# LLM GATEWAY — OpenRouter (single key, all models)
# ─────────────────────────────────────────────
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_SITE_URL=https://social.yousufliving.com   # sent as HTTP-Referer, improves rate limits
OPENROUTER_APP_NAME=SocialFTE                         # sent as X-Title

MODEL_CAPTION=deepseek/deepseek-v4-flash-latest
MODEL_JUDGEMENT=deepseek/deepseek-v4-pro
MODEL_VISION=google/gemini-2.5-flash
MODEL_EMBED=openai/text-embedding-3-small
MODEL_FREE=deepseek/deepseek-v4-flash-latest:free            # dev/testing only

LLM_MAX_RETRIES=3
LLM_TIMEOUT_SECONDS=120

# ─────────────────────────────────────────────
# DATABASE — Neon
# ─────────────────────────────────────────────
DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/socialfte?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://...                # for migrations
EMBED_DIMENSIONS=1536                                 # must match MODEL_EMBED, never change after first write

# ─────────────────────────────────────────────
# REDIS — Upstash (queue + rate-limit counters)
# ─────────────────────────────────────────────
REDIS_URL=rediss://default:pass@xxx.upstash.io:6379

# ─────────────────────────────────────────────
# STORAGE — Cloudflare R2 (second bucket, existing account)
# ─────────────────────────────────────────────
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=yl-social
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_PUBLIC_URL=https://pub-9482aec63df7420bb53018258d2b14ef.r2.dev  # public R2.dev subdomain — Meta fetches media server-side, must be public

# ─────────────────────────────────────────────
# META — Facebook Page + Instagram (one app)
# ─────────────────────────────────────────────
META_APP_ID=
META_APP_SECRET=
META_PAGE_ID=
META_PAGE_TOKEN=                                      # from /me/accounts, long-lived
META_IG_USER_ID=                                      # instagram_business_account id
META_GRAPH_VERSION=v20.0
META_TOKEN_REFRESH_DAYS=7                             # refresh when expiry is this close

# ─────────────────────────────────────────────
# YOUTUBE
# ─────────────────────────────────────────────
YOUTUBE_CLIENT_SECRETS_PATH=/app/secrets/client_secrets.json
YOUTUBE_TOKEN_PATH=/app/secrets/token.json
YOUTUBE_CHANNEL_ID=
YOUTUBE_DEFAULT_CATEGORY=26                           # Howto & Style
YOUTUBE_PRIVACY_ON_UPLOAD=private                     # flip to public after manual review

# ─────────────────────────────────────────────
# TIKTOK  (draft-only until audited)
# ─────────────────────────────────────────────
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_ACCESS_TOKEN=
TIKTOK_MODE=draft_only                                # draft_only | direct_post

# ─────────────────────────────────────────────
# NOTIFICATION CHANNEL
# ─────────────────────────────────────────────
NOTIFY_CHANNEL=discord                                # discord | whatsapp | telegram

# Discord (default — works in Pakistan without VPN)
DISCORD_BOT_TOKEN=
DISCORD_PUBLIC_KEY=                                   # for ed25519 webhook verification
DISCORD_APPLICATION_ID=
DISCORD_CHANNEL_ID=

# WhatsApp Business Cloud API (same Meta app as above)
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_TOKEN=                                       # system-user token, does not expire
WHATSAPP_VERIFY_TOKEN=                                # any string you choose
WHATSAPP_TO=                                          # your number, E.164, no +

# Telegram (off by default — needs VPN in Pakistan)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# ─────────────────────────────────────────────
# RENDERING
# ─────────────────────────────────────────────
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
RENDER_INTERNAL_URL=http://yl-dashboard:3000          # docker network, worker → dashboard
RENDER_INTERNAL_SECRET=                               # shared secret on /api/internal/*

# Remotion renders on GitHub Actions, not the VPS (memory)
GITHUB_TOKEN=                                         # repo scope, for workflow_dispatch
GITHUB_REPO=MrOwaisAbdullah/socialfte
GITHUB_RENDER_WORKFLOW=render-video.yml

# ─────────────────────────────────────────────
# PUBLISHING RULES
# ─────────────────────────────────────────────
CAP_TIKTOK_PER_DAY=3
CAP_INSTAGRAM_PER_DAY=2
CAP_INSTAGRAM_STORIES_PER_DAY=5
CAP_FACEBOOK_PER_DAY=2
CAP_YOUTUBE_PER_DAY=1

NO_TEMPLATE_REPEAT_WITHIN=4                           # posts
NO_ASSET_REPEAT_WITHIN=10                             # posts
CAPTION_SIMILARITY_THRESHOLD=0.85                     # cosine, reject above
SCHEDULE_JITTER_MINUTES=20                            # ±

# ─────────────────────────────────────────────
# OPTIONAL
# ─────────────────────────────────────────────
SENTRY_DSN=
LOG_LEVEL=info
```

---

## 8. Service topology on the VPS

```
Dokploy project: socialfte-yl
│
├── yl-dashboard        Next.js + Chromium
│                       → social.yousufliving.com
│                       → /api/internal/render     (called by worker)
│                       → /api/webhooks/discord    (called by Discord)
│                       → /api/webhooks/whatsapp   (called by Meta)
│
├── yl-worker           Python + FastAPI + APScheduler
│                       → no public domain, docker network only
│                       → memory limit 1G (hard)
│
└── (external)
    Neon Postgres       free tier, scales to zero
    Upstash Redis       free tier
    Cloudflare R2       pub-*.r2.dev (public subdomain)
    GitHub Actions      Remotion video renders
```

Existing `octively.com` stays untouched in its own project. Set the worker's memory limit
explicitly — a runaway job must not be able to starve Octively.

---

## 9. Cron schedule

```
*/15 * * * *   publish_due        approved posts past scheduled_at
0    */6 * * * collect_metrics    24h and 7d windows
0    3  * * *  refresh_tokens     Meta user token, before day 55
0    4  * * *  compose_batch      draft tomorrow's posts
30   4  * * *  notify_review      send approval cards to Discord
0    5  * * 0  weekly_digest      performance summary → MEMORY.md
```

Deterministic APScheduler in the worker. Antigravity and Claude scheduled tasks are for
the thinking jobs only — never publishing.

---

## 10. Build order

**Week 1 — identity + library.** Strip the repo. Run `/brand-setup`. Write SOUL.md,
AGENTS.md, BRAND.md, HEARTBEAT.md by hand for Yousuf Living. Generate 25 base renders in
Antigravity. Post manually at cadence.

**Week 2 — render + dashboard.** Neon schema. Next.js on Dokploy. 6 template components
from the popup design. `/api/internal/render` with Puppeteer → R2. Assets and Templates
screens.

**Week 3 — mouth + Discord.** Python worker. `meta_mcp.py`. **Token refresh cron first.**
`yt_upload.py` retargeted. TikTok draft-only. Discord bot + interactions endpoint. Queue
screen. `publish_due` cron.

**Week 4 — brain + loop.** OpenRouter/LiteLLM routing. Caption agent + humanizer +
pgvector anti-repeat. `collect_metrics` + Performance screen. Weekly digest → MEMORY.md.
Audit log everywhere. **BOOTSTRAP wizard** — written last, because by now you know exactly
what it needs to produce.

**Week 5 — motion + generalise.** Remotion compositions. GitHub Actions render dispatch.
Calendar screen. Strip every Yousuf Living hardcode into BRAND.md. Provision a second
client to test the 30-minute onboarding. Write the runbook.

---

## 11. The two things that will actually break

**Meta token expiry.** Long-lived user tokens last ~60 days. The refresh cron is a week-3
task, not a week-5 one. Add an alert when `credentials.expires_at < now() + 7 days`.

**Remotion memory on a shared VPS.** Video rendering spawns concurrent Chromium instances
and wants 4 GB+. On a box also running Octively, it will OOM something. Render on GitHub
Actions (free, 7 GB runners) and set a hard memory cap on the worker container regardless.
