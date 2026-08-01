# Research: Week 4 — Brain, Loop, and Bootstrap

**Date**: 2026-07-27
**Scope**: LLM routing (Agents SDK + LiteLLM), caption/vision agents, pgvector anti-repeat,
platform performance APIs, weekly digest, BOOTSTRAP wizard.

This pass follows the same discipline Week 3 needed after the fact: verify
docs/socialfte-spec-v2.md's snippets against current library/API docs (Context7 +
Tavily) before writing code, rather than trusting a spec doc written at an earlier
point in time. Two of the decisions below (Decision 1, Decision 6) directly contradict
or refine what §2/§5-equivalent sections of the reference doc assumed.

---

## Decision 1: Agent↔LiteLLM wiring — string prefix, not the `LitellmModel` class, and no separate proxy process

**Options**: (a) `from agents.extensions.models.litellm_model import LitellmModel` +
explicit `model()` factory, exactly as docs/socialfte-spec-v2.md §2 shows; (b) the
`model="litellm/<provider>/<model>"` string-prefix form directly on `Agent(...)`; (c)
run a standalone LiteLLM Proxy server process (reading a `config.yaml` with
`model_list`/`router_settings`) and point the Agents SDK at its OpenAI-compatible
endpoint via `api_base`.

**Choice**: (b) — the string-prefix form, in-process, no separate proxy server.

**Rationale**:
- Verified via Context7 against the OpenAI Agents Python SDK's own current examples:
  every current example (`examples/model_providers/litellm_auto.py`,
  `examples/basic/retry_litellm.py`) uses `model="litellm/openrouter/<model>"` directly
  on `Agent`, not the `LitellmModel` class import. The class still exists underneath
  (the prefix form dispatches to it), so §2's snippet isn't *wrong*, but it's the
  lower-level form of something the SDK now surfaces more simply.
- The `model_list`/`router_settings`/`litellm_settings` YAML shape in §2 is
  **LiteLLM Proxy Server** config — a separate long-running gateway process with its
  own port and health check. Nothing in Week 1–3's architecture runs a second service
  alongside the worker (research.md Decision 2 in Week 3 explicitly chose
  APScheduler over Celery specifically to avoid extra infrastructure), and
  `infra/docker-compose.yml` has no such service. Adding one just to route four model
  names is a disproportionate infra addition for a single Python process that's the
  only consumer.
- LiteLLM's `openrouter/` provider reads `OPENROUTER_API_KEY` from the environment
  automatically — there's no need to thread an explicit `api_key=` through a `model()`
  factory the way §2's snippet does.
- Fallback/retry behavior (§2's `router_settings.fallbacks`) is available in-process
  too: the Agents SDK's own `ModelSettings(retry=...)` handles retries per-call, and a
  simple explicit fallback (try `caption`, on failure try `judgement`) is a few lines
  of Python in `agents/base.py` — no need for the Router's config-driven fallback list.

**Rationale for keeping `MODEL_MAP`**: §2's `MODEL_MAP` dict (mapping `"caption"` →
`"deepseek/deepseek-v4-flash-latest"` etc.) is still the right shape — it's just a plain
Python dict, not LiteLLM Proxy config, and it's what makes "swap DeepSeek for Qwen
later is a one-line change" (§2) still true.

**Alternatives considered**:
- The Proxy-server route (option c) would make sense if multiple independent
  services (e.g. dashboard *and* worker) both needed to call models — they don't;
  only the worker does.
- Keeping the `LitellmModel` class import (option a) works fine but is more code for
  no behavioral difference; the prefix string is what the SDK's own docs lead with
  now.

**Verified but flagged for implementation-time re-check**: `openai-agents[litellm]`
must be added as an extra in `requirements.txt` (plain `openai-agents` doesn't include
it). LiteLLM-backed providers often don't report token usage by default — pass
`ModelSettings(include_usage=True)` if usage/cost tracking matters.

---

## Decision 2: pgvector similarity check — cosine *distance*, not similarity, is what SQL sees

**Choice**: Implement the caption anti-repeat check as
`Post.caption_vec.cosine_distance(new_embedding) < 0.15`, not `> 0.85`.

**Rationale**:
- Verified via Context7 (pgvector-python docs): `cosine_distance` computes
  `1 - cosine_similarity`. A caption is "more than 85% similar" exactly when its
  cosine *distance* is *less than* 0.15 — inverted from a naive reading of "0.85
  threshold" as "check if distance > 0.85". Getting this backwards silently
  disables the entire anti-repeat rule (it would only reject near-*opposite*
  captions, never near-*duplicate* ones) — worth stating explicitly here so it isn't
  re-derived incorrectly at implementation time.
- SQLAlchemy usage: `select(Post).where(Post.caption_vec.cosine_distance(new_vec) < 0.15, Post.id.in_(last_30_ids))`.

