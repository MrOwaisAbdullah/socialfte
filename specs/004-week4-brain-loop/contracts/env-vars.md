# Environment Variables: Week 4 — Brain, Loop, and Bootstrap

New variables this feature adds to `apps/worker/config.py`'s `Settings`, sourced
from docs/socialfte-spec-v2.md §7. All Week 1–3 variables are unchanged.

| Variable | Default | Used by |
|---|---|---|
| `OPENROUTER_API_KEY` | `""` | Every LLM call (caption, judgement, vision, embed) — required, no fallback |
| `OPENROUTER_SITE_URL` | `"https://social.yousufliving.com"` | Sent as `HTTP-Referer` header — improves OpenRouter rate limits, not brand-specific despite the default (FR-019 still applies: read from config, don't hardcode in code) |
| `OPENROUTER_APP_NAME` | `"SocialFTE"` | Sent as `X-Title` header |
| `MODEL_CAPTION` | `"deepseek/deepseek-v4-flash-latest"` | `agents/composer.py`'s caption_agent |
| `MODEL_JUDGEMENT` | `"google/gemini-3.7-flash"` | Caption review — checks if draft reads like AI |
| `MODEL_VISION` | `"deepseek/deepseek-v4-flash-vision-exp"` | `agents/vision.py`'s vision_agent |
| `MODEL_EMBED` | `"openai/text-embedding-3-small"` | Caption embeddings for the anti-repeat cosine check — dimension MUST stay in sync with the existing `EMBED_DIMENSIONS` (already in config.py since Week 2); changing either without a full re-embed of `posts.caption_vec` breaks every existing row |
| `MODEL_FREE` | `"deepseek/deepseek-v4-flash-latest:free"` | Dev/testing only — never used in the daily compose_batch/collect_metrics/weekly_digest crons |
| `LLM_MAX_RETRIES` | `3` | Per-call retry count (`ModelSettings(retry=...)`, research.md Decision 1) |
| `LLM_TIMEOUT_SECONDS` | `120` | Per-call timeout |
| `ANTI_REPEAT_TEMPLATE_WINDOW` | `4` | Posts to look back for template repetition (FR-003) |
| `ANTI_REPEAT_ASSET_WINDOW` | `10` | Posts to look back for asset repetition (FR-004) |
| `ANTI_REPEAT_CAPTION_WINDOW` | `30` | Posts to look back for caption similarity (FR-005) |
| `ANTI_REPEAT_CAPTION_MAX_SIMILARITY` | `0.85` | Cosine similarity threshold — see research.md Decision 2 for the distance/similarity inversion |
| `ANTI_REPEAT_MAX_RETRIES` | `5` | Per-slot regeneration cap before compose_batch gives up on that slot (research.md Decision 6) |
| `COMPOSE_BATCH_CRON` | `"0 4 * * *"` | Daily draft composition (§9) |
| `COLLECT_METRICS_CRON` | `"0 */6 * * *"` | 6-hourly performance collection (§9) |
| `WEEKLY_DIGEST_CRON` | `"0 5 * * 0"` | Sunday weekly summary (§9) |
| `MEMORY_MD_PATH` | `"MEMORY.md"` (repo root) | Where weekly_digest appends its summary (data-model.md) |

## Not new, but newly *required* by this feature

- **YouTube OAuth scope**: `https://www.googleapis.com/auth/yt-analytics.readonly`
  must be added to `publishers/youtube.py`'s existing `SCOPES` list. Any credential
  issued before this change will lack the scope — `collect_metrics` must detect this
  per-credential (research.md Decision 5) and skip with a recorded reason rather than
  fail the whole run every 6 hours.
- **`openai-agents[litellm]`** (not plain `openai-agents`) must be added to
  `apps/worker/requirements.txt` — the `litellm/` model-string prefix (research.md
  Decision 1) requires the `litellm` extra.
