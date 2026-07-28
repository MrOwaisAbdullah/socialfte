"""Worker configuration — pydantic-settings.

Week 3, Step 1: Reads every env var from docs/socialfte-spec-v2.md §7.
All values have sensible defaults; actual secrets are operator-supplied.
"""
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Environment variables for the SocialFTE worker."""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    # ─────────────────────────────────────────────
    # CORE
    # ─────────────────────────────────────────────
    NODE_ENV: str = Field(default="production")
    APP_URL: str = Field(default="")               # e.g. https://social.example.com — operator-supplied per client
    BRAND_NAME: str = Field(default="")             # display name shown in the dashboard shell/title (Week 5, FR-016)
    SESSION_SECRET: str = Field(default="")
    TZ: str = Field(default="Asia/Karachi")

    # ─────────────────────────────────────────────
    # DATABASE — Neon
    # ─────────────────────────────────────────────
    DATABASE_URL: str = Field(default="")
    DATABASE_URL_UNPOOLED: str = Field(default="")
    EMBED_DIMENSIONS: int = Field(default=1536)

    # ─────────────────────────────────────────────
    # REDIS — Upstash
    # ─────────────────────────────────────────────
    REDIS_URL: str = Field(default="")

    # ─────────────────────────────────────────────
    # STORAGE — Cloudflare R2
    # ─────────────────────────────────────────────
    R2_ACCOUNT_ID: str = Field(default="")
    R2_ACCESS_KEY_ID: str = Field(default="")
    R2_SECRET_ACCESS_KEY: str = Field(default="")
    R2_BUCKET: str = Field(default="")
    R2_ENDPOINT: str = Field(default="")
    R2_PUBLIC_URL: str = Field(default="")

    # ─────────────────────────────────────────────
    # META — Facebook Page + Instagram
    # ─────────────────────────────────────────────
    META_APP_ID: str = Field(default="")
    META_APP_SECRET: str = Field(default="")
    META_PAGE_ID: str = Field(default="")
    META_PAGE_TOKEN: str = Field(default="")
    META_IG_USER_ID: str = Field(default="")
    META_GRAPH_VERSION: str = Field(default="v25.0")
    META_TOKEN_REFRESH_DAYS: int = Field(default=7)

    # ─────────────────────────────────────────────
    # YOUTUBE
    # ─────────────────────────────────────────────
    YOUTUBE_CLIENT_SECRETS_PATH: str = Field(default="/app/secrets/client_secrets.json")
    YOUTUBE_TOKEN_PATH: str = Field(default="/app/secrets/token.json")
    YOUTUBE_CHANNEL_ID: str = Field(default="")
    YOUTUBE_DEFAULT_CATEGORY: int = Field(default=26)
    YOUTUBE_PRIVACY_ON_UPLOAD: str = Field(default="private")

    # ─────────────────────────────────────────────
    # TIKTOK
    # ─────────────────────────────────────────────
    TIKTOK_CLIENT_KEY: str = Field(default="")
    TIKTOK_CLIENT_SECRET: str = Field(default="")
    TIKTOK_ACCESS_TOKEN: str = Field(default="")
    TIKTOK_MODE: str = Field(default="draft_only")  # draft_only | direct_post

    # ─────────────────────────────────────────────
    # NOTIFICATION CHANNEL
    # ─────────────────────────────────────────────
    NOTIFY_CHANNEL: str = Field(default="discord")  # discord | whatsapp | telegram

    # Discord
    DISCORD_BOT_TOKEN: str = Field(default="")
    DISCORD_PUBLIC_KEY: str = Field(default="")
    DISCORD_APPLICATION_ID: str = Field(default="")
    DISCORD_CHANNEL_ID: str = Field(default="")

    # WhatsApp Business Cloud API
    WHATSAPP_PHONE_NUMBER_ID: str = Field(default="")
    WHATSAPP_TOKEN: str = Field(default="")
    WHATSAPP_VERIFY_TOKEN: str = Field(default="")
    WHATSAPP_TO: str = Field(default="")

    # Telegram
    TELEGRAM_BOT_TOKEN: str = Field(default="")
    TELEGRAM_CHAT_ID: str = Field(default="")

    # ─────────────────────────────────────────────
    # RENDERING
    # ─────────────────────────────────────────────
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: int = Field(default=1)
    PUPPETEER_EXECUTABLE_PATH: str = Field(default="/usr/bin/chromium")
    RENDER_INTERNAL_URL: str = Field(default="http://yl-dashboard:3000")
    RENDER_INTERNAL_SECRET: str = Field(default="")

    # ─────────────────────────────────────────────
    # PUBLISHING RULES
    # ─────────────────────────────────────────────
    CAP_TIKTOK_PER_DAY: int = Field(default=3)
    CAP_INSTAGRAM_PER_DAY: int = Field(default=2)
    CAP_INSTAGRAM_STORIES_PER_DAY: int = Field(default=5)
    CAP_FACEBOOK_PER_DAY: int = Field(default=2)
    CAP_YOUTUBE_PER_DAY: int = Field(default=1)

    # ─────────────────────────────────────────────
    # WORKER
    # ─────────────────────────────────────────────
    WORKER_HOST: str = Field(default="0.0.0.0")
    WORKER_PORT: int = Field(default=8000)
    SCHEDULER_TIMEZONE: str = Field(default="Asia/Karachi")

    # Cron schedules (default: from §9)
    TOKEN_REFRESH_CRON: str = Field(default="0 3 * * *")  # daily at 03:00
    PUBLISH_DUE_CRON: str = Field(default="*/15 * * * *")  # every 15 minutes
    NOTIFY_REVIEW_CRON: str = Field(default="30 4 * * *")  # daily at 04:30
    NOTIFY_REVIEW_BATCH_LIMIT: int = Field(default=10)

    # ─────────────────────────────────────────────
    # LLM GATEWAY — OpenRouter (Week 4, §7)
    # ─────────────────────────────────────────────
    OPENROUTER_API_KEY: str = Field(default="")
    OPENROUTER_SITE_URL: str = Field(default="")
    OPENROUTER_APP_NAME: str = Field(default="SocialFTE")

    MODEL_CAPTION: str = Field(default="deepseek/deepseek-v4-flash")
    MODEL_JUDGEMENT: str = Field(default="deepseek/deepseek-v4-pro")
    MODEL_VISION: str = Field(default="google/gemini-2.5-flash")
    MODEL_EMBED: str = Field(default="openai/text-embedding-3-small")
    # MODEL_FREE is what test_free_tier_round_trip and BOOTSTRAP's Step 6 LLM
    # check hit — OpenRouter has deprecated deepseek/deepseek-v4-flash:free
    # ("use this slug instead: deepseek/deepseek-v4-flash", a paid model, per
    # its own 404 response), so the current default fails for real whenever a
    # real API key is present. Other free-tier slugs confirmed available on
    # OpenRouter as of this writing (2026-07-28), any of which could replace
    # the default below:
    #   openai/gpt-oss-20b:free
    #   inclusionai/ling-3.0-flash:free
    #   cohere/north-mini-code:free
    #   nvidia/nemotron-3.5-content-safety:free
    #   google/gemma-4-26b-a4b-it:free
    #   nvidia/nemotron-3-ultra-550b-a55b:free
    #   nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free
    #   google/gemma-4-31b-it:free
    #   nvidia/nemotron-3-super-120b-a12b:free
    #   poolside/laguna-s-2.1:free
    # Not swapped in here yet — several of these are size/task-specialized
    # (code, safety, reasoning) rather than general chat, so picking the right
    # one for this dry-run-only round-trip check is a judgment call, not
    # swapped automatically.
    #
    # Free-tier embedding models (not chat — candidates for MODEL_EMBED
    # instead, if OpenAI's paid embedding model ever needs a free fallback):
    #   nvidia/nemotron-3-embed-1b:free
    #   nvidia/llama-nemotron-embed-vl-1b-v2:free
    MODEL_FREE: str = Field(default="deepseek/deepseek-v4-flash:free")

    LLM_MAX_RETRIES: int = Field(default=3)
    LLM_TIMEOUT_SECONDS: int = Field(default=120)

    # ─────────────────────────────────────────────
    # ANTI-REPEAT (Week 4)
    # ─────────────────────────────────────────────
    ANTI_REPEAT_TEMPLATE_WINDOW: int = Field(default=4)
    ANTI_REPEAT_ASSET_WINDOW: int = Field(default=10)
    ANTI_REPEAT_CAPTION_WINDOW: int = Field(default=30)
    ANTI_REPEAT_CAPTION_MAX_SIMILARITY: float = Field(default=0.85)
    ANTI_REPEAT_MAX_RETRIES: int = Field(default=5)

    # Cron schedules (Week 4, from §9)
    COMPOSE_BATCH_CRON: str = Field(default="0 4 * * *")  # daily at 04:00
    COLLECT_METRICS_CRON: str = Field(default="0 */6 * * *")  # every 6 hours
    WEEKLY_DIGEST_CRON: str = Field(default="0 5 * * 0")  # Sundays at 05:00

    MEMORY_MD_PATH: str = Field(default="MEMORY.md")

    # ─────────────────────────────────────────────
    # VIDEO RENDERING — GitHub Actions dispatch (Week 5)
    # ─────────────────────────────────────────────
    GITHUB_TOKEN: str = Field(default="")
    GITHUB_REPO: str = Field(default="")  # "owner/repo"
    RENDER_WORKFLOW_FILE: str = Field(default="render-video.yml")
    RENDER_POLL_INTERVAL_SECONDS: int = Field(default=30)
    RENDER_POLL_MAX_MINUTES: int = Field(default=15)
    PROCESS_FOOTAGE_CRON: str = Field(default="*/15 * * * *")
    MUSIC_BED_DB: int = Field(default=-18)
    MUSIC_BED_ID: str = Field(default="ambient-pad")  # id from media/library/music/catalog.json

    # ─────────────────────────────────────────────
    # OPTIONAL
    # ─────────────────────────────────────────────
    SENTRY_DSN: str = Field(default="")
    LOG_LEVEL: str = Field(default="info")


settings = Settings()
