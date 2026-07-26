# SocialFTE — SDD Prompt Pack

Run these in Claude Code, in order. Never run the next prompt until the current
checkpoint passes. Each prompt references the docs already in `docs/`.

---

## HOW TO USE THIS

1. Open Claude Code in the repo root
2. Run **PROMPT 0** first — this is the context load. The agent reads the docs and
   asks you questions before touching any files.
3. When PROMPT 0 is done and you've answered the questions, run **PROMPT 1**.
4. At the end of each prompt the agent runs a checkpoint. Only proceed when it passes.
5. Keep this file open in a second terminal tab so you can paste the next prompt.

Do not combine prompts. Do not skip checkpoints.

---

## PROMPT 0 — Context Load (run this first, always)

```
Read these files in this exact order before doing anything else:

1. docs/socialfte-spec-v2.md      — the full technical spec
2. docs/repo-harvest.md           — what survives from the cloned repo and where it goes
3. CLAUDE.md                      — if it exists, read it as the current operating rules

After reading, do three things:

1. List every file currently in .claude/skills/ so I can confirm the skills are there.

2. List every file currently in tools/ so I can confirm the repo state.

3. Ask me these questions before touching anything:
   a. What is the agent name? (default: Sora)
   b. What is the brand name for the founding client? (Yousuf Living)
   c. What is the notification channel? (discord / whatsapp / telegram)
   d. What is the VPS domain for the dashboard? (e.g. social.yousufliving.com)
   e. Confirm the R2 bucket name for this client. (default: yl-social)
   f. Is there an existing .env file or do I create one from scratch?

Do not create or modify any files until I have answered all six questions.
```

---

## PROMPT 1 — Strip, Restructure, and Identity Files

```
We are in Week 1 of the SocialFTE build. Read docs/repo-harvest.md section 2 (delete
list) and section 3 (keep list) before doing anything.

Do these steps in order. Confirm each step is complete before moving to the next.
Do not batch steps.

STEP 1 — Execute the delete list from docs/repo-harvest.md §2.
Before deleting remotion/src/shots/, open Remotion Studio and list the composition
names. I want to see them before they go.
After deleting, run `git status` and show me the full list of deleted files.

STEP 2 — Restructure into the target tree from docs/repo-harvest.md §6.
- Move remotion/ → packages/remotion/
- Move tools/ ffmpeg layer → tools/media/ (cutlib, render_cuts, verify_cut, bake,
  clean_voice, mix_sfx, mix_music, rnnoise models)
- Move tools/yt_upload.py → apps/worker/publishers/youtube.py (do not modify yet)
- Create empty directories: apps/dashboard/, apps/worker/
- Update imports in tools/media/*.py that broke from the move
After restructuring, run `python -c "import tools.media.cutlib"` and fix any import
errors before proceeding.

STEP 3 — Fix the requirements.txt per docs/repo-harvest.md §5.
Show me the diff before applying it. Ask me to confirm.

STEP 4 — Write the six identity files. Use my answers from PROMPT 0.

SOUL.md (repo root):
Write a SOUL.md for the agent whose name I gave you. Tone: direct, clean, no fluff.
The agent manages social media for a Pakistani furniture brand. It drafts, waits for
human approval, publishes. It never publishes without approval. It writes captions in
the brand's voice, not like an AI. Structure: Identity, How I work, What I will not do,
Communication style. Keep it under 400 words — every token here is burned on every
agent call.

IDENTITY.md (repo root):
Product name: SocialFTE. Version: 0.1.0. Author: Owais Abdullah.
Supported platforms: Facebook, Instagram, YouTube Shorts, TikTok (draft-only until
audited). Notification channels: Discord (active), WhatsApp (available), Telegram
(available, off by default — requires VPN in Pakistan). LLM gateway: OpenRouter.
Primary model: deepseek/deepseek-v4-flash. Vision model: google/gemini-2.5-flash.
Base repo: fork of hassancs91/claude-youtube-editor (MIT).

AGENTS.md (repo root):
Write the operating constitution. Sections:
- Before every job: what the agent reads (SOUL, BRAND, HEARTBEAT)
- Decision framework: draft → render → review → approved → publish
- What requires human approval: everything except story-format reposts
- What to do on failure: state = failed, notify channel immediately
- Token refresh rule: never publish if credentials.expires_at < now + 7 days
- Anti-repeat rules: no template repeat within 4 posts, no asset repeat within 10,
  caption cosine similarity < 0.85 against last 30
- Audit log rule: every action writes a row, no exceptions
Keep it under 600 words.

HEARTBEAT.md (repo root):
Write the cron checklist from docs/socialfte-spec-v2.md §9. Under 50 lines.

TOOLS.md (repo root):
Write a stub — active platforms and notification channel from my PROMPT 0 answers.
BOOTSTRAP will fill in the credential details. Mark all credential fields as [PENDING].

MEMORY.md (repo root):
Write an empty initial file. Sections: Top performers, Learnings, Last updated.
One line each: "None yet."

STEP 5 — Run /brand-setup skill.
Tell me to run it manually: "Run /brand-setup now. Come back when it has written
BRAND.md, remotion/src/brand.ts, and rendered a proof card you're happy with."
Wait for me to confirm before continuing.

STEP 6 — Update CLAUDE.md.
Make CLAUDE.md a symlink to AGENTS.md. If symlinks don't work on this OS, make
CLAUDE.md a one-liner: `<!-- See AGENTS.md -->` and copy AGENTS.md content there.

STEP 7 — Checkpoint.
Run these checks and show me the results:
[ ] git status shows a clean restructured tree matching docs/repo-harvest.md §6
[ ] python -c "import tools.media.cutlib; import tools.media.clean_voice" succeeds
[ ] SOUL.md, IDENTITY.md, AGENTS.md, HEARTBEAT.md, TOOLS.md, MEMORY.md all exist
[ ] BRAND.md exists (written by /brand-setup)
[ ] packages/remotion/src/brand.ts exists (written by /brand-setup)
[ ] requirements.txt updated
[ ] git commit -m "week1: strip, restructure, identity files"

If any check fails, fix it before telling me the checkpoint passed.
```

