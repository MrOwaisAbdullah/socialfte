---
name: octively-validation-and-qa
description: Load before claiming ANY change works, before writing a test, or before answering "is this safe to ship" — covers the evidence hierarchy (why "looks right in the diff" and "it typechecks" are not evidence), the full vitest suite anatomy (tests/vitest.config.ts, chunker/credits-routing/retrieval-isolation.test.ts), how to add a new integration test matching house mocking style, which change classes REQUIRE tests per constitution §VIII (money paths, tenant isolation) vs which require build/manual-QA only, the docs/smoke-tests.md manual QA instrument, and the honest inventory of what is and isn't covered by automated tests. Trigger on "does this work", "add a test", "is this tested", "npm test", "vitest", "smoke test", touching lib/credits, lib/ai/router.ts, lib/knowledge/retriever.ts or chunker.ts, any webhook/auth/proxy change, or claims like "should be fine" / "this looks correct" without having run anything.
---

# Octively: Validation and QA

What counts as evidence that a change works in this repo, the anatomy of the automated
test suite, how to extend it correctly, and the manual QA instrument for everything
automated tests don't reach. Zero project lore assumed.

The repo path contains spaces — always quote it or `cd` first:

```bash
cd "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas"
```

---

## 1. The evidence hierarchy (doctrine)

Rank these from strongest to weakest. Never report a change as "done" or "working" on
evidence weaker than the change class requires (see §4).

| Rank | Evidence | What it proves | What it does NOT prove |
|---|---|---|---|
| 1 (strongest) | **Automated test passes** (`npm test`) | The specific behavior the test asserts, reproducibly, forever | Anything the test doesn't assert — an untested branch can still be broken |
| 2 | **Driving the real flow locally and observing output** — dev server up, a real chat message sent through the widget, a real webhook payload posted with curl, a real DB row inspected | The code path actually executes end-to-end with real inputs | Nothing beyond the specific run you just did — not regression-proof, not repeatable without doing it again |
| 3 | **`npm run build` passes** | The code compiles, type-checks, and Next.js can produce a production bundle | **Nothing about runtime behavior.** A build can pass while the feature is completely broken (wrong logic, wrong query, silently swallowed error) |
| 4 (weakest — NEVER sufficient alone) | **"It typechecks" / `tsc --noEmit`** | Types line up | Behavior. Does not even prove the full app builds (see the Build Gate rule below) |

**Hard rules:**
- **Rank 4 alone is never sufficient**, for any change, ever. This is the Build Gate rule
  from `CLAUDE.md` and constitution §VIII: `tsc --noEmit` alone is explicitly called out as
  insufficient — always run the full `next build`.
- **Rank 3 alone is insufficient for any behavior change.** A passing build tells you the
  code is syntactically and typally coherent, not that the credit debit happens before the
  LLM call, not that the webhook signature check actually rejects a forged payload. For
  behavior changes, pair the build with rank 1 or rank 2 evidence.
- **"Looks right in the diff" is not evidence at any rank.** Reading code and concluding it
  seems correct is not something to report as verification. If you did not run a test, run
  the flow, or run the build, say so plainly instead of implying you checked.
- When reporting completion, name which rank of evidence you used. "Added the refund path
  and ran `npm test` — credits-routing suite passes" is a real claim. "Should work now" is not.

For HOW to gate a change through review/commit/push once you have evidence, defer to
`octively-change-control` — this skill owns the evidence bar, not the gate sequence.

---

## 2. Vitest suite anatomy

Everything under `tests/`. Verified against the repo on 2026-07-06.

