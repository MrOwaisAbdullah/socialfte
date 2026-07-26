# Phase 0 Research: Week 2 Schema, Dashboard & Render Pipeline

## Decision 1 — Deriving the six tables' exact columns

- **Decision**: Since `docs/socialfte-spec-v2.md` has no actual "§3 data model"
  section (see `spec.md`'s Assumptions), the exact column list per table is
  derived from three sources instead: (a) this feature's own STEP 1 text (naming
  `caption_vec`, the four required indexes, and `EMBED_DIMENSIONS`), (b) the
  behavioral rules Week 1 already committed to in `AGENTS.md`/`HEARTBEAT.md`
  (post lifecycle states, the token-refresh rule, the anti-repeat rules, the
  audit-log rule), and (c) the function signatures and job logic already spelled
  out in `docs/socialfte-prompts.md`'s PROMPT 3 (credential management,
  publish_due) and PROMPT 4 (vision tagging, caption composition, compose_batch,
  collect_metrics, audit logging) — full column lists are in `data-model.md`.
- **Rationale**: These sources are internally consistent with each other (e.g.
  PROMPT 4's `log(actor, action, subject_id, payload)` matches `AGENTS.md`'s own
  audit-log rule verbatim) and were written by the same operator as part of the
  same overall plan, so treating them as the de facto data model is far more
  reliable than guessing from generic SaaS schema conventions.
- **Alternatives considered**: Asking the operator to write the missing §3/§4
  sections before proceeding — rejected as disproportionate; enough consistent
  detail already exists across three documents to derive a correct schema without
  adding a research-blocking round trip.

## Decision 2 — Primary keys: UUID, not serial

- **Decision**: Every table uses a UUID primary key (`gen_random_uuid()`), and the
  schema adds `CREATE EXTENSION IF NOT EXISTS pgcrypto;` alongside the required
  `vector` extension to provide it.
- **Rationale**: STEP 5's render route already generates a UUID for each stored
  PNG (`renders/{uuid}.png`); using UUIDs for table primary keys too keeps ID
  generation consistent across the whole system and avoids leaking sequential
  row counts (post volume, asset count) through predictable integer IDs — a minor
  but free hardening given this dashboard has no other access control feature.
- **Alternatives considered**: `bigserial` (auto-increment) — simpler, but
  inconsistent with the render pipeline's own UUID convention and reveals row
  counts; rejected.

## Decision 3 — "Drizzle schema" (STEP 2) is a labeling slip, not a second schema

- **Decision**: Treat STEP 2's heading ("Drizzle schema") as a naming mistake —
  its actual content ("SQLAlchemy models... Import pgvector's Vector type") is
  unambiguously Python, and Drizzle is TypeScript-only. `apps/worker/db/models.py`
  is SQLAlchemy, full stop. The dashboard's *separate*, real need for a Drizzle
  (TypeScript) layer — stated only once, in STEP 3 ("Drizzle ORM (connected to
  the same Neon DATABASE_URL)") — gets its own schema file at
  `apps/dashboard/lib/db/schema.ts`, generated from the same `schema.sql` source
  of truth.
- **Rationale**: Building the requirement as literally stated (a second,
  differently-shaped Python thing called "Drizzle schema") would produce
  something that doesn't exist as a concept. Splitting it this way — one
  SQLAlchemy file for the worker, one Drizzle file for the dashboard, both
  generated from the same canonical `schema.sql` — satisfies both STEP 2's actual
  content and STEP 3's actual (if under-specified) requirement.
- **Alternatives considered**: Skipping the dashboard's Drizzle layer entirely
  since no step gives it a dedicated file/step — rejected; STEP 3 explicitly lists
  Drizzle ORM as one of the app's required dependencies, so omitting it would
  under-deliver Story 3.

## Decision 4 — Next.js 15 API specifics, verified via Context7

- **Decision**: `apps/dashboard/app/render-preview/page.tsx` must be an `async`
  Server Component that `await`s its `searchParams` prop (typed as
  `Promise<{ [key: string]: string | string[] | undefined }>`), not a synchronous
  component reading `searchParams` directly as an object. `apps/dashboard/app/api/internal/render/route.ts`
  must declare `export const runtime = 'nodejs'` (Puppeteer cannot run on the Edge
  runtime), and reads its body via `await request.json()` and its shared-secret
  header via `request.headers.get(...)`. `next.config.ts` (TypeScript, not
  `next.config.js`) is natively supported in Next.js 15.