---

## PROMPT 2 — Neon Schema + Dashboard Shell + Templates

```
We are in Week 2. Read docs/socialfte-spec-v2.md §3 (data model) and §4 (dashboard
spec) before starting.

STEP 1 — Neon schema.
Create apps/worker/db/schema.sql with all six tables from the spec exactly:
assets, templates, posts, metrics, audit_log, credentials.
Include the pgvector extension line at the top:
  CREATE EXTENSION IF NOT EXISTS vector;
Include the caption_vec column: vector(1536) — use the dimension from EMBED_DIMENSIONS
env var comment, not hardcoded.
Add indexes:
  posts(state, scheduled_at) — the publish_due query
  posts(platform, state)     — the per-platform cap check
  assets(times_used)         — overuse detection
  audit_log(created_at)      — the digest query
Show me the full SQL before I confirm running it.

STEP 2 — Drizzle schema.
Create apps/worker/db/models.py with SQLAlchemy models matching the SQL exactly.
Use mapped_column and DeclarativeBase. Import pgvector's Vector type.
Do not use any ORM magic that differs from the raw SQL — the schema.sql is the source
of truth.

STEP 3 — Next.js app scaffold.
Create apps/dashboard/ as a Next.js 15 app with:
- TypeScript
- Tailwind CSS
- App router
- Drizzle ORM (connected to the same Neon DATABASE_URL)
- No auth library — single-user SESSION_SECRET cookie only

Do not use create-next-app. Write the package.json, tsconfig.json, next.config.ts,
tailwind.config.ts, and app/layout.tsx by hand so we control every dependency.

Read .claude/skills/frontend-designer/SKILL.md and .claude/skills/web-design-guidelines/
SKILL.md before writing any component. The visual language must match BRAND.md:
forest green (#1B4332) primary, gold (#C9A227) accent, Instrument Serif headings,
Archivo body.

STEP 4 — Six post template components.
Create apps/dashboard/components/templates/ with these six layouts:
1. hero.tsx          — large room render, gradient scrim bottom, headline + price
2. price-card.tsx    — product name, tier badge, price large, CTA
3. set-breakdown.tsx — 5-piece set list with individual and bundle price
4. quote.tsx         — pull quote, small product thumbnail, brand mark
5. before-after.tsx  — side-by-side or swipe (still image, 2-panel)
6. carousel-slide.tsx — single slide for a carousel post, product + copy

Each component accepts a `props` object and a `brand` object read from BRAND.md.
Every template renders at 1080×1080 (1:1) by default, with an `aspect` prop that
switches to 1080×1350 (4:5) for feed or 1080×1920 (9:16) for Reels/Shorts.
No hardcoded brand values inside the component — read from the brand prop only.

Look at the popup image we discussed (the Shaadi Season popup) as the design reference
for the hero template. It had: AI room render background, gradient overlay bottom-left
to transparent, Instrument Serif headline with a coloured highlight box on a key word,
body copy in Archivo, WhatsApp CTA button in brand green with gold text. Match that
quality.

STEP 5 — Puppeteer render route.
Create apps/dashboard/app/api/internal/render/route.ts.
- POST only
- Verify RENDER_INTERNAL_SECRET header matches env var
- Accept: { templateId, props, aspect, brand }
- Launch Puppeteer (use PUPPETEER_EXECUTABLE_PATH, PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1)
- Navigate to /render-preview?templateId=...&props=...&aspect=... (a headless route)
- Screenshot at the correct pixel dimensions for the aspect
- Upload PNG to R2 under renders/{uuid}.png
- Return { url: R2_PUBLIC_URL/renders/{uuid}.png }
Write a companion headless route apps/dashboard/app/render-preview/page.tsx that
renders the template component and nothing else (no nav, no chrome).

STEP 6 — R2 client.
Create apps/dashboard/lib/r2.ts — AWS SDK v3 S3Client pointed at the R2 endpoint.
Exports: uploadBuffer(key, buffer, contentType), getPublicUrl(key).
Create the same in apps/worker/storage/r2.py using boto3.

STEP 7 — Dockerfile.dashboard.
Write infra/Dockerfile.dashboard.
Base: node:20-slim.
Install chromium via apt (not via npm) — this is the only correct way to get a
headless browser in a Linux container without a 1.5 GB Puppeteer bundle.
Set PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1 and PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium.
Multi-stage: builder stage installs deps + builds, runner stage is minimal.

STEP 8 — Deploy dashboard to Dokploy.
Read .claude/skills/vps-dokploy-nextjs/SKILL.md before doing this step.
Create infra/docker-compose.yml with the yl-dashboard service.
Show me the exact environment variables it needs (from the .env reference in
docs/socialfte-spec-v2.md §7) so I can fill them in Dokploy.

STEP 9 — Checkpoint.
[ ] npm run build succeeds in apps/dashboard/
[ ] POST /api/internal/render with a dummy payload returns a PNG URL
[ ] The PNG renders a recognisable hero template (open the URL in browser to verify)
[ ] Dockerfile builds locally: docker build -f infra/Dockerfile.dashboard .
[ ] git commit -m "week2: schema, dashboard, templates, render route"
```

