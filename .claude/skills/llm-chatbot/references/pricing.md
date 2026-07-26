# LLM Provider Pricing Reference

## OpenAI (as of 2025)

| Model | Input | Output | Best For |
|-------|-------|--------|----------|
| **gpt-4o** | $2.50 / 1M tokens | $10.00 / 1M tokens | General purpose, multimodal |
| **gpt-4o-mini** | $0.15 / 1M tokens | $0.60 / 1M tokens | Cost-effective, fast responses |
| **gpt-4.5** | TBD | TBD | Latest reasoning model |
| **o1** | TBD | TBD | Complex reasoning tasks |
| **o1-mini** | TBD | TBD | Fast reasoning |

### OpenAI Special Pricing
- **Batch API**: 50% discount for non-urgent requests
- **Flex Tier**: Lower prices, higher latency
- **Priority Tier**: Faster processing, higher cost

## Anthropic Claude (as of 2025)

| Model | Input | Output | Context | Best For |
|-------|-------|--------|---------|----------|
| **claude-sonnet-4-20250514** | $3.00 / 1M tokens | $15.00 / 1M tokens | 200K | Balanced quality/speed |
| **claude-opus-4-20250514** | $15.00 / 1M tokens | $75.00 / 1M tokens | 200K | Highest quality |
| **claude-haiku-4-5-20250514** | $0.80 / 1M tokens | $4.00 / 1M tokens | 200K | Fast, cost-effective |

### Anthropic Notes
- All Claude 4 models support 200K context
- Prompt caching available for repeated prompts
- Batching available for reduced latency

## Google Gemini (as of 2025)

| Model | Input | Output | Context | Best For |
|-------|-------|--------|---------|----------|
| **gemini-2.5-flash** | Free (dev) | Free (dev) | 1M | Fast prototyping |
| **gemini-2.5-pro** | $1.25 / 1M tokens | $5.00 / 1M tokens | 1M | Production quality |
| **gemini-1.5-flash** | $0.075 / 1M tokens | $0.30 / 1M tokens | 1M | Fast, affordable |
| **gemini-1.5-pro** | $1.25 / 1M tokens | $5.00 / 1M tokens | 2M | Large context |

### Gemini Notes
- 2.5 Flash is currently free for development use
- All models support multimodal (text, images, video, audio)
- Vertex AI also available with enterprise features

## Groq (as of 2025)

| Model | Input | Output | Speed | Best For |
|-------|-------|--------|-------|----------|
| **llama-3.3-70b-versatile** | $0.59 / 1M tokens | $0.79 / 1M tokens | ~130 tok/s | General purpose |
| **llama-3.1-405b-reasoning** | $0.70 / 1M tokens | $0.70 / 1M tokens | ~50 tok/s | Complex reasoning |
| **mixtral-8x7b-32768** | $0.24 / 1M tokens | $0.24 / 1M tokens | ~250 tok/s | Fast, efficient |

### Groq Notes
- Fastest inference speeds (~300+ tok/s on some models)
- All models are open-source LLaMA/Mistral variants
- No rate limits for paid accounts

## OpenRouter (as of 2025)

| Model | Provider | Input | Output | Notes |
|-------|----------|-------|--------|-------|
| **anthropic/claude-sonnet-4** | Anthropic | $3.00+ | $15.00+ | Via OpenRouter markup |
| **openai/gpt-4o** | OpenAI | $2.50+ | $10.00+ | Via OpenRouter markup |
| **google/gemini-pro-1.5** | Google | $1.25+ | $5.00+ | Via OpenRouter markup |

### OpenRouter Free Models
- `google/gemma-2-9b-it:free`
- `meta-llama/llama-3-8b-instruct:free`
- `mistralai/mistral-7b-instruct:free`
- `microsoft/phi-3-medium-128k-instruct:free`

### OpenRouter Notes
- Single API key for 100+ models
- Slight markup on base prices (~10-20%)
- Easy model switching without code changes

## Cost Optimization Tips

1. **Use smaller models for simple tasks**
   - gpt-4o-mini or claude-haiku for basic Q&A
   - Reserve gpt-4o/claude-opus for complex tasks

2. **Implement prompt caching**
   - Anthropic: 90% discount on cached prompts
   - Reuse system instructions across calls

3. **Use batch processing**
   - OpenAI Batch API: 50% discount
   - For non-time-sensitive requests

4. **Consider OpenRouter for flexibility**
   - Easy A/B testing of models
   - Single integration for multiple providers

5. **Set token limits**
   - Limit `max_tokens` to actual needs
   - Shorter responses = lower costs

6. **Use streaming**
   - Reduces perceived latency
   - Same cost as non-streaming
