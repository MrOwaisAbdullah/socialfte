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
    APP_URL: str = Field(default="https://social.yousufliving.com")
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
    R2_BUCKET: str = Field(default="yl-social")
    R2_ENDPOINT: str = Field(default="")
    R2_PUBLIC_URL: str = Field(default="https://media.yousufliving.com")

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
    # OPTIONAL
    # ─────────────────────────────────────────────
    SENTRY_DSN: str = Field(default="")
    LOG_LEVEL: str = Field(default="info")


settings = Settings()