**Alternatives considered**: Raw SQL with the `<=>` operator (also cosine distance,
same inversion applies) — the pgvector-python `cosine_distance()` method is
equivalent and reads more clearly in SQLAlchemy code already used elsewhere in this
codebase (`apps/worker/db/models.py` already imports `pgvector.sqlalchemy`).

---

## Decision 3: Humanizer enforcement — a code-level banned-phrase filter, not a prompt instruction alone

**Options**: Prompt-only ("don't sound like AI"), a post-generation regex/substring
filter with reject-and-regenerate, an LLM-based judge pass (spend a second call
grading the first).

**Choice**: A code-level banned-phrase filter (case-insensitive substring/regex match
against a maintained list), run after every generation, that rejects and triggers a
regeneration — not a second LLM call.

**Rationale**:
- The spec (FR-002) explicitly requires this be "enforced in code, not just prompted
  for" — a prompt instruction alone is not verifiable and models drift from it under
  temperature 0.8 (§2's configured temperature for the caption agent).
- A second LLM judge call would double the cost of every caption (defeating the
  point of picking the cheapest capable model in §2's routing table) for a check a
  static list handles for the known, named failure modes (CLAUDE.md's own examples:
  "elevate your space", forced enthusiasm).
- Starting list, extensible over time (see spec.md Assumptions): stock real-estate/
  interior-design AI-copy phrases ("elevate your space", "transform your home",
  "in today's fast-paced world", excessive exclamation points, "we're thrilled to
  announce"-style corporate-AI openers).

**Alternatives considered**: An LLM judge pass using the `judgement` model tier — kept
as a documented fallback option if the static list proves insufficient in practice,
not built now (YAGNI; add it if the static list demonstrably lets things through).

---

## Decision 4: Meta performance metrics — the Insights query pattern changed recently; page-token single-ID queries now fail

**Options**: Query `/{media-id}/insights?metric=...` directly with the existing
`META_PAGE_TOKEN` (as Week 3's publishers already use); switch to the batched
`?ids=` syntax; switch to a long-lived user token instead of a page token.

**Choice**: Use the batched syntax — `GET /?ids={media-id}&fields=insights.metric(reach,saved,shares,total_interactions)` — with the existing page token. Pull `like_count`
and `comments_count` as direct fields on the media object itself (not via the
insights edge at all).

**Rationale**:
- Verified via Tavily against Meta's developer community and the current Instagram
  Media Insights reference doc: as of ~May 2026, `GET /{media-id}/insights?metric=...`
  using a **Page** access token (exactly what `META_PAGE_TOKEN` is, per Week 3's
  `apps/worker/config.py`) started failing with a 400 "Authorization Error". The
  documented fix is the nested-field batch syntax shown above, or switching to a
  long-lived **user** token for that specific call (not worth the added credential
  complexity here).
- `impressions` was fully deprecated as of Graph API v22.0 (April 2025, applies to
  all versions from that point) — use `reach` instead, which the reference doc
  already specified.
- `like_count` and `comments_count` are plain fields on the IG media object, not
  insights metrics — fetching them via `/insights` is unnecessary and, per the
  above, currently broken for page tokens anyway.
- Facebook Page (non-Instagram) post-level insights use a different metric
  namespace (`post_impressions`, `post_engaged_users`, etc.) than Instagram Media
  Insights (`reach`, `saved`, `shares`, `total_interactions`) — this needs its own
  targeted verification pass when `collect_metrics.py` is actually implemented
  (tasks phase), since Week 4's scope covers Facebook Page posts too and this
  research pass didn't exhaustively verify that metric set.

**Alternatives considered**: None viable — the old single-ID page-token pattern is
the one that's actively broken right now, not a style preference.

---

## Decision 5: YouTube performance metrics — requires a new OAuth scope not currently requested

**Choice**: Add `https://www.googleapis.com/auth/yt-analytics.readonly` to
`publishers/youtube.py`'s `SCOPES` list, and use the YouTube Analytics API's
`reports.query` method (`dimensions=video`, `filters=video==<video_id>`,
`metrics=views,likes,comments,shares`, `startDate`/`endDate`) for per-video numbers.

**Rationale**:
- Verified via Tavily against Google's current YouTube Analytics API reference:
  `reports.query` requires the `yt-analytics.readonly` scope specifically — distinct
  from the `youtube.upload`/`youtube` scopes Week 3's YouTube publisher already
  requests.
- **This is a breaking discovery for existing credentials**: any YouTube OAuth token
  already issued during Week 3 (or a future BOOTSTRAP run) will not have this scope
  and `collect_metrics` will fail for YouTube specifically until a operator re-runs
  the auth flow. This must be called out explicitly wherever BOOTSTRAP's platform
  connection step (User Story 7) handles YouTube, and documented in the env-vars
  contract for this feature.

**Alternatives considered**: The older YouTube Data API v3 `videos.list?part=statistics`
endpoint also returns `viewCount`/`likeCount`/`commentCount` without needing the
analytics scope — simpler, but doesn't provide the 7-day-*window* breakdown FR-008
requires (it's a lifetime total, not a windowed report). Analytics API's `reports.query`
is required specifically because the spec wants both a 24h and a 7d snapshot per post,
not just an all-time count.

---

## Decision 6: compose_batch's retry bound for the anti-repeat gate

**Choice**: Cap regeneration attempts at 5 per post slot before giving up on that
slot for the current run (log the outcome per spec.md's Assumptions — this is an
internal implementation choice, not user-configurable).

**Rationale**: Matches spec.md's Edge Cases ("system produces fewer posts than
requested rather than forcing a repeat") without an unbounded loop. 5 attempts gives
enough room for the asset/template pickers to cycle through reasonable alternatives
without meaningfully delaying the daily batch job.

**Alternatives considered**: Unbounded retry (rejected — could hang the cron job
indefinitely if the library is genuinely exhausted); a single attempt with immediate
give-up (rejected — too eager to under-produce when a second pick would likely pass).

---

## Decision 7: BOOTSTRAP resumability

**Choice**: Each BOOTSTRAP step writes its output file(s) (SOUL.md, BRAND.md,
credentials rows, HEARTBEAT.md) as it completes, not all-at-once at the end. Re-running
the CLI or reloading the `/setup` dashboard route detects already-completed steps
(the corresponding file/row already exists and is non-empty) and skips ahead rather
than re-collecting that step's answers.

**Rationale**: Directly required by spec.md's edge case ("progress already saved is
not lost — the flow can resume rather than starting over"). Matches the pattern
already established by `/brand-setup` (the existing Claude Code skill that BOOTSTRAP's
brand step invokes per docs/socialfte-spec-v2.md §6) writing its three files in one
pass — BOOTSTRAP's steps are coarser-grained (one step = one or more files) but the
same "write as you go, don't lose partial progress" principle applies.

**Alternatives considered**: A single transactional "commit everything at the end"
flow — rejected, since a killed CLI process or closed browser tab (spec.md's stated
edge case) would then lose all prior answers, exactly what resumability is meant to
prevent.

---

## Decision 8: litellm installation — Windows Rust-build constraint and test-skip strategy

**Status**: Blocked on local Windows dev machines only; installs fine on Linux (CI/VPS).

**Observation**: litellm ≥1.0 ships a Rust component (tokenizers reimplementation via
`maturin`/`pyo3`). PyPI distributes wheels for `manylinux` (aarch64/x86_64) and
`macosx`, but **not** for `win_amd64` on Python 3.13. Installing on Windows triggers a
source build that requires the MSVC `link.exe` toolchain, which fails with "extra
operand" when temp/cache paths contain spaces (e.g. `C:\Users\K TECH\...`).

**Choice**: The two tests that import `litellm` (`test_embed_uses_litellm...`,
`test_free_tier_round_trip`) use a dynamic skip — `try: import litellm` at module
level, `@pytest.mark.skipif(not _has_litellm, ...)`. This is not a hardcoded `True`
skip: on Linux/Docker where litellm installs from a wheel, the tests auto-enable.

**Mitigation for CI**: GitHub Actions runners are Linux — litellm will install normally
from `manylinux` wheels. The `openai-agents[litellm]` extra in `requirements.txt` pulls
it in automatically; no special handling needed.

**Impact on Week 4 coverage**: The skipped tests cover the `embed()` function's litellm
call path and a real OpenRouter round-trip. The former is a thin wrapper (one
`aembedding` call with a simple assertion); the latter already gated behind
`OPENROUTER_API_KEY` anyway. No behavioral risk — the skip is purely a local-dev
convenience.

---

## Open questions for `/sp.tasks` / implementation time (not blocking this plan)

- Exact Facebook Page (non-Instagram) post-insights metric names — verify when
  `collect_metrics.py`'s Facebook path is actually written (Decision 4 only verified
  the Instagram Media Insights side in depth).
- Exact current `openai-agents` and `litellm` package version pins compatible with
  Python 3.11 (Week 3's Docker base) — check at `requirements.txt` update time.
- Whether OpenRouter's DeepSeek V4 Flash/Pro and Gemini 2.5 Flash model IDs
  (`deepseek/deepseek-v4-flash-latest`, etc.) are still the current OpenRouter slugs at
  implementation time — OpenRouter model availability/slugs can change; the routing
  table in docs/socialfte-spec-v2.md §2 should be re-checked against OpenRouter's
  live model list before shipping, the same way Meta's Graph API version needed a
  re-check in Week 3.