- **Rationale**: Verified directly against the official Next.js v15.1.8
  documentation via Context7 rather than assumed from general familiarity —
  `searchParams` becoming a Promise was one of Next.js 15's headline breaking
  changes from 14, and getting the render-preview route wrong here would silently
  break the entire render pipeline (Story 5) in a way that's easy to miss in a
  quick local test (the promise would just be `undefined`-like until awaited
  properly, depending on how it's misused) and only surfaces under real render
  load.
- **Alternatives considered**: None — this is a factual API question with one
  correct answer, not a design trade-off.

## Decision 5 — Puppeteer configuration matches the Dockerfile's Chromium install

- **Decision**: The render route calls `puppeteer.launch()` without specifying
  `executablePath` — Puppeteer resolves it automatically from its bundled browser
  cache locally, or from `PUPPETEER_EXECUTABLE_PATH` in `process.env` when that
  env var is set at container runtime in Docker. `PUPPETEER_EXECUTABLE_PATH` is
  **not** set in `.env.local` (see Decision 11 for why) — it is injected only by
  the deployment platform (Dokploy) when the container starts. The Dockerfile sets
  `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1` at build time so `npm install` never
  downloads Puppeteer's own ~170MB Chromium — the same binary the Dockerfile
  installs via `apt-get install chromium`.
- **Rationale**: Initially the route passed `executablePath: process.env.PUPPETEER_EXECUTABLE_PATH` directly, but this broke on Windows because Puppeteer reads the env var at module import time and caches it — `launch({ executablePath })` cannot override it (Decision 11). The fix: remove the env var from `.env.local` entirely and let Puppeteer's own resolution handle both cases (bundled locally, env-var-injected in Docker).
- **Alternatives considered**: `puppeteer-core` (no bundled Chromium download by
  design, no env var needed) — a cleaner dependency choice, but the request
  explicitly names the `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` env var pattern, which
  only makes sense for the full `puppeteer` package; kept as literally requested.

## Decision 6 — CLAUDE.md is no longer this project's own operating instructions (flag for the operator)

- **Decision**: Not a design decision for this feature — a finding to surface,
  not silently work around. Week 1's Story 5 converted `CLAUDE.md` into a symlink
  to `AGENTS.md` per the operator's own `docs/repo-harvest.md`/
  `docs/socialfte-prompts.md` instructions. `AGENTS.md` is the **SocialFTE bot's**
  runtime operating constitution (draft→review→publish rules, anti-repeat rules,
  audit-log rule) — a completely different document from what `CLAUDE.md`
  originally held, which was **Claude Code's own** project instructions for this
  repository (the PHR-creation mandate, the ADR-suggestion rule, the
  Spec-Driven-Development `/sp.*` workflow this very plan is being produced
  under). Those two "AGENTS.md"/"CLAUDE.md" naming conventions collided:
  `docs/repo-harvest.md` §3a's "CLAUDE.md → symlink to AGENTS.md" instruction
  assumed CLAUDE.md's *only* audience was future coding-agent sessions reading
  about the SocialFTE bot, not that Claude Code itself loads that exact file as
  its own harness-level instructions every session.
  **Net effect**: any brand-new Claude Code session opened on this repo from
  now on no longer receives the SDD/PHR/ADR instructions this project has been
  built under for both Week 1 and Week 2 — it receives the SocialFTE bot's
  posting rules instead, which say nothing about specs, plans, tasks, or PHRs.
  This session still has the original instructions cached from before the
  symlink was created, which is why the SDD workflow (including this very
  research.md) kept working — but that won't be true for a fresh session.
- **Rationale for flagging rather than fixing unilaterally**: This is a real,
  load-bearing regression in the project's own tooling, but reverting it (or
  restructuring where each set of instructions lives) is an operator decision
  with tradeoffs the operator should choose, not one this plan should make
  silently — see the recommendation in this feature's final report to the
  operator.