---

## PROMPT 3 — Worker, Publishers, Discord, Cron

```
We are in Week 3. Read docs/socialfte-spec-v2.md §4a (Discord), §5 (platform
connections), and §9 (cron schedule) before starting.

This is the most important week. The token refresh cron must be built before any
publish code. Build in the exact order below — do not reorder steps.

STEP 1 — Worker scaffold.
Create apps/worker/ as a Python FastAPI + APScheduler app.
Structure:
  apps/worker/
    main.py               FastAPI app, mounts all routers
    config.py             pydantic-settings, reads every env var from §7
    db/
      models.py           SQLAlchemy (from week 2)
      session.py          engine + SessionLocal
    jobs/                 one file per cron job (empty stubs for now)
    publishers/           meta.py, youtube.py, tiktok.py (youtube.py exists)
    notify/               discord.py, whatsapp.py, telegram.py
    agents/               base.py, composer.py, vision.py (empty stubs)
    storage/              r2.py (from week 2)
    mcp/                  meta_mcp.py, youtube_mcp.py, asset_mcp.py (stubs)

Create infra/Dockerfile.worker — Python 3.11-slim + ffmpeg + faster-whisper.
Create infra/docker-compose.yml updating it to include yl-worker alongside
yl-dashboard. Worker is internal-only: no public port, docker network only.
Set worker memory limit: 1g hard. Comment explains why (Remotion / OOM risk).

STEP 2 — Credential management.
Create apps/worker/db/credentials.py.
Functions: get_token(platform), save_token(platform, access_token, refresh_token,
expires_at, meta), is_expiring_soon(platform, days=7).
Write a unit test that mocks the DB and verifies is_expiring_soon correctly flags
a token expiring in 5 days.

STEP 3 — Token refresh cron. Build this BEFORE any publisher.
Create apps/worker/jobs/refresh_tokens.py.
Logic:
  - For each platform in credentials table
  - If is_expiring_soon(platform, days=7): attempt refresh via platform API
  - If refresh succeeds: save_token with new expiry
  - If refresh fails: notify(f"URGENT: {platform} token refresh failed. Expires {expires_at}.")
  - Write an audit_log row for every refresh attempt
Meta refresh endpoint:
  GET /oauth/access_token?grant_type=fb_exchange_token&client_id=...&client_secret=...
  &fb_exchange_token={current_token}
Wire this job to run daily at 03:00 in APScheduler.
Write a test: mock a token expiring in 3 days, verify the job calls the refresh endpoint.

STEP 4 — Meta publisher.
Create apps/worker/publishers/meta.py.
Functions:
  post_image(page_id, image_url, caption) → external_id
  post_reel(page_id, video_url, caption) → external_id
  post_ig_image(ig_user_id, image_url, caption) → external_id
  post_ig_reel(ig_user_id, video_url, caption) → external_id
  post_story(ig_user_id, image_url) → external_id
Use META_PAGE_TOKEN from config. Graph API v20.0.
Every function writes an audit_log row on success and on failure.
Do NOT catch exceptions silently. Let them bubble — the caller handles state.
Write a test using httpx mock that verifies the image container → publish two-step
flow for Instagram.

STEP 5 — YouTube publisher.
Adapt apps/worker/publishers/youtube.py from the source yt_upload.py.
Changes per docs/repo-harvest.md §4:
  - Add #Shorts to description
  - Read privacy from YOUTUBE_PRIVACY_ON_UPLOAD env var
  - Return video_id so caller can write posts.external_id
  - Keep A/V drift verification, drop ghost-speech check
  - Keep the resumable upload with retry logic

STEP 6 — TikTok publisher (draft-only).
Create apps/worker/publishers/tiktok.py.
When TIKTOK_MODE=draft_only (the default):
  - Upload video to R2 (already done by render job)
  - Write a posts row with state='tiktok_ready'
  - Send Discord notification with the R2 URL and "Download and post manually" message
When TIKTOK_MODE=direct_post (future, audited):
  - Use the Content Posting API direct-post endpoint
This flag means the audited path can be switched on later without a rewrite.

STEP 7 — publish_due job.
Create apps/worker/jobs/publish_due.py.
Logic:
  - Query posts WHERE state='approved' AND scheduled_at <= now()
  - Apply per-platform daily cap check (read CAP_* env vars)
  - For each eligible post:
      try:
        call the right publisher based on post.platform + post.format
        update post: state='published', published_at=now(), external_id=...
        write audit_log
      except:
        update post: state='failed', error=str(e)
        notify(f"Publish failed: {post.id} on {post.platform} — {e}")
        write audit_log
Wire to APScheduler: every 15 minutes.
Write a test that verifies a post past its scheduled_at gets published and a cap-exceeded
post gets skipped.

STEP 8 — Discord notification.
Create apps/worker/notify/discord.py per docs/socialfte-spec-v2.md §4a.
Functions: send(text, media_url=None), send_approval(post).
The approval card shows: rendered image, caption (truncated to 2000 chars),
platform badge, scheduled time, three buttons: Approve / Edit / Skip.

Create apps/dashboard/app/api/webhooks/discord/route.ts per §4a.
Ed25519 signature verification is not optional — Discord disables the endpoint if
it fails. Use the `tweetnacl` package.
Handle type 1 (PING → PONG) and type 3 (button click → update post state in DB).
The Edit button sends a Discord DM or channel message: "Reply with the new caption
for post {id}:" and sets a pending_edit flag. Build a message listener that reads
the reply and updates posts.caption. This is the minimal edit flow for week 3.

STEP 9 — notify_review job.
Create apps/worker/jobs/notify_review.py.
At 04:30 daily: query posts WHERE state='review' AND scheduled_at <= tomorrow.
For each: call notify/discord.py send_approval(post).
Batch limit: 10 per run. If more than 10, send one summary card first:
"You have {n} posts to review. Showing first 10."

STEP 10 — Checkpoint.
[ ] python -m pytest apps/worker/tests/ — all tests pass
[ ] Token refresh cron fires in APScheduler (check logs)
[ ] POST a dummy post row in state='approved' with scheduled_at in the past
    → verify publish_due picks it up and calls the publisher
[ ] Discord test: send a card to the channel and click Approve
    → verify the post state changes to 'approved' in the DB
[ ] docker-compose up — both dashboard and worker start without errors
[ ] Worker logs show APScheduler registered all five jobs
[ ] git commit -m "week3: worker, publishers, discord, cron"
```

