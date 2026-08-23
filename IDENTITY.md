# IDENTITY

| Field | Value |
|---|---|
| Product name | SocialFTE |
| Version | 0.1.0 |
| Author | Owais Abdullah |
| Base repo | Fork of [`hassancs91/claude-youtube-editor`](https://github.com/hassancs91/claude-youtube-editor) (MIT) |

## Supported platforms

| Platform | Status |
|---|---|
| Facebook | Active |
| Instagram | Active |
| YouTube Shorts | Active |
| TikTok | Draft-only until audited |

## Notification channels

| Channel | Status |
|---|---|
| Discord | Active |
| WhatsApp | Available |
| Telegram | Available, off by default — requires a VPN in Pakistan |

## LLM gateway

| Field | Value |
|---|---|
| Gateway | OpenRouter |
| Primary model | `~deepseek/deepseek-v4-flash-latest` |
| Vision model | `deepseek/deepseek-v4-flash-vision-exp` |
| Judgement model | `google/gemini-3.7-flash` |
| Embed model | `openai/text-embedding-3-small` |

### Pricing (as of Aug 2026)

| Model | Input $/M | Output $/M | Discount | Notes |
|---|---|---|---|---|
| `~deepseek/deepseek-v4-flash-latest` | 0.09 | 0.09 | — | Stable pricing |
| `deepseek/deepseek-v4-flash-vision-exp` | 0.22 | 0.66 | — | V4 Flash pricing, image input |
| `google/gemini-3.7-flash` | 0.375 | 1.875 | **75% off (limited time)** | Reverts to ~$1.50/$7.50 when promo ends |
| `deepseek/deepseek-v4-pro-0423` | 0.3969 | 0.7938 | **77% off (limited time)** | Backup judgement model |
| `openai/text-embedding-3-small` | 0.02 | — | — | Embeddings |

**Action required:** If Gemini 3.7 Flash discount expires, switch judgement to `deepseek/deepseek-v4-flash-latest` (same cost as caption) or evaluate V4 Pro at full price.