### Config — `tests/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
  },
})
```

- **Environment:** `node` — no jsdom/browser shims. Do not write a test here that needs
  `window`, `document`, or DOM APIs; that belongs to a different suite (none currently
  exists for component/DOM tests in this repo).
- **Aliases:** `tsconfigPaths()` reads `tsconfig.json`'s `paths` map (`"@/*": ["./*"]`), so
  test files import production code the same way the app does: `import { x } from '@/lib/...'`.
  No separate alias config to maintain — it just follows `tsconfig.json`.
  **No env file loading** is configured (no `envDir`/`.env` wiring in `vitest.config.ts`)
  — any env var a test needs must be set by the test itself (`process.env.X = ...` or
  `vi.stubGlobal`) or exported before the run (see the real-Neon block below).
- **Include glob:** only `tests/integration/**/*.test.ts` — a `.test.ts` file placed
  anywhere else (e.g. next to the source file, `__tests__/`) will NOT be picked up.

### Run commands

```bash
npm test          # vitest run --config tests/vitest.config.ts — single pass, CI-style
npm run test:watch  # vitest --config tests/vitest.config.ts — watch mode for local iteration
```

Both scripts are defined in `package.json` and both explicitly pass `--config
tests/vitest.config.ts` — running bare `npx vitest` from repo root without `--config` will
not pick up the same include glob/aliases reliably; always use the npm scripts.

### The three test files — what each certifies

| File | Certifies | Test count |
|---|---|---|
| `tests/integration/chunker.test.ts` | `chunkText()` in `lib/knowledge/chunker.ts`: exact-1000-char single chunk, 1201-char text splits into 2 chunks with a verified 200-char overlap, re-splitting an over-long single sentence on word boundaries without inventing content, empty-string and whitespace-only inputs return `[]` | 5 |
| `tests/integration/credits-routing.test.ts` | `routeMessage()` in `lib/ai/router.ts` — FR-029 fallback: zero org balance forces fallback to the bot's default model when classification is `complex`; non-complex classifications always use the default model regardless of balance; `SMART_ROUTING_FORCE_OFF=true` short-circuits to the default model AND skips the classifier fetch entirely | 3 |
| `tests/integration/retrieval-isolation.test.ts` | `retrieveContext()` in `lib/knowledge/retriever.ts` (SC-007, cross-bot isolation): empty DB result → `[]`; low-score rows get filtered; results are deduplicated by text and capped at `topK` — **plus** a `describe.skipIf(!hasDb)` block gated on a real Neon `DATABASE_URL` | 3 mocked + 1 real-DB (skipped by default) |

**Known suite failure (verified by running `npm test` on 2026-07-06 — read this before
trusting "all tests pass"):** the middle assertion in retrieval-isolation.test.ts
("filters out results below the similarity threshold") currently **fails**. It hardcodes
scores of `0.4` and `0.55` and expects `retrieveContext` to filter them out at a `>= 0.65`
cutoff (see the test's own comment, line 32). But `lib/knowledge/retriever.ts` sets
`DEFAULT_THRESHOLD = 0` (line 13) with an explicit comment explaining the 0.65-style floor
was removed because generic "list all products" queries legitimately score 0.05–0.15 and a
threshold was rejected as a design choice (also documented in `octively-failure-archaeology`
as a previously-rejected idea). **The test is stale, not the product code.** Do not "fix" this
by lowering the threshold back — that was already tried and reverted. Fixing the test means
either updating its expected result to include the low-score rows (since threshold=0 admits
them) or removing that assertion and folding threshold-based filtering into the real-DB block.
As of this writing the suite reports `1 failed | 2 passed (3 files)`, `10 passed | 1 failed | 1
skipped (12 tests)` — treat that specific test as a known-red gap in `octively-diagnostics-and-tooling`
territory to fix, not a signal that unrelated changes broke something, but do not claim "all
tests green" until it's actually fixed.

### The real-Neon block — when it runs, and the WSL caveat

```typescript
const hasDb = !!process.env.DATABASE_URL
describe.skipIf(!hasDb)('cross-bot retrieval isolation — real Neon DB', () => {
  it('returns [] for botB when chunks only exist for botA', async () => {
    // placeholder — implement full E2E with seed/cleanup if needed
  })
})
```

- This block is **skipped by default** — `npm test` alone never runs it because
  `DATABASE_URL` is not set by `vitest.config.ts`.
- It only runs if you export `DATABASE_URL` before invoking vitest, e.g.:
  `DATABASE_URL=<neon-url> npx vitest tests/integration/retrieval-isolation.test.ts`.
- **The test body is currently a placeholder** (`expect(true).toBe(true)`) — even when the
  block runs, it does not actually seed botA/botB data or query the real DB yet. Do not
  represent this block as providing real-DB coverage until someone implements the seed/query/
  cleanup logic described in its own comment.
- **WSL caveat:** this repo runs on WSL2, where Neon connections can fail with a generic
  `fetch failed` due to an IPv6/undici resolution issue (unrelated to Neon being down). If
  you point `DATABASE_URL` at a real Neon branch and get `fetch failed` here, do not conclude
  the DB or credentials are broken — first retry with the IPv4-first workaround:
  `NODE_OPTIONS="--dns-result-order=ipv4first --import ./scripts/wsl-net-fix.mjs" npx tsx ...`
  (this preload pattern is documented for standalone scripts; applying the same
  `NODE_OPTIONS` env var to the vitest invocation is the same fix, untested against vitest
  specifically as of 2026-07-06 — verify before relying on it).

### Mocking patterns used (house style — match these in new tests)

| Pattern | Where | Why |
|---|---|---|
| `vi.mock('@/module', () => ({ ... }))` at file top-level, mocking only the named exports the test needs | credits-routing.test.ts mocks `@/lib/credits` (`getBalance`, `debit`, `refund`); retrieval-isolation.test.ts mocks `@/lib/knowledge/embedder` and `@/lib/db` | Isolates the unit under test from real Redis/Postgres/network calls; keeps tests fast and deterministic |
| `vi.stubGlobal('fetch', vi.fn().mockResolvedValue(...))` inside `beforeEach` | credits-routing.test.ts | Stubs the classifier's OpenRouter call so no real network hit happens; re-stubbed per-test when a different response shape is needed |
| Inline mock of `db.execute` rather than a separate mocked variable | retrieval-isolation.test.ts, with the comment "avoids vi.mock hoisting issue" | `vi.mock` factories are hoisted above imports by Vitest; referencing an external `const` inside the factory throws a hoisting error, so the mock object is defined inline in the factory itself |
| `vi.clearAllMocks()` + re-assert default resolved value in `beforeEach` | retrieval-isolation.test.ts | Prevents state (call counts, one-time mock resolutions via `mockResolvedValueOnce`) leaking between tests in the same file |
| No `vi.mock` at all — pure function testing | chunker.test.ts | `chunkText` is a pure function with no I/O; nothing to mock |

**Reconciling constitution §VIII ("no mock databases for tests that exercise data integrity
paths") with actual practice:** the constitution states this as a rule, but
`retrieval-isolation.test.ts` — which exists specifically to certify a data-integrity
property (cross-bot isolation, SC-007) — mocks `@/lib/db` entirely in its primary
`describe` block. **The honest current practice is a two-tier compromise**: the mocked
block verifies the retriever's own logic (threshold filtering, dedup, topK slicing)
assuming the DB already scoped rows correctly; the real isolation guarantee (that the SQL
`WHERE bot_id = ?` clause actually prevents cross-tenant leakage) is asserted only in the
`skipIf(!hasDb)` block, which is a placeholder today. This is a gap, not a resolved
contradiction — if you are adding a new data-integrity test, prefer running it against a
real (test-branch) Neon DB in the `skipIf(!hasDb)` style rather than adding another
DB-mocked test and calling it done. Flag this explicitly if you're asked whether tenant
isolation is "tested" — the honest answer is "partially: filtering logic yes, the actual
SQL WHERE clause no, not yet."

---

## 3. How to add a new integration test (worked checklist)

Follow this for any new `tests/integration/*.test.ts` file:

1. **Placement:** `tests/integration/<feature>.test.ts` — must match the config's include
   glob (`tests/integration/**/*.test.ts`). Anywhere else is silently ignored.
2. **No new config needed** for a plain unit/integration test — `tsconfigPaths()` already
   resolves `@/*` imports and `environment: 'node'` already applies repo-wide.
3. **Import the real production module** via the `@/` alias, exactly as app code does:
   `import { myFunction } from '@/lib/somewhere/my-module'`. Do not import via relative
   `../../../lib/...` paths — inconsistent with house style and breaks if the test file moves.
4. **Decide the mock boundary** before writing assertions:
   - Pure functions (no I/O) → no mocks, test the function directly (see chunker.test.ts).
   - Functions that call Redis/Postgres/network → `vi.mock` the specific `@/lib/...` module
     at the top of the file, returning only the functions the test needs, each wrapped in
     `vi.fn().mockResolvedValue(...)` or `.mockResolvedValueOnce(...)` per-test.
   - If the module under test is itself `@/lib/db`, mock it inline inside the `vi.mock`
     factory (do not reference an outer `const` — hoisting will throw).
   - For a **money-path or tenant-isolation** test, prefer real-DB verification (the
     `skipIf(!hasDb)` pattern) over an all-mocked test — see the reconciliation note above.
5. **Reset mock state** in `beforeEach`: call `vi.clearAllMocks()` if you use
   `mockResolvedValueOnce` anywhere, and re-establish any default mock return value the
   later tests rely on.
6. **Stub global fetch** with `vi.stubGlobal('fetch', ...)` if the code under test calls
   an external HTTP API (OpenRouter, Firecrawl, etc.) — never let a test hit the real network.
7. **Write the assertions**, then run just this file to iterate fast:
   ```bash
   npx vitest run --config tests/vitest.config.ts tests/integration/<feature>.test.ts
   ```
8. **Run the full suite** before calling it done: `npm test`. Confirm your new test passes
   AND that you haven't changed the pre-existing pass/fail count unexpectedly (as of
   2026-07-06 the baseline is 10 passed, 1 known-failed, 1 skipped — see §2).
9. **If the change is a money path or tenant-isolation path**, this test is not optional —
   see §4's constitution §VIII obligation before considering the change reviewable.

---

## 4. Test obligations by change class

| Change class | Constitution/rule basis | Minimum required evidence |
|---|---|---|
| **Money paths** — credit debit/refund, plan pricing math, PayFast/Lemon Squeezy webhook handling, idempotency keys | Constitution §VIII: "Integration tests for all credit debit/refund flows (Redis + Postgres consistency)" | A vitest integration test covering the debit-before-call and refund-on-failure sequence, or (if none exists yet for the path you touched) write one before merging — see §3. Build passing is not sufficient; the credit ledger's correctness is a behavior, not a type. |
| **Tenant isolation** — any query gated by `org_id`/`bot_id`, cross-org data exposure risk | Constitution §VIII: "Integration tests for tenant isolation (cross-org data leakage MUST be impossible)" | A test that proves data scoped to org/bot A is never returned for org/bot B — the mocked style in retrieval-isolation.test.ts is the current bar, but prefer extending the real-DB `skipIf(!hasDb)` block for anything beyond retrieval filtering logic (see §2 reconciliation note) |
| **UI changes** — any component/page on any of the four surfaces | `octively-ui-surfaces` (token/canvas/typography rules) | Surface/token compliance check against `octively-ui-surfaces` (which points to `DESIGN.md` for anything non-trivial) + `npm run build` passing. No vitest coverage exists for UI/DOM in this repo — do not claim a UI change is "tested" by `npm test`. |
| **Widget changes** — anything in `embed/src/embed.js` | `CLAUDE.md` Embed Widget Build Rule | `npm run build:embed` (rebuilds `embed/dist/embed.min.js` and copies to `public/embed.js`) run BEFORE `npm run build`, **plus** a manual embed test: paste the `<script>` snippet into a real third-party HTML page (not just the dashboard preview iframe) and confirm the widget loads and completes a chat round-trip. This is rank-2 evidence (§1) — no automated test drives the embed script today. |
| **Prompt/LLM behavior changes** — system prompt edits, routing classifier changes, model swaps | `octively-research-methodology` (defines the eval bar) | An ad-hoc eval per that skill's evidence bar — a passing build or a single manual chat message is not sufficient to claim a prompt change "works better"; predict the expected behavior change first, then verify against multiple representative inputs |
| **Everything else (docs, config-only, non-behavioral refactors)** | Constitution §VIII Build Gate | `npm run build` passing is sufficient IF the change genuinely has no runtime behavior path to exercise — if in doubt, it's a behavior change, apply the row above it |

For the gating/review/push mechanics around any of these (who approves, what commit format,
when a spec/ADR is required), defer entirely to `octively-change-control` — this table only
states the evidence bar, not the process gate.

---

## 5. Manual QA instrument — `docs/smoke-tests.md`

A pass/fail/skip checklist run by a human or agent against a live deployment, not by vitest.

- **Structure:** 14 numbered sections (Routing & Subdomains, Developer Auth, Client Auth, Bot
  Management, Embed Widget & Chat, Knowledge Base/Documents, Conversations, Leads, Credits,
  Admin Panel, Emails, API Endpoints, Marketing Site, Post-Deploy Infra Checks), each a table
  of numbered checks (e.g. `5.7`) with a `Result` column.
- **Recording convention** (the file's own header, verbatim): mark each result
  `✅ pass` · `❌ fail (note what broke)` · `⏭ skip (feature not deployed yet)`. The header
  block also records **Date / Deploy #** (e.g. "2026-05-28 / #7") and **Tester** — always
  update both fields for a new run rather than silently overwriting the previous run's marks.
- **Sign-off block** at the end: "All critical checks passed?", "Known failures deferred to
  next deploy?", "Budget log updated?", and a tester signature line — fill these in, don't
  skip them.
- **When to run:** the file's own instruction is "after every production deploy." A full
  pass covers all 14 sections. A minimal pass (when you already know only one surface
  changed — e.g. a marketing-only copy edit) is reasonable but is not this file's own
  documented convention; if you do a partial run, mark the untouched sections `⏭ skip` with
  a reason rather than leaving them blank or silently marking them pass.
- **Note the doc's drift:** the header currently reads "after every production deploy to
  `release`" and section 14 checks "Netlify deploy status" — both reflect an older deploy
  topology. Per `octively-run-and-operate`, current production deploy is `git push origin
  master` → GHCR → Dokploy (Netlify decommissioned). Use the checklist's *content* (what to
  check) but mentally substitute the current deploy mechanism for stale references — this
  is documented drift, not a rewrite mandate for this skill to perform.
- This skill owns the discipline of treating this file as required evidence for a deploy;
  the actual deploy mechanics and post-deploy operational smoke process are owned by
  `octively-run-and-operate` — do not duplicate that content here.

---

## 6. Certified / golden inventory — the honest gap list

**What IS pinned by automated tests today** (3 files, verified 2026-07-06):

| Behavior pinned | File |
|---|---|
| Chunk boundary math: 1000-char target, 200-char overlap, word-boundary re-splitting, empty-input handling | chunker.test.ts |
| Smart-routing credit fallback (FR-029) and the `SMART_ROUTING_FORCE_OFF` kill switch | credits-routing.test.ts |
| Retrieval result shape: empty-DB handling, dedup, topK cap (threshold-filtering assertion currently broken — see §2) | retrieval-isolation.test.ts |

**What is NOT covered by any automated test** (verified by the fact that only these 3 files
exist under `tests/integration/` — confirmed via `find`, no other `*.test.ts`/`*.spec.ts`
files exist in the repo as of 2026-07-06):

| Uncovered critical path | Files involved |
|---|---|
| Webhook handlers — PayFast ITN verification, Lemon Squeezy webhook signature check, idempotency | `app/api/webhooks/payfast/`, `app/api/webhooks/lemon-squeezy/` |
| Proxy/subdomain routing — the four-surface hostname routing itself | `proxy.ts` |
| Auth guards — session checks, role enforcement (developer vs client), cross-role access prevention | `lib/auth/` (`client.ts`, `index.ts`, `session.ts`) |
| Embed serving — the actual `/embed.js` route and `/api/embed` route that serve the widget | `app/embed.js/route.ts`, `app/api/embed/route.ts` |
| The chat API route itself (credit debit/refund integration at the route level, not just the router's classification logic) | `app/api/v1/chat/route.ts` (referenced in `octively-architecture-contract`) |

**State this plainly when asked "is X tested":** unless X is one of the three pinned
behaviors above, the honest answer is "no automated test covers this — verification is
manual (docs/smoke-tests.md) or rank-2 (drive the flow locally)." Do not imply broader
coverage exists because "there's a tests folder."

---

## 7. Pre-push checklist

The authoritative gate sequence and its rationale live in `octively-change-control` —
this is the evidence-gathering checklist that feeds that gate, in order:

1. `npm test` — run the full vitest suite. Know going in that 1 test is currently
   known-failed (§2) — do not let a pre-existing red hide a new regression; diff the
   failure count/names against the 2026-07-06 baseline (10 passed / 1 failed / 1 skipped).
2. If you touched `embed/src/embed.js`: `npm run build:embed` FIRST (rebuilds
   `embed/dist/embed.min.js` and copies to `public/embed.js`), then proceed to step 3.
3. `npm run build` — must exit 0. Non-negotiable, every change, including single-line
   fixes (constitution §VIII Build Gate, `CLAUDE.md`).
4. If the change touches a money path or tenant isolation: confirm a test exists and
   passes for it (§4) — write one now if it doesn't.
5. If the change touches UI: run the surface/token check against `octively-ui-surfaces`.
6. If the change touches the widget: manually embed-test on a real third-party HTML page.
7. If the change is prompt/LLM behavior: run the ad-hoc eval per
   `octively-research-methodology`.
8. After deploy: run the relevant section(s) of `docs/smoke-tests.md` (§5).
9. Hand off to `octively-change-control` for the commit/push mechanics, owner-approval
   checks, and changelog/roadmap sync rule.

---

## When NOT to use this skill

- Need to run a diagnostic DB query, inspect Drizzle Studio, or check analytics/funnel
  tables → `octively-diagnostics-and-tooling`.
- Need the actual deploy mechanics or post-deploy smoke-test *execution* against the live
  Dokploy/Hetzner stack → `octively-run-and-operate`.
- Need to know if a change requires a spec/ADR, who approves it, or the commit/push gate
  sequence itself → `octively-change-control`.
- Need the eval bar for a research/prompt hypothesis in depth (predict-numbers-first,
  adversarial refutation) → `octively-research-methodology`.
- Need per-surface token/canvas rules to do the UI compliance check referenced in §4 →
  `octively-ui-surfaces`.
- Need to know if a proposed fix was already tried and rejected (e.g. a similarity
  threshold) → `octively-failure-archaeology`.

---

## Provenance and maintenance

Date-stamped: 2026-07-06. Re-verify these volatile facts before trusting them on a later date:

```bash
cd "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas"

# Test file inventory — confirm still only 3 integration test files exist
find . -path ./node_modules -prune -o -name "*.test.ts" -print -o -name "*.spec.ts" -print | grep -v node_modules

# Vitest/tsconfig-paths versions
grep -n '"vitest"\|"vite-tsconfig-paths"\|"@vitest/coverage-v8"' package.json

# Full suite pass/fail baseline (expect the known threshold-test failure until fixed)
npm test

# Confirm the retriever's threshold constant hasn't changed back
grep -n "DEFAULT_THRESHOLD" lib/knowledge/retriever.ts

# Confirm chunker constants
grep -n "TARGET_SIZE\|OVERLAP" lib/knowledge/chunker.ts

# Confirm constitution §VIII wording hasn't shifted
grep -n "Testing discipline" -A6 .specify/memory/constitution.md

# Confirm the uncovered-path file list still holds (no new test files added there)
ls app/api/webhooks/payfast app/api/webhooks/lemon-squeezy lib/auth app/embed.js app/api/embed
```