---

## PROMPT 4 — Brain, Loop, and BOOTSTRAP

```
We are in Week 4. Read docs/socialfte-spec-v2.md §2 (model routing) and the
.claude/skills/openai-agents-sdk-gemini/SKILL.md and
.claude/skills/litellm-smart-routing/SKILL.md before starting.

STEP 1 — LiteLLM config.
Create apps/worker/config/litellm.yaml exactly as in docs/socialfte-spec-v2.md §2.
Write apps/worker/agents/base.py — the MODEL_MAP and the model() factory function
that returns a LitellmModel pointed at OpenRouter.
Write a smoke test: instantiate each model alias and verify the API key is read from
env, no hardcoded strings anywhere.

STEP 2 — Skill loaders.
Create apps/worker/agents/skills.py.
Function: load_skill(name: str) → str.
Reads from .claude/skills/{name}/SKILL.md. Caches in memory for the process lifetime.
Function: load_prompt(*paths: str) → str.
Reads and concatenates any mix of skill names and root markdown files (SOUL.md,
BRAND.md, AGENTS.md). This is what agents pass as their instructions.
Test: load_prompt("SOUL.md", "BRAND.md", "skills/caption-writer") returns a non-empty
string containing content from all three files.

STEP 3 — Vision agent.
Create apps/worker/agents/vision.py using load_prompt("skills/asset-tagging").
Function: tag_asset(image_url: str) → AssetTags.
AssetTags is a Pydantic model: piece, tier, variant, quality_score (0–100),
lighting_ok, composition_ok, reject_reason.
The agent sends the image URL to google/gemini-2.5-flash via OpenRouter.
If quality_score < 60: log a warning, mark the asset as rejected in the assets table.
Write a test with a real public R2 image URL from your library — verify it returns
a structured AssetTags without crashing.

STEP 4 — Caption agent.
Create apps/worker/agents/composer.py.
Function: write_caption(post_type, platform, asset_tags, recent_captions) → str.
Agent instructions: load_prompt("SOUL.md", "BRAND.md", "skills/caption-writer").
Read .claude/skills/humanizer/SKILL.md — run every caption output through a humanizer
pass before returning. This is a second LLM call on the same model (caption). It is
not optional.
The recent_captions list is used to build the anti-repeat check:
  - Embed the proposed caption with the embed model
  - Compare cosine similarity against the last 30 caption vectors in the posts table
  - If similarity > CAPTION_SIMILARITY_THRESHOLD: regenerate, max 3 attempts
  - If still too similar after 3 attempts: return the last attempt with a warning flag
Write a test: mock the embed call, verify the similarity check correctly rejects a
near-duplicate.

STEP 5 — compose_batch job.
Create apps/worker/jobs/compose_batch.py.
Runs daily at 04:00. For each platform × format in tomorrow's schedule:
  1. Pick an asset from assets table:
       - has not been used in the last NO_ASSET_REPEAT_WITHIN posts
       - quality_score >= 60
       - product tier varies from the last 3 posts (rotation)
  2. Pick a template that hasn't been used in the last NO_TEMPLATE_REPEAT_WITHIN posts
  3. Call write_caption(post_type, platform, asset_tags, recent_captions)
  4. Apply ±SCHEDULE_JITTER_MINUTES jitter to the scheduled time
  5. Insert a posts row with state='draft'
  6. Call /api/internal/render → get PNG URL → update post with render_url
  7. Update post state to 'review'
  8. Write audit_log for every step

STEP 6 — collect_metrics job.
Create apps/worker/jobs/collect_metrics.py.
Runs every 6 hours. Query posts WHERE state='published'.
For posts published 23–25h ago: fetch 24h metrics from Meta Insights + YouTube Analytics.
For posts published 6–8 days ago: fetch 7d metrics.
Write rows to metrics table. If a platform API returns an error: log it, write a
partial row with the error, do not crash the job.

STEP 7 — weekly_digest job.
Create apps/worker/jobs/weekly_digest.py.
Runs Sunday 05:00.
Query metrics table for the last 7 days. Compute:
  - Top template by average reach
  - Top product tier by average reach
  - Top posting hour by average reach
  - Platform with highest engagement rate
  - Any post that outperformed the weekly average by more than 2x
Use deepseek/deepseek-v4-flash to write the digest as a plain-language paragraph (not
bullet points — the agent reads this next week and bullets are hard to parse in context).
Append the digest to MEMORY.md under a "## Week of {date}" heading.
Send the digest to the Discord channel via notify/discord.py send().

STEP 8 — Performance screen.
Create apps/dashboard/app/(app)/performance/page.tsx.
Show published posts sorted by reach (7d if available, else 24h).
Four grouped views (tabs): by template / by product tier / by hour-of-day / by platform.
Each group shows: average reach, average likes, average saves, post count.
The agent reads these numbers from the metrics table before composing each batch.
No charts for now — a clean sortable table is enough. Charts can come later.

STEP 9 — Audit log middleware.
Create apps/worker/db/audit.py.
Function: log(actor, action, subject_id, payload).
Called by every job, every publisher, every agent action.
This is not optional and is not added later — wire it now in every function that
already exists (compose_batch, publish_due, refresh_tokens, meta.py, youtube.py).

STEP 10 — BOOTSTRAP wizard.
Create apps/worker/bootstrap.py — a CLI wizard run as python -m worker bootstrap.
Walk steps 1–6 from docs/socialfte-spec-v2.md §6 exactly.
Each step writes to a file or the credentials table, then verifies before moving on.
Step 6 (Verify):
  - Test render: call /api/internal/render with dummy props, open URL and print it
  - Test publish: post a private draft to each active platform, print the external_id
  - Test Discord: send a test card, wait for a button click (30s timeout)
  - Delete BOOTSTRAP.md on success
If any verification fails: print the error, do not delete BOOTSTRAP.md, exit 1.
The wizard must be runnable before the dashboard is deployed — it talks to Neon and
the platform APIs directly, not through the dashboard.

STEP 11 — Checkpoint.
[ ] python -m pytest apps/worker/tests/ — all tests pass including new ones
[ ] compose_batch runs manually: python -m worker.jobs.compose_batch
    → verify it inserts posts in 'review' state with render_url filled
[ ] weekly_digest runs manually: python -m worker.jobs.weekly_digest
    → verify MEMORY.md is updated and Discord receives the message
[ ] Performance screen loads with data at /performance
[ ] Audit log has rows for every action in the compose_batch run
[ ] git commit -m "week4: brain, loop, bootstrap"
```

