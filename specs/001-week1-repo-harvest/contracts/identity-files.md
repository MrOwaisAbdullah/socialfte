# Identity File Contract (Story 4)

Structural contract each file must satisfy. `/sp.tasks` should generate one authoring
task per row; `/sp.implement` validates against this table before checking Story 4
done.

## SOUL.md

- Sections, in order: `Identity`, `How I work`, `What I will not do`, `Communication
  style`.
- ≤ 400 words total.
- Must state: agent is called "SocialFTE" (no separate persona name — Clarifications);
  manages social media for a Pakistani furniture brand; drafts → waits for human
  approval → publishes; never publishes without approval; writes captions in the
  brand's voice, not in an identifiably-AI voice.
- Tone: direct, clean, no fluff — no hedging language, no meta-commentary about being
  an AI.

## IDENTITY.md

- Must record, verbatim from the spec: product name `SocialFTE`, version `0.1.0`,
  author `Owais Abdullah`, supported platforms (Facebook, Instagram, YouTube Shorts,
  TikTok — TikTok marked draft-only until audited), notification channels with current
  state (Discord: active, WhatsApp: available, Telegram: available/off-by-default,
  VPN note for Pakistan), LLM gateway (OpenRouter), primary model
  (`deepseek/deepseek-v4-flash-latest`), vision model (`google/gemini-2.5-flash`), base-repo
  attribution (fork of `hassancs91/claude-youtube-editor`, MIT).
- No word limit stated in the spec; keep it a facts table, not prose.

## AGENTS.md

- ≤ 600 words.
- Must cover, each as its own identifiable section: pre-job reads (SOUL, BRAND,
  HEARTBEAT); decision framework `draft → render → review → approved → publish`;
  approval boundary (everything requires human approval except story-format reposts);
  failure protocol (`state = failed`, notify channel immediately); token-refresh rule
  (never publish if `credentials.expires_at < now + 7 days`); anti-repeat rules (no
  template repeat within 4 posts, no asset repeat within 10, caption cosine similarity
  < 0.85 against the last 30); audit-log rule (every action writes a row, no
  exceptions).

## HEARTBEAT.md

- ≤ 50 lines.
- Must match `docs/socialfte-spec-v2.md` §9 exactly:
  `publish_due` (*/15 * * * *), `collect_metrics` (0 */6 * * *), `refresh_tokens`
  (0 3 * * *), `compose_batch` (0 4 * * *), `notify_review` (30 4 * * *),
  `weekly_digest` (0 5 * * 0).

## TOOLS.md

- Lists active platforms and the active notification channel from IDENTITY.md's facts.
- Every credential field (API keys, tokens, OAuth client IDs/secrets, webhook URLs) is
  literally `[PENDING]` — no placeholder values that look like real credentials.

## MEMORY.md

- Exactly three sections: `Top performers`, `Learnings`, `Last updated` — each body is
  the single line `None yet.`
