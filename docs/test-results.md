# Test Results

Latest run: 2026-07-28 (Week 5 implementation + real-bug-fixing pass + dashboard build fix).

## Worker (`apps/worker/tests/`)

```
python -m pytest tests/ -v
```

**Result: 89 passed, 1 skipped, 47 warnings in 178.29s**

The 1 skip is `test_brain_base.py::test_free_tier_round_trip` — intentionally skipped when
`OPENROUTER_API_KEY` isn't configured for a free-tier round-trip call; not a failure.

The 47 warnings are all `RuntimeWarning: coroutine 'AsyncMockMixin._execute_mock_call' was
never awaited` — a benign artifact of mocking `session.add()` (a sync SQLAlchemy method) as
an `AsyncMock` across several test files. Cosmetic; doesn't affect correctness or exit code.

### By file

| File | Tests | Status |
|---|---|---|
| `test_anti_repeat.py` | 7 | ✅ all passed |
| `test_bootstrap.py` | 4 | ✅ all passed |
| `test_bootstrap_isolation.py` | 2 | ✅ all passed |
| `test_brain_base.py` | 5 | ✅ 4 passed, 1 skipped (no API key) |
| `test_collect_metrics.py` | 4 | ✅ all passed |
| `test_compose_batch.py` | 2 | ✅ all passed |
| `test_composer.py` | 4 | ✅ all passed |
| `test_credentials.py` | 6 | ✅ all passed |
| `test_discord.py` | 7 | ✅ all passed |
| `test_dispatch_render.py` | 3 | ✅ all passed |
| `test_meta.py` | 4 | ✅ all passed |
| `test_notify_review.py` | 4 | ✅ all passed |
| `test_process_footage.py` | 7 | ✅ all passed |
| `test_publish_due.py` | 5 | ✅ all passed |
| `test_refresh_tokens.py` | 4 | ✅ all passed |
| `test_tiktok.py` | 5 | ✅ all passed |
| `test_vision.py` | 4 | ✅ all passed |
| `test_weekly_digest.py` | 2 | ✅ all passed |
| `test_youtube.py` | 11 | ✅ all passed |

## Dashboard (`apps/dashboard/`)

```
npm run typecheck
```

**Result: clean, zero errors.** This includes the fix for the `@neondatabase/serverless`
module-resolution error that was previously present in 3 files (`api/internal/metrics`,
`api/internal/assets/upload`, `api/internal/bootstrap/verify`) — replaced with the existing
`pg`-based Drizzle client (`@/lib/db/client`) instead of adding a redundant, unused
dependency, so the dashboard now builds cleanly with no missing packages.

There is no dashboard automated test suite yet — verification beyond typecheck is manual
(see `docs/local-development-and-deployment.md`) or, for the Calendar/BOOTSTRAP flows,
verified live against a real database as documented in `specs/005-week5-motion-generalise/tasks.md`.

## Real, non-mocked end-to-end verification

Beyond the automated suites above, the following were run for real against live
infrastructure (not mocked) during this work — see `specs/005-week5-motion-generalise/tasks.md`
Phase 6 and Phase 11 for full detail:

- **Calendar screen**: real dev server, real session cookie, real DB inserts/reschedules
  through the running API, including a genuine over-cap case (`count:3, cap:2, overCap:true`).
- **BOOTSTRAP `--env` isolation**: a full non-interactive run against `clients/test-client-2/`,
  confirmed via `stat`/`git status` that the real repo root's identity files were untouched.
- **Video composition rendering**: all 4 new Remotion compositions rendered to real JPEG
  stills via the programmatic bundler/renderer API and visually inspected.
- **Clip-processing pipeline**: a full real run of `process_footage()` against a real
  generated test clip — real ffmpeg noise cleanup, real A/V sync check, real music mixing,
  real 12-frame extraction, real OpenRouter vision scoring, real R2 uploads. Found and fixed
  three real bugs in the process (an `ffmpeg`/`apad` hang, a `mix_music.py` CLI-flag
  mismatch, and an unbounded `max_tokens` causing 402 errors) — see `tasks.md` T026/T027/T033.
- **Dashboard home page / nav / metrics route**: after fixing the `@neondatabase/serverless`
  build error, ran the dev server and confirmed `/`, `/calendar`, `/performance`, and
  `/api/internal/metrics` all return `200` with the expected content.