- **Alternatives considered** (for the operator to pick from, not decided here):
  (a) keep `CLAUDE.md` as a symlink to `AGENTS.md` but move the SDD instructions
  into `.specify/memory/constitution.md` (which is currently an empty template
  anyway) or a dedicated `.claude/` config Claude Code reads regardless of
  `CLAUDE.md`'s content; (b) make `CLAUDE.md` a real file again that contains
  both the SDD instructions and a pointer/read-this-too note about `AGENTS.md`,
  giving up the "CLAUDE.md is a pure pointer" cleanliness Week 1 aimed for;
  (c) accept the regression if the operator doesn't intend to keep using
  `/sp.*` commands in future sessions on this repo (seems unlikely given two
  weeks of continuous SDD usage so far).
- **Concrete incident confirming this is live, not theoretical**: while writing
  this plan, this session ran the standard `/sp.plan` Phase 1 step
  `update-agent-context.sh claude`, which is supposed to append an "Active
  Technologies" note to whatever Claude Code's project-instructions file is. It
  targeted `CLAUDE.md` — followed the symlink to read `AGENTS.md`'s content, but
  then wrote its result back with `mv temp_file CLAUDE.md`, which does not write
  *through* a symlink the way a normal file write does — `mv` replaces whatever
  is at that path. This **silently converted `CLAUDE.md` from a symlink into a
  stale, diverging real-file copy** of `AGENTS.md` (with tech-stack notes
  appended that belong in neither file). `AGENTS.md` itself was untouched
  (confirmed via `git diff`/`git status` — zero changes), so no damage reached
  the file the SocialFTE bot actually reads, but the symlink itself had to be
  manually restored (`rm CLAUDE.md && ln -s AGENTS.md CLAUDE.md`) immediately
  after being discovered. **This will happen again on every future `/sp.plan`
  run** until the operator picks one of the alternatives above — standard
  spec-kit tooling and the "CLAUDE.md is a pure symlink" design are fundamentally
  incompatible as currently set up.

## Decision 7 — Mid-implementation pivot: Next.js 15 → 16

- **Decision**: During `/sp.implement`, the operator asked to target Next.js 16
  instead of the originally-specified Next.js 15, after noticing `middleware.ts`
  was written using the Next 15 convention. Confirmed via Context7 against
  `/vercel/next.js`'s canary and v16.2.9 docs: the `middleware.ts` file and its
  `middleware` export are renamed to `proxy.ts`/`proxy` starting exactly at
  **v16.0.0** (the `edge` runtime is dropped from `proxy` — not a concern here,
  since this gate is a plain cookie/HMAC check with no edge-only API usage).
  `package.json`'s `next` pin moved to `^16.2.9`; `middleware.ts` was deleted and
  recreated as `proxy.ts` with the function renamed accordingly. React stays
  `^19.0.0` — confirmed via Context7 that Next.js 16's peer dependency range
  (`^18.2.0 || ^19.0.0`) already covers it, no bump needed. The already-written
  async-`searchParams` pattern (Decision 4) is unchanged — that requirement
  carried over from 15 into 16 unmodified.
