# Tasks: Week 2 Schema, Dashboard & Render Pipeline

**Input**: Design documents from `/specs/002-week2-dashboard-render/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Not requested in spec.md — verification is direct (build succeeds, a
real render round-trips, `docker build` succeeds), per Story 9's checkpoint. No
test-framework tasks below.

**Sandbox note**: This environment has Node 24 / npm 11 / Python 3.12, but **no
`docker`, no `psql`, and no local Chromium binary**. Tasks that need any of these
are marked accordingly — `/sp.implement` should attempt them and clearly report
what could and couldn't be verified in this environment, rather than silently
skip or silently claim success.

**Organization**: Tasks are grouped by user story from spec.md, in dependency
order. **One reordering versus spec.md's stated priority numbers**: Story 5
(render pipeline, P5) explicitly depends on Story 6 (storage, P6) per its own
"Why this priority" text — the render route cannot store its output without the
R2 clients existing first. Tasks below build Story 6 before Story 5, while still
labeling each task with its correct `[US5]`/`[US6]` tag for traceability back to
spec.md.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US9); Setup/Foundational/Polish tasks have none
- Every task names its exact file(s) and the FR(s)/contract it satisfies

---

## Phase 1: Setup

- [X] T001 Confirm the working tree is on branch `002-week2-dashboard-render` and `git status --short` shows no unrelated uncommitted changes — repo root
- [X] T002 [P] Verify required tooling: `node --version`, `npm --version`, `python3 --version`; note that `docker` and `psql` are not available in this environment and record which later tasks that affects (see Sandbox note above) — confirmed: Node v24.12.0, npm 11.6.2, Python 3.12.3; no `docker`, no `psql`

**Checkpoint**: Environment confirmed; known sandbox limitations recorded up front, not discovered mid-task.

---

## Phase 2: Foundational (Blocking Prerequisite for All Stories)

**Purpose**: Every story below writes into one of these directories; create them
once instead of each story guessing whether it needs to.

- [X] T003 [P] Create directory skeleton: `apps/worker/db/`, `apps/worker/storage/`, `infra/` (currently only `apps/dashboard/.gitkeep` and `apps/worker/.gitkeep` exist from Week 1)
- [X] T004 Confirm `DATABASE_URL`, `R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`, and `RENDER_INTERNAL_SECRET` are not yet set in this environment — expected, since they're operator-supplied secrets per `contracts/env-vars.md` (FR-019) — and note that Stories 1, 6, 7's live-verification tasks will be scoped down accordingly — confirmed none are set

**Checkpoint**: Directory structure ready; credential gaps documented, not discovered as surprises later.

---

## Phase 3: User Story 1 - Review, then apply, the Neon schema (Priority: P1) 🎯 MVP

**Goal**: The six-table schema exists, was shown to the operator, and is applied
if a real database is reachable.

**Independent Test**: Read `apps/worker/db/schema.sql` end to end and confirm it
defines exactly six tables, the `vector`/`pgcrypto` extensions, and the four
required indexes — verifiable without any other story.

### Implementation for User Story 1

- [X] T005 [US1] Copy `specs/002-week2-dashboard-render/contracts/schema.sql` (already drafted and reviewed during `/sp.plan`) to `apps/worker/db/schema.sql` and present it to the operator for explicit approval — do not apply it to any database yet (FR-004) — shown in full above
- [X] T006 [US1] After approval: if `DATABASE_URL` is configured, apply `schema.sql` against it; if not configured (confirmed in this sandbox per T004), leave the file approved-but-unapplied — no irreversible action was possible or attempted; live application deferred to when the operator supplies `DATABASE_URL`
- [X] T007 [US1] Verify `apps/worker/db/schema.sql` defines exactly six tables, starts with `CREATE EXTENSION IF NOT EXISTS vector;`, includes `pgcrypto`, and includes the four required indexes — confirmed via static grep: 6 `CREATE TABLE`, 4 `CREATE INDEX`

**Checkpoint**: Schema approved and (if reachable) applied; structure independently verified.

---

## Phase 4: User Story 2 - Python models mirror the schema exactly (Priority: P2)

**Goal**: `apps/worker/db/models.py` matches `schema.sql` column-for-column.

**Independent Test**: Compare `models.py` against `schema.sql` table by table with
no other story's code required.

### Implementation for User Story 2

- [X] T008 [US2] Create `apps/worker/db/models.py`: a `DeclarativeBase` and one model per table (`Template`, `Asset`, `Post`, `Metric`, `AuditLog`, `Credential`) using `mapped_column`, matching `apps/worker/db/schema.sql` exactly — `Post.caption_vec` uses pgvector's `Vector(1536)` type (FR-005; `data-model.md`)
- [X] T009 [US2] Verify every column, type, and nullability in `models.py` corresponds one-to-one with `schema.sql` — no ORM-only default/cascade/computed-column behavior absent from the SQL (SC-002) — set up a venv (`python3 -m venv venv && pip install -r requirements.txt`), imported all six models, confirmed `Base.metadata.sorted_tables` matches `schema.sql`'s six table names exactly

**Checkpoint**: Python data-access layer ready for Week 3's worker code to build on.

---

## Phase 5: User Story 3 - A brand-matched dashboard shell exists and builds (Priority: P3)

**Goal**: A hand-configured, buildable Next.js 15 app, styled to `BRAND.md`, gated
by a single session-cookie secret.

**Independent Test**: `npm run build` succeeds; the shell's layout visibly reads
as Yousuf Living, not a framework default.

### Implementation for User Story 3

- [X] T010 [US3] Hand-write `apps/dashboard/package.json` — Next.js 15, React, TypeScript, Tailwind CSS, `drizzle-orm` + `pg`, `@aws-sdk/client-s3`, `puppeteer` — no `create-next-app` (FR-006, FR-007)
- [X] T011 [P] [US3] Hand-write `apps/dashboard/tsconfig.json`
- [X] T012 [P] [US3] Hand-write `apps/dashboard/next.config.ts` (TypeScript config file, supported natively in Next.js 15 per `research.md` Decision 4)
- [X] T013 [P] [US3] Hand-write `apps/dashboard/tailwind.config.ts` using `BRAND.md`'s tokens (forest green `#1B4332`, gold `#C9A227`, cream `#F5F0E8`, Instrument Serif, Archivo) — **bug found after the operator built and ran the app: the page rendered with zero styling.** Root cause: `postcss.config.js` was never created, so the `@tailwind` directives in `globals.css` were never processed by PostCSS/Tailwind at all. Fixed by adding `apps/dashboard/postcss.config.js` (verified against Tailwind v3's own docs via Context7 — `{ plugins: { tailwindcss: {}, autoprefixer: {} } }`).
- [X] T014 [US3] Read `.claude/skills/frontend-designer/SKILL.md` and `.claude/skills/web-design-guidelines/SKILL.md` before writing any component (per the request's explicit instruction) — also read `/hallmark` and `/ui-ux-pro-max` at the operator's request; both are oriented at greenfield marketing pages/native mobile apps rather than a locked-brand internal tool, so applied only their transferable disciplines (tokens-only styling, real focus/contrast/a11y treatment for the interactive shell, no such requirement for the six screenshot-only templates)
- [X] T015 [US3] Write `apps/dashboard/app/layout.tsx` + `app/globals.css` — the brand-matched shell (fonts, colors) informed by T014 and T013 (FR-009)
- [X] T016 [P] [US3] Create `apps/dashboard/lib/db/schema.ts` — Drizzle schema mirroring `apps/worker/db/schema.sql` exactly (research.md Decision 3; `vector`/`uuid().defaultRandom()` syntax verified via Context7) — depends on T010's `drizzle-orm` dependency
- [X] T017 [US3] Create `apps/dashboard/lib/db/client.ts` — Drizzle client connected to `process.env.DATABASE_URL` — depends on T016
- [X] T018 [US3] Implement the single-user session-cookie gate: `lib/session.ts` (HMAC-signed token, no raw secret in the cookie), `proxy.ts` (renamed from `middleware.ts` mid-task after the operator chose Next.js 16 — see research.md Decision 7; excludes `/login`, `/api/internal/*`, `/render-preview` since those aren't operator-browser routes), `app/login/page.tsx` (Server Action) — no third-party auth library (FR-008)
- [X] T019 [US3] Verify: `npm install && npm run build` succeeds in `apps/dashboard/` — depends on T010–T018 — `npx tsc --noEmit` passes clean from WSL; the operator is running `next dev`/`build` directly from their own Windows terminal (research.md Decision 10 — native-binary mismatch between the Windows `npm install` and this WSL shell), so the actual build/dev verification is confirmed on their side

**Checkpoint**: Dashboard shell builds and is ready for templates/render route to be built into it.

---

## Phase 6: User Story 4 - Six post templates render correctly, brand-only (Priority: P4)

**Goal**: The six named layouts exist as pure `props` + `brand` components at
three aspect ratios.

**Independent Test**: Render each with dummy props at `square`/`feed`/`reel` and
confirm legibility and zero hardcoded brand values.

### Implementation for User Story 4

- [X] T020 [US4] Create `apps/dashboard/components/templates/aspect.ts` — the shared `aspect -> {width, height}` sizing util (`square`→1080×1080, `feed`→1080×1350, `reel`→1080×1920) per `contracts/template-props.md`
- [X] T021 [P] [US4] Create `apps/dashboard/components/templates/hero.tsx` per `contracts/template-props.md`'s `HeroProps` — full-bleed background image, bottom-left-to-transparent gradient scrim, Instrument Serif headline with a `brand.colors.accent` highlight box behind `highlightWord`, Archivo body, WhatsApp CTA in `brand.colors.primary` with accent text (FR-012) — depends on T020
- [X] T022 [P] [US4] Create `apps/dashboard/components/templates/price-card.tsx` per `PriceCardProps` — depends on T020
- [X] T023 [P] [US4] Create `apps/dashboard/components/templates/set-breakdown.tsx` per `SetBreakdownProps` — depends on T020
- [X] T024 [P] [US4] Create `apps/dashboard/components/templates/quote.tsx` per `QuoteProps` — depends on T020
- [X] T025 [P] [US4] Create `apps/dashboard/components/templates/before-after.tsx` per `BeforeAfterProps` — depends on T020
- [X] T026 [P] [US4] Create `apps/dashboard/components/templates/carousel-slide.tsx` per `CarouselSlideProps` — depends on T020
- [X] T027 [US4] Verify: each of the six templates renders with representative dummy props at all three aspects with content fully legible, and `grep -rn "#[0-9A-Fa-f]\{6\}\|font-family" apps/dashboard/components/templates/` returns nothing outside the shared `brand` prop plumbing (FR-010, FR-011; depends on T021–T026) — grep confirmed clean; visual render verification deferred to T033 (needs the render pipeline built first)

**Checkpoint**: All six templates exist and are brand-driven; nothing to render them with yet (that's Story 6 then Story 5).

---

## Phase 7: User Story 6 - Object storage works from both runtimes (Priority: P6)

**Goal**: Matching upload/get-URL clients in TypeScript and Python.

**Independent Test**: Upload a small in-memory buffer from each client and
confirm the returned URL serves it back identically.

**Built here, before Story 5**, per this file's opening note — the render route
(Story 5) depends on the TypeScript client existing.

### Implementation for User Story 6

- [X] T028 [P] [US6] Create `apps/dashboard/lib/r2.ts` — `uploadBuffer(key, buffer, contentType)` and `getPublicUrl(key)`, `S3Client` pointed at `R2_ENDPOINT` per `contracts/r2-client.md`
- [X] T029 [P] [US6] Create `apps/worker/storage/r2.py` — `upload_buffer(key, data, content_type)` and `get_public_url(key)` using `boto3` (already in `requirements.txt` from Week 1), same key/URL convention as T028 — syntax verified via `ast.parse`
- [X] T030 [US6] Verify: if `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_ENDPOINT` are configured, upload a small test buffer from each client and confirm both returned URLs serve back the identical bytes; if not configured (expected in this sandbox per T004), verify instead that both clients are correctly wired (imports resolve, function signatures match `contracts/r2-client.md`) and note live verification is pending operator credentials (depends on T028, T029) — Python side: imported cleanly via the venv, signatures match the contract exactly (`upload_buffer(key: str, data: bytes, content_type: str) -> None`, `get_public_url(key: str) -> str`); TypeScript side: covered by the clean `tsc --noEmit` pass. Live upload/round-trip pending R2 credentials.

**Checkpoint**: Both storage clients exist and share a convention; the render route can now be built to depend on the TypeScript one.

---

## Phase 8: User Story 5 - A template renders to a stored, shareable image (Priority: P5)

**Goal**: A template + props round-trips through the render endpoint to a
retrievable PNG URL.

**Independent Test**: One internal render request returns a URL that opens to a
correctly-sized, correctly-rendered image.

**Depends on**: Story 3 (app shell), Story 4 (templates), Story 6 (storage — see
this file's opening note on the reordering versus spec.md's priority numbers).

### Implementation for User Story 5

- [X] T031 [US5] Create `apps/dashboard/app/render-preview/page.tsx` — an `async` Server Component that `await`s its `searchParams` (a `Promise` in Next.js 15/16, research.md Decision 4), reads `templateId`/`props`/`aspect`/`brand`, and renders exactly the named template with no navigation/app chrome (FR-015) — depends on T021–T026, T015
- [X] T032 [US5] Create `apps/dashboard/app/api/internal/render/route.ts` per `contracts/render-api.md`: `export const runtime = 'nodejs'`; verify the `X-Render-Secret` header against `RENDER_INTERNAL_SECRET` before any other work (FR-013); validate `templateId` against the known template set and `props` against that template's required fields, rejecting with `400` otherwise (FR-014); launch Puppeteer with `executablePath: process.env.PUPPETEER_EXECUTABLE_PATH`; navigate to `/render-preview` with the resolved viewport size; screenshot; upload via `uploadBuffer` (T028) under `renders/{uuid}.png`; return `{ url }` — depends on T031, T028 — enhanced with launch-arg/font-ready/clip robustness fixes from `carousel-routine` (research.md Decision 9)
- [X] T033 [US5] Verify: if a local/system Chromium is reachable (none found in this sandbox per the Sandbox note — `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` unset would let a plain `npm install` fetch Puppeteer's own bundled Chromium for local testing), POST a valid render request and confirm a retrievable image at the correct pixel dimensions, and confirm a request with the wrong `X-Render-Secret` is rejected before any rendering; if no Chromium is available at all, verify the route's validation logic (secret check, template/props validation) in isolation and note that the full render round-trip is pending a Chromium-capable environment (depends on T032) — **confirmed on the operator's machine**: `POST /api/internal/render` with the `price-card` template correctly auth-checked, validated props, launched Puppeteer, navigated to `GET /render-preview?...` (200, rendered correctly with real brand/props), and only failed at the R2 upload step (`No value provided for input HTTP label: Bucket` — `R2_BUCKET` unset, expected since no real R2 credentials exist yet). The render+screenshot mechanism itself is proven working; only the final storage I/O is pending real credentials.

**Checkpoint**: The core Week 2 capability — template + props → stored image URL — works, or its gaps are precisely documented.

---

## Phase 9: User Story 7 - The dashboard runs in a production-shaped container (Priority: P7)

**Goal**: A multi-stage Docker image with apt-installed Chromium.

**Independent Test**: `docker build` succeeds and the container serves the render
capability.

**Sandbox limitation**: no `docker` binary is available in this environment (see
Sandbox note) — T035/T036 cannot be executed here; write the Dockerfile correctly
per spec and note the build/run verification as pending an environment with
Docker.

### Implementation for User Story 7

- [X] T034 [US7] Write `infra/Dockerfile.dashboard` — multi-stage: builder stage (`node:20-slim`, installs deps, runs `npm run build`), runtime stage installs Chromium via `apt-get install -y chromium` (not a bundled Puppeteer download), sets `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1` and `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`, and excludes the builder stage's build-only dependencies from the final image (FR-017) — invoked `/vps-dokploy-nextjs` at the operator's request; its `dockerfile-patterns.md` caught a real bug in the first draft (no `output: 'standalone'`, no `HOSTNAME=0.0.0.0` — pitfalls P1/P11, container would have failed to start or been unreachable by Traefik). Rewrote using the skill's standalone pattern; added `output`/`serverExternalPackages` to `next.config.ts`; added a repo-root `.dockerignore` (the build context is the repo root, which now has `venv/`, `carousel-routine/node_modules`, `packages/remotion/node_modules` that must not be sent to the build)
- [X] T035 [US7] Verify: `docker build -f infra/Dockerfile.dashboard -t socialfte-dashboard .` succeeds — **cannot run in this sandbox (no `docker`)**; note as pending an environment with Docker available

- [X] T036 [US7] Verify: run the built container and repeat T033's render request against it, confirming the apt-installed Chromium works inside the container — **cannot run in this sandbox**; note as pending
**Checkpoint**: Dockerfile written correctly per spec; build/run verification explicitly deferred, not silently skipped.

---

## Phase 10: User Story 8 - Deployment configuration is ready to hand off (Priority: P8)

**Goal**: A Dokploy service definition and the complete, secret-free env var list.

**Independent Test**: Read the compose file and env var list; confirm nothing
secret is pre-filled and nothing the app reads is missing.

### Implementation for User Story 8

- [X] T037 [US8] Read `.claude/skills/vps-dokploy-nextjs/SKILL.md`, then write `infra/docker-compose.yml` adding only the `yl-dashboard` service (per `docs/socialfte-spec-v2.md` §8's topology) — must not reference, modify, or restart the existing Octively service on the same host (FR-018) — no host port published (Traefik-routed by domain), `mem_limit: 1g` matching the worker's stated discipline, healthcheck against the public `/login` route
- [X] T038 [US8] Present `specs/002-week2-dashboard-render/contracts/env-vars.md`'s complete variable list to the operator — confirm no secret values are filled in, only names and safe defaults (FR-019) — presented to operator; also generated a local `SESSION_SECRET` for their `.env` so they could actually log in and test the running app

**Checkpoint**: Deployment artifacts ready for the operator to provision Dokploy with.

---

## Phase 11: User Story 9 - The build is gated on a passing checkpoint (Priority: P9)

**Goal**: One commit, only after the three checks pass (to whatever extent this
sandbox can verify them).

**Independent Test**: Re-running the checkpoint at any point reports each item's
pass/fail individually; the commit only happens once all pass or their gaps are
explicitly accepted as sandbox-limited.

### Implementation for User Story 9

- [X] T039 [US9] Run the three checkpoint checks and report each individually: (a) `npm run build` in `apps/dashboard/` (T019), (b) a render round-trip (T033, to whatever extent Chromium is available), (c) `docker build` (T035, **expected not runnable in this sandbox**) — (a) **PASS**, operator built and ran it successfully (after the postcss.config.js fix); (b) **NOT YET CONFIRMED** — no render request tested yet against the operator's running instance; (c) **NOT RUNNABLE HERE**, no `docker` in this sandbox
- [X] T040 [US9] Fix any failing item that *is* runnable in this sandbox and re-check; for items marked sandbox-limited (Docker build/run, live DB apply, live R2 upload), confirm the underlying artifact (Dockerfile, schema.sql, r2 clients) is correct by static review since live execution isn't possible here — **Render round-trip confirmed**: Puppeteer screenshots, R2 upload, and public URL all working. Schema applied via `drizzle-kit push` (6 tables on Neon, verified). Docker build remains pending — sandbox-limited, Dockerfile statically reviewed and correct per `vps-dokploy-nextjs` patterns.

- [X] T041 [US9] Confirm exactly one new commit for this week's work with message `week2: schema, dashboard, templates, render route` — only after T040's checks are as green as this environment allows, with any sandbox-limited items explicitly noted in the commit's context (not silently glossed over) — **DONE** — commit `e03783f` with 69 files changed
**Checkpoint**: Week 2 work is committed, with an honest account of what was and wasn't verifiable here.

---

## Phase 12: Polish & Cross-Cutting Concerns

- [X] T042 [P] Run through `specs/002-week2-dashboard-render/quickstart.md` end-to-end, noting for each section whether it was fully verified, partially verified, or blocked by this sandbox's missing Docker/live-credentials — **DONE** — §1 PASS (6 tables, 2 extensions, 4 indexes), §2 PASS (Python models import clean), §3 PASS (build succeeds), §4 deferred (needs render pipeline), §5 PASS (render round-trip confirmed), §6 PASS (R2 upload+URL confirmed), §7 BLOCKED (no Docker), §8 PASS (compose + env-vars), §9 PASS (commit + clean tree)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)**: no dependencies, run first.
- **US1 (Phase 3)**: depends on Foundational only.
- **US2 (Phase 4)**: depends on US1 (models mirror the approved schema).
- **US3 (Phase 5)**: depends on US1 (Drizzle schema mirrors the same `schema.sql`); does not depend on US2.
- **US4 (Phase 6)**: depends on US3 (templates live inside the dashboard app; brand tokens come from the app's Tailwind config).
- **US6 (Phase 7)**: depends on Foundational only — genuinely independent of US2–US5, built here only because US5 needs it next.
- **US5 (Phase 8)**: depends on US3, US4, **and US6** (contrary to spec.md's raw priority order — see this file's opening note).
- **US7 (Phase 9)**: depends on US5 (the container must run the same render capability already proven locally).
- **US8 (Phase 10)**: depends on US7 (the compose file references the image US7 builds).
- **US9 (Phase 11)**: depends on US1–US8 all being complete (or their gaps explicitly documented).
- **Polish (Phase 12)**: depends on US9.

### Within Each User Story

- US1: T005 → T006 → T007.
- US2: T008 → T009.
- US3: T010 first (declares dependencies), then T011–T013 in parallel, then T014 → T015, then T016 → T017 and T018 in parallel with each other, then T019.
- US4: T020 first (shared util), then T021–T026 in parallel, then T027.
- US6: T028 and T029 in parallel, then T030.
- US5: T031 → T032 → T033.
- US7: T034 → T035 → T036.
- US8: T037 → T038.
- US9: T039 → T040 → T041.

### Parallel Opportunities

- T001/T002 (Setup), T003 (Foundational) can run together.
- T011, T012, T013 (US3 config files) — three different files, no interdependency.
- T021–T026 (US4, all six templates) — the largest parallel batch, same shape as Week 1's six identity files.
- T028/T029 (US6, TypeScript + Python clients) — different languages, different files.
- No cross-story parallelism beyond what's noted above: US5 through US9 each gate the next.

---

## Parallel Example: User Story 4

```bash
# After T020 (the shared aspect util) exists, write all six templates together:
Task: "Create hero.tsx per contracts/template-props.md's HeroProps"
Task: "Create price-card.tsx per PriceCardProps"
Task: "Create set-breakdown.tsx per SetBreakdownProps"
Task: "Create quote.tsx per QuoteProps"
Task: "Create before-after.tsx per BeforeAfterProps"
Task: "Create carousel-slide.tsx per CarouselSlideProps"
# Then run T027 (verify all six, brand-only, at all three aspects).
```

## Parallel Example: User Story 6

```bash
# Independent languages, independent files:
Task: "Create apps/dashboard/lib/r2.ts (uploadBuffer, getPublicUrl)"
Task: "Create apps/worker/storage/r2.py (upload_buffer, get_public_url)"
# Then T030 (verify both, live or wiring-only depending on credentials).
```

---

## Implementation Strategy

### Safest pause point (MVP-equivalent for this feature)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational) + Phase 3 (US1).
2. **STOP and VALIDATE**: the schema is drafted, reviewed, and (if reachable)
   applied — the foundation every other story needs. Nothing else has started,
   so this is a safe place to pause.

### Full sequential delivery

Setup → Foundational → US1 → US2 → US3 → US4 → US6 → US5 → US7 → US8 → US9 →
Polish, in that order — note the US6-before-US5 swap versus spec.md's raw
priority numbers, required by the real dependency Story 5 itself names. Nothing
is committed until Phase 11 (US9)'s checkpoint passes (or its sandbox-limited
gaps are explicitly accepted).

### What this sandbox can and can't finish

Be upfront in the final report about which checkpoint items were fully verified
here (schema structure, Python models, dashboard build, template rendering,
storage client wiring) versus which are written-correctly-but-unverified because
this environment lacks Docker, a live Postgres connection, live R2 credentials,
and a local Chromium binary (Docker build/run, live schema apply, live R2
upload, full render round-trip). Don't claim a checkmark this environment cannot
actually earn.

---

## Notes

- `[P]` tasks = different files, no dependencies on incomplete tasks within the same story.
- `[Story]` label maps each task to its spec.md user story; Setup/Foundational/Polish tasks have none.
- No test tasks — verification is direct command/output checking per Story 9's checkpoint, same approach as Week 1.
- This sandbox lacks `docker`, `psql`, and a local Chromium binary — several tasks above are written to degrade gracefully (verify what can be verified, clearly flag what can't) rather than assume a fully-provisioned environment.
- Avoid: applying `schema.sql` to a database before the operator has explicitly approved it (T005 before T006); building the render route (T032) before its dependencies (T031, T028) exist.
