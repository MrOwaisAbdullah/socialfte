# Agent Work Log

A running record of what an AI agent did in this repo, session by session. Newest entries
at the top. Each entry: what was asked, what was done, what was found, what's left.

**This file is not optional — see `CLAUDE.md`'s Conventions section.** Every AI session
that changes this repo appends an entry here before finishing, using the format below.
It's the product's own "audit log every action, no action too small" discipline applied to
the agent's own work, not just the product's runtime actions.

This is separate from `history/prompts/` (the gitignored, per-prompt PHR record used by the
Speckit workflow for detailed prompt/response pairs) — this file is the short, committed,
human-readable summary of agent sessions, for anyone reading the repo without access to
that history.

## Entry format

```markdown
## YYYY-MM-DD — short title

**Asked**: what the user requested, in one or two sentences.

**Did**: bullet list of what was implemented/changed/verified.

**Found and fixed** (omit if none): real bugs or gaps discovered and corrected along the
way, not just the planned work — numbered if there's more than one, with enough detail
that a reader understands the actual defect, not just "fixed a bug."

**Left for a human / a real deployment** (omit if none): anything genuinely blocked by
missing infra, credentials, or a decision only a human can make.

**Test status**: the actual command(s) run and their result — not "tests pass," the real
counts (e.g. "89 passed, 1 skipped").
```

---

## 2026-07-28 — Week 5 completion, real-bug-fixing pass, dashboard build fix

**Asked**: Continue `/sp.implement` for Week 5 (motion, calendar, generalise) to
completion; then check for and implement any remaining tasks; then write local
development/deployment docs, ensure `.env.example` completeness, update `README.md`, and
add this log plus a test-results file.

**Did**:
- Finished all 67 tasks in `specs/005-week5-motion-generalise/tasks.md`: four Remotion
  video compositions, GitHub Actions render dispatch, an async video-post lifecycle, a
  clip-processing pipeline (noise cleanup, A/V sync, music mixing, cover-frame selection),
  a Discord cover-frame picker, a full Calendar screen, a de-hardcode/generalisation pass,
  second-client BOOTSTRAP isolation, and `docs/client-provisioning.md`.
- Tagged `v0.1.0`, then re-tagged it after finding and fixing three real bugs the mocked
  test suite couldn't catch (see below) — the tag now points at the corrected commit.
- Unblocked three checkpoint items that were initially marked as sandbox-limited: rendered
  all 4 video compositions to real JPEGs via the programmatic Remotion API (bypassing a
  broken CLI), installed a static `ffmpeg` build with no root access, and ran the full
  clip-processing pipeline against a real generated test clip end-to-end.
- Wrote `docs/local-development-and-deployment.md`, `docs/test-results.md`, this log,
  `apps/worker/.env.example`, and updated `apps/dashboard/.env.example`, the root
  `.env.example`, `README.md`, and `docs/how-it-works.md` to reflect current reality.
- Fixed a real dashboard build error (`Module not found: Can't resolve
  '@neondatabase/serverless'`) in 3 API routes by switching to the existing `pg`-based
  Drizzle client instead of adding an unused, redundant dependency.
- Added real navigation to the dashboard shell and rewrote the home page — it was a Week 2
  stub that said "content screens come later" with no links, even though Calendar and
  Performance existed and worked.

**Found and fixed (bugs, not just gaps)**:
1. `apps/dashboard/proxy.ts`'s session gate didn't exclude `/api/webhooks`, so every
   Discord interaction (including the new cover-frame picker) would have been redirected
   to `/login` instead of returning JSON.
2. `run_bootstrap()`'s top-level guard and `_is_step_done(6)` were both inverted from their
   own documented intent, meaning BOOTSTRAP could never actually complete on a genuinely
   fresh setup, for any client, ever. A prior partial fix only touched one of the two
   inversions.
3. The dev database had never been migrated with this feature's own schema changes
   (`drizzle-kit push` was never run) — found by testing the Calendar's PATCH endpoint
   against real data.
4. `apps/worker/.env` had no `DATABASE_URL`, and `db/session.py` didn't strip Neon's
   `sslmode`/`channel_binding` query params before handing the URL to `asyncpg`.
5. `tools/media/clean_voice.py`'s remux step (`apad` + `-shortest` + `-c:v copy`) hung
   indefinitely instead of terminating — fixed with an explicit `-t` duration cap.
6. `process_footage.py` called `mix_music.py` with `--all`, which silently ignores `--out`
   — the mixed audio file was never actually created. Fixed by switching to `--bed <id>`.
7. Neither vision agent (`vision.py`) bounded `max_tokens`, so every call requested the
   model's full default budget, which the configured OpenRouter account's credit couldn't
   cover — every vision/cover-frame call failed with a 402 until bounded.
8. `apps/dashboard/app/api/internal/{metrics,assets/upload,bootstrap/verify}/route.ts`
   imported `@neondatabase/serverless`, which was never added to `package.json` — broke
   the dashboard build outright. Fixed by using the existing `pg`-based client instead.

**Left for a human / a real deployment**:
- `.github/workflows/render-video.yml` has never been dispatched for real — this repo has
  no `git remote` configured at all, so there's no pushed repo with Actions secrets to
  test against yet.
- The cover-frame picker's final leg (candidates appearing in a real Discord approval
  card) needs a configured `DISCORD_BOT_TOKEN` — the code path is unit-tested, just not
  exercised against a live Discord server.
- `.github/workflows/deploy.yml` only builds/deploys the dashboard image — the worker
  currently redeploys manually (documented in `docs/local-development-and-deployment.md`).

**Test status**: `apps/worker` — 89 passed, 1 skipped. `apps/dashboard` — `npm run
typecheck` clean. Full detail: `docs/test-results.md`.