- **Rationale**: Written up explicitly, not just silently patched, because every
  other planning artifact (`spec.md`, `plan.md`'s Technical Context, `tasks.md`)
  still says "Next.js 15" — this decision is the record of why the actually-built
  code diverges from those documents' literal text on this one point.
- **Alternatives considered**: Staying on Next.js 15 as originally specified —
  offered to the operator directly as the safer/more-stable-for-production
  option; the operator chose 16 explicitly.

## Decision 8 — `npm audit fix --force` outcome: keep the Drizzle bump, ignore the Next-downgrade suggestion

- **Decision**: The operator ran `npm install` then `npm audit fix --force` directly.
  This bumped `drizzle-orm` to `0.45.2` and `drizzle-kit` to `0.31.10` (both
  semver-major) — verified `npx tsc --noEmit` still passes clean against the
  bumped versions, so `lib/db/schema.ts` needed no changes. The remaining audit
  report flags `postcss`/`sharp` (bundled transitively by Next.js itself) and
  suggests `next@9.3.3` as the "fix" — **not applied**. Downgrading from Next 16
  to a 6-major-version-old pre-App-Router release to silence an audit warning
  would be a far worse outcome than the warning itself; this is npm audit's
  advisory-range matching being overly broad against a brand-new Next major
  version, not a real, exploitable issue for an internal single-operator tool.
  Separately bumped `puppeteer` from `^23.11.1` to `^24.15.0` — `23.x` is
  flagged deprecated ("no longer supported") independent of the audit-fix run;
  the launch/setViewport/goto/screenshot API used in the render route (verified
  via Context7 against `/puppeteer/puppeteer`'s current docs) is unchanged
  across this bump.
- **Rationale**: Distinguish a real fix (Drizzle bump — clean, verified,
  low-risk) from a false-positive chase (Next downgrade — high-risk, wrong
  direction) rather than reflexively running every suggested `npm audit fix`.
- **Alternatives considered**: Running the second `npm audit fix --force` to
  clear the remaining report — rejected; it would have installed `next@9.3.3`,
  undoing Decision 7 entirely.

## Decision 9 — Adapted render-robustness techniques from `carousel-routine` (operator's own reference project)

- **Decision**: `carousel-routine/` (repo root) is the operator's prior
  Octively LinkedIn-carousel renderer — different brand, hardcoded personal
  Windows/macOS paths, not directly reusable. Its actual *content* (HTML
  templates, copy, branding) was not ported. Its Puppeteer *technique*,
  repeated consistently across `render.js`, `screenshot_all.js`,
  `render_past_overlays.js`, `whatsapp_ads/render_ads.js`, was adapted into
  `apps/dashboard/app/api/internal/render/route.ts`:
  - Launch args `--no-sandbox`, `--disable-setuid-sandbox` — every one of the
    reference scripts passes these; without them Chromium frequently refuses
    to launch at all when run as root in a container with no extra seccomp
    capabilities (exactly Story 7's Docker deployment shape).
  - `--disable-web-security` — the reference scripts either embed images as
    base64 or serve via `file://`/a local HTTP server specifically to dodge
    CORS; our render-preview page instead loads `imageUrl` props from
    arbitrary (eventually R2/external) URLs, so the same CORS failure mode
    applies and the same flag addresses it.
  - `--font-render-hinting=none` — for consistent glyph rendering of
    Instrument Serif/Archivo across host and container.
  - `await page.evaluate(() => document.fonts.ready)` before screenshotting —
    every reference script either does this explicitly or works around its
    absence with a blind `setTimeout` (500–1500ms) "wait for fonts" hack. Using
    the real `fonts.ready` promise instead of a guessed delay is strictly
    better and was missing from the first draft of the render route.
  - Explicit `clip: {x:0, y:0, width, height}` on `page.screenshot()` — every
    reference script does this rather than relying on the viewport size alone
    to imply the capture bounds.
  - `page.setDefaultNavigationTimeout(60_000)` — defensive against a slow
    external image load blocking the render indefinitely.
  - **Not adapted**: `render-pdf.js`'s PNG→PDF compilation (ImageMagick, with
    a Puppeteer `page.pdf()` fallback) — no Week 2 story needs a PDF output;
    noted here as a reference for whenever a future week assembles a real
    multi-slide Instagram carousel post and needs a reviewable combined
    artifact. The local-HTTP-server-per-render pattern several scripts use to
    dodge `file://` restrictions is superseded by `render-preview` already
    being a real HTTP route.
- **Rationale**: These are exactly the class of bug ("works on my machine,
  breaks in the container" / "screenshot occasionally has the wrong font")
  that's expensive to discover only after Story 7's Docker build, and the
  operator's own prior project had already hit and fixed every one of them.
- **Alternatives considered**: Porting the reference scripts' actual HTML/CSS
  templates — rejected; they're Octively-branded, and `BRAND.md` /
  `contracts/template-props.md` already fully specify Yousuf Living's own
  templates.

## Decision 10 — Windows/WSL split: who runs `npm` commands

- **Decision**: The operator's `npm install` runs from a native Windows
  PowerShell terminal against `apps/dashboard/` (a `/mnt/d/...` path shared
  between Windows and this WSL session). That installs **Windows** native
  binaries for any platform-specific package (`esbuild` resolved
  `@esbuild/win32-x64`). This agent's shell is WSL/Linux, which needs
  `@esbuild/linux-x64` instead — confirmed by `npx tsx` failing outright with
  esbuild's own platform-mismatch error, even though plain `npx tsc --noEmit`
  (pure JS, no native addon) succeeded fine from WSL. `next build`/`next dev`
  ship their own platform-specific `@next/swc-*` binary and would hit the same
  class of mismatch if run from WSL against Windows-installed `node_modules`.
  Observed directly: the operator already has `next dev` running from their
  own (Windows) terminal — my own `npm run build` attempt from WSL collided
  with it ("Another next build process is already running"), and also would
  have needed its own Linux-native reinstall to succeed cleanly.
  **Going forward**: file authoring (writing/editing `.ts`/`.tsx`/config files)
  happens from either side — it's plain text, no binary concern. Anything that
  *executes* `node_modules`' native binaries (`npm run dev`/`build`,
  `npx tsx`, `puppeteer`'s own Chromium download) is more reliable run by the
  operator from their own Windows terminal where the installed binaries
  actually match, or would need its own from-WSL `npm install` first if run
  from here. Python-side verification is unaffected — the `venv/` created
  directly from this WSL session has correctly matching Linux binaries for
  everything in `requirements.txt`.
- **Rationale**: Written up rather than silently retried, because it explains
  why some verification steps in this feature are done from WSL directly
  (Python, `tsc`) while others (a live `next dev` check, an actual Puppeteer
  render) are better confirmed by the operator on their own machine.
- **Alternatives considered**: Running `npm install` again from WSL to get
  Linux-native binaries here too — reasonable, but not done unilaterally since
  the operator already has a working `next dev` session going on their side;
  duplicating a second `node_modules` install for the same directory from a
  different OS environment risks its own confusion (two different lockfile
  resolutions for the same `package.json`) without being asked for.

## Decision 11 — `PUPPETEER_EXECUTABLE_PATH` env var overrides `launch({ executablePath })` — must be removed from `.env.local`

- **Decision**: Remove `PUPPETEER_EXECUTABLE_PATH` and `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD`
  from `apps/dashboard/.env.local` entirely. Locally, Puppeteer uses its own bundled
  Chromium (already cached at `~/.cache/puppeteer/chrome/`). In Docker, the env var
  is set at container runtime via docker-compose / deployment config, not baked into
  `.env.local`. The render route's `launch()` call no longer references the env var
  at all.
- **Rationale**: Puppeteer's own docs (verified via Context7 against
  `/puppeteer/puppeteer` source) confirm that `PUPPETEER_EXECUTABLE_PATH` in
  `process.env` **overrides** the `launch({ executablePath })` option — it is read
  once at module import time and cached in Puppeteer's internal configuration
  object. Setting `executablePath: undefined` in launch options does not suppress
  it. Even `delete process.env.PUPPETEER_EXECUTABLE_PATH` at request time runs
  too late because the module is already loaded and cached by Turbopack. The only
  reliable fix is to not have the env var present at all during local development.
  Confirmed via direct testing: `node -e "delete process.env.PUPPETEER_EXECUTABLE_PATH; require('puppeteer').executablePath()"` still returns the env-var path — Puppeteer
  reads it at import time, not at call time.
- **What broke**: Every attempt to render via `POST /api/internal/render` failed with
  `Browser was not found at the configured path (/usr/bin/chromium)` on Windows.
  The env var `/usr/bin/chromium` is a Linux Docker path that does not exist on
  Windows. Fixing the `launch()` call alone (platform detection, `existsSync`,
  `statSync`, `undefined` override, `delete process.env`) could not resolve it
  because Puppeteer's module-level configuration was already set before any request-
  time code ran.
- **Alternatives considered**: (a) Setting `executablePath: puppeteer.executablePath()`
  explicitly — rejected because `puppeteer.executablePath()` itself reads from the
  cached configuration, which already has the env-var path baked in. (b) Dynamic
  `import()` of Puppeteer after deleting the env var — rejected as unnecessarily
  complex; removing the env var from `.env.local` is simpler and matches the
  intended design (env var is a Docker/container concern, not a local dev concern).
- **Impact on Dockerfile**: None — the Dockerfile and docker-compose already expect
  `PUPPETEER_EXECUTABLE_PATH` to be set at container runtime via the deployment
  platform's env var injection (Dokploy), not from `.env.local`. The
  `contracts/env-vars.md` handoff document still lists it for the operator to
  configure on Dokploy.

## Decision 12 — Next.js dev indicator pollutes Puppeteer screenshots

- **Decision**: Set `devIndicators: false` in `next.config.ts` to suppress the
  static "N" icon (dev mode indicator) that Next.js renders in the bottom-left
  corner of every page in development mode. The icon is injected outside the
  React component tree (as a static overlay element), so route group restructuring
  (Decision 13) cannot remove it.
- **Rationale**: The render pipeline's `POST /api/internal/render` endpoint
  screenshots `GET /render-preview` via Puppeteer. Even with a bare layout that
  has no `<header>` or navigation, the dev indicator icon was visible in the
  captured PNG — violating FR-015 ("no navigation or application chrome visible
  in the captured image"). The dev indicator is a development-only feature and
  will not appear in production builds (`next build`), but the render pipeline
  is tested locally in dev mode where the icon is present.
- **Alternatives considered**: Setting `NEXT_PUBLIC_DEV_INDICATOR=false` in
  `.env.local` — rejected because the env var is not the stable API for this
  feature; the `next.config.ts` `devIndicators` option is the documented path.
  Verified the config property name via TypeScript's own error feedback
  (`'devIndicator' → 'devIndicators'`). The option accepts `false` to fully
  disable or an object `{ position: 'bottom-left' }` to configure.
- **Impact on production**: None — the dev indicator is omitted from production
  builds automatically.

## Decision 14 — `drizzle-kit push` requires pgvector extension enabled first

- **Decision**: Before running `drizzle-kit push` to apply the Drizzle schema
  (`lib/db/schema.ts`) to Neon, the `vector` and `pgcrypto` extensions must be
  created first via raw SQL (`CREATE EXTENSION IF NOT EXISTS vector;` / `pgcrypto`).
  `drizzle-kit push` cannot enable extensions itself — it fails with
  `type "vector" does not exist` if they are missing. The `drizzle.config.ts`
  reads `DATABASE_URL` from `process.env` at runtime; it must be set when
  invoking `drizzle-kit` (e.g. `$env:DATABASE_URL = "..." ; npx drizzle-kit push`
  in PowerShell).
- **Rationale**: Neon Postgres databases do not ship with pgvector pre-installed.
  The extension must be explicitly created by a superuser before any table or
  column referencing the `vector` type is created. `drizzle-kit push` attempts to
  introspect the existing schema and create missing objects, but cannot handle
  extensions — it's a DDL diffing tool, not a migration runner. The extensions
  must be applied via raw SQL first (using `pg` client or `psql`), after which
  `drizzle-kit push` can successfully diff and apply the remaining table/index
  definitions.
- **What broke**: First `drizzle-kit push` attempt failed with `type "vector" does
  not exist`. After enabling the extensions via a separate `pg` client call, the
  same `drizzle-kit push` succeeded with `[✓] Changes applied`.
- **Alternatives considered**: (a) Apply `schema.sql` directly via `psql` — rejected
  because `psql` is not available in this sandbox environment. (b) Use Drizzle
  migrations (`drizzle-kit generate` + `drizzle-kit migrate`) instead of
  `drizzle-kit push` — `push` is sufficient for a single-developer tool with
  no multi-environment migration workflow; migrations add ceremony without
  benefit at this stage.
- **Impact**: The extension-enabling step is a one-time prerequisite for each
  new Neon database. After the first `push`, subsequent schema changes can use
  `drizzle-kit push` directly without re-enabling extensions.

## Decision 13 — Route groups for chrome-free render preview

- **Decision**: Restructure the dashboard's `app/` directory into route groups:
  the root `layout.tsx` is bare (fonts + globals only, no `<header>` or
  `<main>` wrapper), and a `(dashboard)` route group holds the login page and
  the main page with a nested layout that includes the header/skip-link/
  content-area wrapper. The `/render-preview` route lives outside the
  `(dashboard)` group and inherits only the bare root layout — so Puppeteer
  screenshots contain just the template component with no app chrome (FR-015).
- **Rationale**: Previously the root layout unconditionally rendered a `<header>`
  with "YousufLiving" branding and a "SocialFTE dashboard" subtitle on every
  page, including `/render-preview`. The carousel-routine reference scripts
  bypass this problem entirely by serving standalone HTML files via a local HTTP
  server or `file://` URLs — but that pattern (spinning up an ad-hoc HTTP server
  per render) was superseded by the `/render-preview` route being a real Next.js
  HTTP endpoint. Route groups achieve the same "no chrome" result without
  leaving the Next.js routing model.
- **Alternatives considered**: (a) Conditional header rendering via
  `headers()`/`pathname()` — fragile, couples layout to routing logic.
  (b) Serving rendered HTML strings directly without the layout — Puppeteer
  navigates to a URL, not an HTML string, so this doesn't fit the architecture.
  (c) Dynamic `import()` of Puppeteer after Next.js has served the preview page
  — unnecessary complexity.
- **Impact**: `app/layout.tsx` simplified; `app/(dashboard)/layout.tsx` created;
  `app/page.tsx` moved to `app/(dashboard)/page.tsx`; `app/login/` moved to
  `app/(dashboard)/login/`. URL paths unchanged. Proxy matcher already excluded
  `/render-preview`, no change needed.

## Summary of resolved unknowns

| # | Topic | Resolution |
|---|---|---|
| 1 | Missing §3/§4 schema source | Derived from AGENTS.md/HEARTBEAT.md + docs/socialfte-prompts.md PROMPT 3/4 |
| 2 | Primary key strategy | UUID (`gen_random_uuid()`, `pgcrypto`), matching the render route's own UUID convention |
| 3 | "Drizzle schema" labeling | STEP 2 = SQLAlchemy (Python, worker); dashboard's real Drizzle need = separate `apps/dashboard/lib/db/schema.ts` |
| 4 | Next.js 15 API specifics | `searchParams` is a Promise; render route needs `runtime = 'nodejs'`; `next.config.ts` is supported — verified via Context7 |
| 5 | Puppeteer/Docker env var alignment | Route calls `launch()` without `executablePath` — locally uses bundled Chromium; Docker sets `PUPPETEER_EXECUTABLE_PATH` at container runtime via deployment env vars (Decision 11) |
| 6 | CLAUDE.md/AGENTS.md collision | Not resolved here — flagged for the operator's decision, not silently fixed |
| 7 | Next.js 15 vs 16 | Operator chose 16 mid-implementation; `middleware.ts` → `proxy.ts` per the v16.0.0 rename, confirmed via Context7 |
| 8 | `npm audit fix --force` fallout | Kept the Drizzle major-version bump (verified clean); rejected the `next@9.3.3` downgrade suggestion; bumped `puppeteer` to `^24.15.0` separately (23.x deprecated) |
| 9 | `carousel-routine` reference techniques | Adapted launch args, font-ready wait, and explicit screenshot clip into the render route; did not port its Octively-branded HTML/content |
| 10 | Windows/WSL binary split | File authoring from either side; `npm run dev`/`build`/`npx tsx` more reliable from the operator's Windows terminal where binaries match; Python venv (built from WSL) is unaffected |
| 11 | `PUPPETEER_EXECUTABLE_PATH` overrides launch options | Env var read at Puppeteer import time, cached in module config, overrides `launch({ executablePath })` — cannot be overridden at request time. Removed from `.env.local`; set only in Docker via deployment env vars |
| 12 | Next.js dev indicator pollutes screenshots | `devIndicators: false` in `next.config.ts` — suppresses the "N" icon that renders outside the React tree in dev mode, which was visible in Puppeteer captures of `/render-preview` |
| 13 | Route groups for chrome-free render preview | Root layout bare; `(dashboard)` group has header; `/render-preview` outside it inherits no chrome — matches carousel-routine's standalone-HTML pattern within Next.js routing model |