---

## PROMPT 5 — Motion, Calendar, and Generalise

```
We are in Week 5. Read docs/repo-harvest.md §3b (Remotion) and §4 (the two
adaptations) before starting.

STEP 1 — Remotion 9:16 compositions.
Read .claude/skills/vidtsx-2d-generator/SKILL.md and the official Remotion skill
from the directory before writing any composition.

Create four compositions in packages/remotion/src/compositions/:
1. HeroReveal.tsx
   - Base room render (passed as prop: imageUrl)
   - Ken Burns slow zoom (0.95 → 1.05 scale, 150 frames)
   - Text fades in at frame 30: headline then subline
   - Brand mark fades in at frame 90
   - Duration: 5 seconds at 30fps = 150 frames
   - Aspect: 1080×1920

2. PriceReveal.tsx
   - Room render background, dark gradient full-cover
   - Hook text: "Ye kitne ka hoga?" fades in (0–45 frames)
   - At frame 60: price wipes in with a bar animation
   - Brand mark at frame 90
   - Duration: 5 seconds

3. FabricDetail.tsx
   - Slow pan across a detail image (fabric, stitching, gold leg)
   - Overlay text: quality claim in Archivo, small
   - No price, no CTA — pure quality proof post
   - Duration: 4 seconds

4. SetReveal.tsx
   - Split reveal: wardrobe doors wipe open (CSS transform) to reveal the full set
   - Set name + bundle price at the end
   - Duration: 6 seconds

Each composition reads brand colours and fonts from packages/remotion/src/brand.ts
(already written by /brand-setup). No hardcoded hex values.
Run npm run studio and verify all four compositions render without errors before
continuing.

STEP 2 — GitHub Actions render workflow.
Create .github/workflows/render-video.yml.
Trigger: workflow_dispatch with inputs:
  composition_id, props (JSON string), output_key (R2 path)
Steps:
  1. Checkout
  2. npm install in packages/remotion/
  3. npx remotion render {composition_id} out/render.mp4 --props='{props}'
  4. Upload out/render.mp4 to R2 at output_key using aws s3 cp with the R2 endpoint
  5. POST to CALLBACK_URL (the worker's /api/render-complete) with { output_key, status }
Runner: ubuntu-latest (7 GB RAM — this is why we don't render on the VPS).
Secrets needed: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID, R2_BUCKET,
CALLBACK_URL. Add them to the repo secrets and document in docs/github-actions-setup.md.

Create apps/worker/main.py POST /api/render-complete endpoint.
Receives { output_key, status } from the GitHub Action.
Updates the posts row: render_url = R2_PUBLIC_URL/output_key, state = 'review'.

Create apps/worker/jobs/dispatch_render.py.
Function: dispatch_video_render(post_id, composition_id, props).
Calls GitHub API workflow_dispatch via GITHUB_TOKEN.
Polls the run status every 30s (max 15 mins) then stops — the callback handles the rest.
Write a test: mock the GitHub API, verify dispatch sends the correct inputs.

STEP 3 — Audio tools.
Wire apps/worker/jobs/process_footage.py.
When a video clip is uploaded to assets with kind='clip':
  - Call tools/media/clean_voice.py — local RNNoise path only, no ElevenLabs
  - Call tools/media/verify_cut.py — A/V drift check
  - If verify passes: tag asset in DB, update quality_score
  - Call tools/media/mix_music.py — add a music bed from media/library/music/
    at -18dB under the voice
Trigger: APScheduler watches for assets with kind='clip' and processed=false.

STEP 4 — Cover-frames skill.
Wire the /cover-frames flow from docs/repo-harvest.md §4.
In process_footage.py after audio processing:
  - Call tools/media/cutlib.py to extract 12 candidate frames
  - Send all 12 to vision agent (Gemini Flash) for scoring
    Prompt: "Score this frame 0-10 for use as a social media cover. Criteria:
    product fully visible (+3), in focus (+3), composition balanced (+2),
    no motion blur (+2). Return JSON: {score, reason}"
  - Take the top 3 frames, upload to R2 as cover_frame_candidates/{post_id}_1.jpg etc.
  - Add the 3 URLs to the Discord approval card for that post:
    "Pick a cover frame:" with Image 1 / Image 2 / Image 3 buttons

STEP 5 — Calendar screen.
Create apps/dashboard/app/(app)/calendar/page.tsx.
Week view. One column per platform (FB, IG, YT, TikTok).
Each cell shows posts scheduled for that platform on that day.
Click a post: open a side panel with the rendered preview, caption, state badge.
Drag to reschedule: updates scheduled_at in the DB via PATCH /api/posts/{id}.
Show the daily cap as a visual fill bar so overloaded days are obvious.

STEP 6 — Generalise: strip every Yousuf Living hardcode.
Search the entire codebase for any hardcoded value that should come from config:
  - Any hex colour not read from brand.ts or BRAND.md
  - Any price in PKR
  - Any mention of "Yousuf Living" not in a comment or example
  - Any WhatsApp number, page ID, or account ID not in .env
Replace with config reads. The product must be fully generic after this step.

STEP 7 — Second client test.
Do not actually deploy a second client — simulate the onboarding.
Create a directory clients/test-client-2/ with its own .env.example, SOUL.md stub,
and BRAND.md stub.
Run python -m worker bootstrap --env=clients/test-client-2/.env and confirm the wizard
completes without touching any Yousuf Living files.
This proves the isolation boundary works.

STEP 8 — Write the provisioning runbook.
Create docs/client-provisioning.md.
Document every step to onboard a new client:
  1. New Dokploy service (copy environment template)
  2. New Neon project (or schema)
  3. New R2 bucket
  4. Run BOOTSTRAP wizard
  5. Hand over dashboard URL + Discord invite
Estimated time per step. Every env variable that changes per client. Every secret
that must be rotated.

STEP 9 — Final checkpoint.
[ ] npm run studio — all four compositions render at 1080×1920
[ ] Dispatch a test render via GitHub Actions — verify the MP4 arrives in R2
    and the callback updates the post state
[ ] Cover-frame selection: upload a real clip, verify 3 candidate frames appear
    in the Discord approval card
[ ] Calendar screen shows scheduled posts and drag-reschedule works
[ ] grep -r "Yousuf Living" apps/ — returns only comments and example stubs
[ ] python -m worker bootstrap --env=clients/test-client-2/.env -- completes cleanly
[ ] docs/client-provisioning.md exists and is complete
[ ] python -m pytest apps/worker/tests/ — all tests still pass
[ ] git tag v0.1.0
[ ] git commit -m "week5: motion, calendar, generalise — v0.1.0"

---

Congratulations. SocialFTE v0.1.0 is done.
Yousuf Living is the founding client. The provisioning runbook exists.
The next step is selling instance #2.
```

---

## NOTES FOR THE AGENT

Read these before every prompt session:

**SDD rules:**
- One step at a time. Confirm completion before the next.
- If a step fails, fix it before moving on. Do not skip and come back.
- Every test must pass before the checkpoint. No "we'll fix tests later."

**Code style:**
- Python: type hints everywhere, Pydantic for all data shapes, no bare dicts
- TypeScript: strict mode, no `any`, no `as` casts without a comment explaining why
- SQL: raw SQL for schema, SQLAlchemy for runtime — never raw SQL in application code
- Diffs only, never full file rewrites unless the file is new

**What never gets hardcoded:**
- Brand colours, fonts, prices — read from BRAND.md or brand.ts
- API keys — read from env
- Platform IDs — read from env or credentials table
- Model names — read from MODEL_* env vars via the MODEL_MAP

**The two things that will actually break:**
- Meta token expiry: the refresh cron must be in week 3, not later
- Remotion on the VPS: always render on GitHub Actions, never on the box
