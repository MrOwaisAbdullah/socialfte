# Feature Specification: Week 2 Schema, Dashboard & Render Pipeline

**Feature Branch**: `002-week2-dashboard-render`
**Created**: 2026-07-26
**Status**: Draft
**Input**: User description: "We are in Week 2 of the SocialFTE build. Read docs/socialfte-spec-v2.md §3 (data model) and §4 (dashboard spec) before starting. Build, in order: (1) the Neon Postgres schema — six tables (assets, templates, posts, metrics, audit_log, credentials) with a pgvector caption embedding column sized from EMBED_DIMENSIONS and four named indexes — shown for approval before it's applied; (2) matching Python/SQLAlchemy models where the SQL is the source of truth; (3) a hand-written (no create-next-app) Next.js 15 + TypeScript + Tailwind + App Router dashboard shell with a single-user session-cookie login (no auth library) and a layout matching BRAND.md; (4) six post-template components (hero, price-card, set-breakdown, quote, before-after, carousel-slide), each driven only by a `props` object and a `brand` object, each rendering at 1:1 by default with a 4:5/9:16 aspect switch, with the hero template matching a previously-discussed reference design; (5) an internal Puppeteer render route plus a headless render-preview page that turns a template+props into a screenshot; (6) an R2 storage client in both the dashboard (TypeScript) and the worker (Python) with matching upload/get-URL functions; (7) a Chromium-enabled multi-stage Dockerfile for the dashboard, installing Chromium via apt rather than bundling Puppeteer's own download; (8) a Dokploy docker-compose service definition plus the complete list of environment variables it needs, shown for the operator to fill in; gated by a checkpoint (build succeeds, a real render round-trips to a PNG URL, the Docker image builds) before a single commit."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Review, then apply, the Neon schema (Priority: P1)

The operator wants the six-table Postgres schema — the foundation every later story
in this feature and every future week's worker/dashboard code depends on — created
exactly as specified, with the pgvector extension and caption-embedding column, and
wants to see the full SQL before it touches a real Neon database.

**Why this priority**: Nothing else in this feature can be built correctly without
this schema existing first: the Python models (Story 2) mirror it, the dashboard
(Story 3) connects to it, and the render pipeline (Story 5) will eventually write
rows into it. It is also the one step here explicitly requested for review before
being run against a real (if free-tier) database — schema mistakes are expensive to
walk back once rows exist.

**Independent Test**: Can be fully tested by reading `schema.sql` end to end and
confirming it defines exactly six tables, the `vector` extension, a `caption_vec`
column sized from a documented dimension (not a bare hardcoded number), and the four
named indexes — all without needing any other story built.

**Acceptance Scenarios**:

1. **Given** no schema yet exists, **When** `apps/worker/db/schema.sql` is written,
   **Then** it defines exactly six tables — `assets`, `templates`, `posts`,
   `metrics`, `audit_log`, `credentials` — and begins with
   `CREATE EXTENSION IF NOT EXISTS vector;`.
2. **Given** the schema file, **When** the operator inspects the `posts` table,
   **Then** it includes indexes on `(state, scheduled_at)` and `(platform, state)`,
   the `assets` table includes an index on `times_used`, and `audit_log` includes an
   index on `created_at`.
3. **Given** the schema file, **When** the operator inspects the caption embedding
   column, **Then** its dimension is documented as coming from the `EMBED_DIMENSIONS`
   environment variable rather than a silently-chosen literal.
4. **Given** the completed schema file, **When** it is shown to the operator,
   **Then** it is not applied to any database until the operator explicitly
   confirms.

---

### User Story 2 - Python models mirror the schema exactly (Priority: P2)

The operator wants the worker's Python data-access layer to match the SQL schema
precisely, so the SQL file — not the ORM — remains the single source of truth and
the two can never silently drift.

**Why this priority**: Every future week's worker code (credential refresh, publish
jobs, the caption agent, metrics collection) reads and writes through these models.
Getting them right now, directly against the approved schema, is cheaper than
discovering a mismatch after job logic is built on top of them.

**Independent Test**: Can be fully tested by comparing `models.py`'s columns,
types, and nullability against `schema.sql` table by table, with no other story's
code required to perform the comparison.

**Acceptance Scenarios**:

1. **Given** the approved `schema.sql`, **When** `apps/worker/db/models.py` is
   written, **Then** it defines one model per table with the same columns, types,
   and constraints as the SQL — no column present in one and not the other.
2. **Given** the models file, **When** the operator inspects the `posts` model's
   caption-embedding field, **Then** it uses pgvector's vector type at the same
   dimension as the SQL column, not a generic array or JSON field.
3. **Given** the models file, **When** the operator looks for ORM-specific
   behavior (auto-generated defaults, computed columns, cascade rules) not present
   in the SQL, **Then** none exists — the SQL fully determines behavior.

---

### User Story 3 - A brand-matched dashboard shell exists and builds (Priority: P3)

The operator wants a Next.js dashboard application that exists as a real,
buildable project — hand-configured rather than scaffolded by a generator, so every
dependency is deliberate — with a visual foundation that already looks like Yousuf
Living rather than a generic starter, and simple single-user access control.

**Why this priority**: The template components (Story 4) and render route (Story
5) both need a real Next.js project to live inside; this story is the empty-but-
correct shell they get built into.

**Independent Test**: Can be fully tested by running the dashboard's build command
and confirming it succeeds, and by loading the app shell and confirming its layout
reads as Yousuf Living (forest green / gold / Instrument Serif) rather than a
default framework starter — independent of any template or render-route work.

**Acceptance Scenarios**:

1. **Given** no dashboard app yet exists, **When** it is scaffolded, **Then**
   `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, and
   `app/layout.tsx` are hand-written (not generated by a scaffolding CLI), and the
   project builds successfully.
2. **Given** the scaffolded app, **When** the operator inspects its dependency
   list, **Then** it includes TypeScript, Tailwind CSS, and a TypeScript ORM
   connected to the same database URL the schema (Story 1) was applied to — and no
   third-party authentication library.
3. **Given** the running app, **When** an unauthenticated visitor loads it,
   **Then** access is gated by a single shared session-cookie secret rather than
   individual user accounts.
4. **Given** the app shell, **When** its layout is viewed, **Then** its colors and
   headline typography visibly match `BRAND.md` (forest green primary, gold
   accent, Instrument Serif headings, Archivo body) rather than a default look.

---

### User Story 4 - Six post templates render correctly, brand-only (Priority: P4)

The operator wants the six post layouts this brand actually posts with —
identified by name in `BRAND.md`'s content-format rotation — built as reusable
components that take their content as props and their look entirely from a brand
object, at the three aspect ratios every platform this brand posts to actually
needs.

**Why this priority**: These components are the actual visual product Week 2
exists to produce; the render pipeline (Story 5) has nothing to render without
them, and they can be verified in isolation (fixed dummy props) before that
pipeline exists.

**Independent Test**: Can be fully tested by rendering each of the six components
with representative dummy props at all three aspect ratios and confirming each
looks correct and that swapping the `brand` object's values changes every visible
color/font with no leftover hardcoded brand value — independent of the render
route or storage.

**Acceptance Scenarios**:

1. **Given** the six named layouts (hero, price-card, set-breakdown, quote,
   before-after, carousel-slide), **When** each is implemented, **Then** each
   exists as its own component under `apps/dashboard/components/templates/` and
   accepts only a content `props` object and a `brand` object — no imported color
   or font constant.
2. **Given** any one template, **When** it is rendered with no `aspect` prop,
   **Then** it renders at 1080×1080 (1:1); **When** `aspect="feed"` or
   `aspect="reel"` is passed, **Then** it renders at 1080×1350 (4:5) or 1080×1920
   (9:16) respectively, with content still fully visible and legible.
3. **Given** the hero template specifically, **When** it is rendered, **Then** it
   reproduces the discussed reference design's structure: a full-bleed background
   image, a gradient scrim from bottom-left toward transparent, an Instrument
   Serif headline with a colored highlight box behind a key word, Archivo body
   copy, and a WhatsApp CTA in the brand's primary color with accent-colored text.
4. **Given** two different `brand` objects (e.g., two different clients' palettes),
   **When** the same template is rendered with each, **Then** every visible color
   and font changes accordingly — proving no value is hardcoded.

---

### User Story 5 - A template renders to a stored, shareable image (Priority: P5)

The operator (and, from later weeks on, the automated worker) wants to turn a
template + props into an actual PNG that lives somewhere with a stable public URL
— the core capability every future posting workflow is built on top of.

**Why this priority**: This is where the feature's components stop being merely
"visually correct in isolation" and start being genuinely usable — the round trip
from a template request to a retrievable image is the concrete, demonstrable value
of Week 2. It depends on Stories 3 and 4 (the app and templates existing) and on
Story 6 (storage) to hold the result.

**Independent Test**: Can be fully tested by sending one internal render request
with a template id, dummy props, and an aspect, and confirming the response is a
URL that, when opened, shows a correctly rendered image at the right pixel
dimensions — independent of any other week's worker code.

**Acceptance Scenarios**:

1. **Given** a request to the internal render endpoint without the correct shared
   secret, **When** it is sent, **Then** it is rejected and nothing is rendered or
   stored.
2. **Given** a valid request naming a template id, content props, and an aspect,
   **When** it is processed, **Then** a headless browser renders exactly that
   template with exactly those props at the correct pixel dimensions for the
   requested aspect, with no surrounding navigation or chrome visible in the
   captured image.
3. **Given** a successful render, **When** it completes, **Then** the resulting
   image is stored in object storage and the endpoint returns a URL that resolves
   to that exact image when opened directly.
4. **Given** an invalid template id or malformed props, **When** the request is
   sent, **Then** the endpoint reports a clear error instead of returning a broken
   or blank image.

---

### User Story 6 - Object storage works from both runtimes (Priority: P6)

The operator wants uploading a file and getting back its public URL to work
identically whether it's called from the dashboard (TypeScript, Story 5's render
route) or the worker (Python, built in a later week) — since both will store and
serve media through the same bucket.

**Why this priority**: Story 5 needs this to actually persist a render; future
weeks' worker code (cover-frame candidates, processed video clips) needs the same
capability from Python. Building both now, against the same bucket and naming
convention, prevents the two runtimes' storage code from drifting apart later.

**Independent Test**: Can be fully tested, independently of any rendering, by
calling each language's upload function with a small in-memory file and confirming
the returned public URL serves that exact file back.

**Acceptance Scenarios**:

1. **Given** a byte buffer and a content type, **When** the TypeScript client
   uploads it, **Then** it returns a URL that serves back the identical bytes.
2. **Given** the same kind of input, **When** the Python client uploads it,
   **Then** it returns a URL following the same public-URL convention as the
   TypeScript client.
3. **Given** a stored object's key, **When** either client's "get public URL"
   function is called with just that key (no prior upload in the same call),
   **Then** it returns the correct public URL without re-uploading anything.

---

### User Story 7 - The dashboard runs in a production-shaped container (Priority: P7)

The operator wants the dashboard packaged as a Docker image that matches how it
will actually run on the VPS — with a real, apt-installed Chromium for the render
route rather than a multi-hundred-megabyte bundled browser download — before it's
ever deployed.

**Why this priority**: Confirming the container builds and runs the same render
capability Story 5 already proved locally is the last correctness gate before
deployment (Story 8); catching a container-only failure now is far cheaper than
discovering it on the VPS.

**Independent Test**: Can be fully tested by building the Docker image locally and
confirming it builds successfully and starts, without needing the VPS or Dokploy
at all.

**Acceptance Scenarios**:

1. **Given** the dashboard's source, **When** its Dockerfile is built, **Then** it
   installs Chromium via the OS package manager rather than letting Puppeteer
   download its own copy, and the final image does not carry the builder stage's
   dependencies.
2. **Given** the built image, **When** it is run, **Then** the render route
   (Story 5) still functions inside the container using the apt-installed
   Chromium at the path the app expects.

---

### User Story 8 - Deployment configuration is ready to hand off (Priority: P8)

The operator wants the Dokploy service definition and the complete list of
environment variables the dashboard needs, so they can provision the VPS service
and fill in real secrets themselves — without the agent ever seeing or generating
those secret values.

**Why this priority**: This is the final piece needed before Week 3's worker can
assume a running dashboard to call. It's placed last because it depends on the
container (Story 7) already being correct, and it is deliberately a hand-off, not
an automated deploy — secrets belong with the operator.

**Independent Test**: Can be fully tested by reading the compose service
definition and the environment variable list and confirming every variable the
running app actually reads is named there, with no placeholder secret values
filled in.

**Acceptance Scenarios**:

1. **Given** the existing VPS already runs another project, **When** the new
   service definition is written, **Then** it adds the dashboard service without
   modifying or restarting anything belonging to the existing project.
2. **Given** the service definition, **When** the operator reviews it, **Then**
   they receive the complete list of environment variables the dashboard needs,
   with no secret values pre-filled — only variable names and, where safe,
   non-secret defaults.

---

### User Story 9 - The build is gated on a passing checkpoint (Priority: P9)

The operator wants a concrete, checkable gate — the app builds, a real render
round-trips to a usable image, the Docker image builds — before any of this
week's work is committed together.

**Why this priority**: Mirrors Week 1's pattern: this is the safety net across all
prior stories, ensuring `master`/the feature branch never gains a commit claiming
"the dashboard and render pipeline work" when one of them silently doesn't.

**Independent Test**: Can be fully tested by running the checkpoint's three checks
against the current tree at any point and confirming the commit does not happen
while any of them fails.

**Acceptance Scenarios**:

1. **Given** the feature in any state, **When** the checkpoint is run, **Then**
   each of the three checks (dashboard build, render round-trip, Docker build) is
   reported pass/fail individually.
2. **Given** any checkpoint item failing, **When** the operator asks to commit,
   **Then** the commit does not happen until the failing item is fixed and
   re-checked.
3. **Given** every checkpoint item passing, **When** the commit is made, **Then**
   it is the single commit for this week's work and the working tree is clean
   immediately after.

---

### Edge Cases

- What happens if the schema is shown for review but the operator asks for a
  column/index change? The revised SQL must be re-shown for approval before being
  treated as final — approval applies to the version actually reviewed, not a
  later edit.
- What happens if a render request names a template id that doesn't exist, or
  passes props a template can't use (e.g., missing required fields)? The render
  route must fail with a clear error, not silently render a blank or partially
  broken image and report success.
- What happens if the render route is called without `RENDER_INTERNAL_SECRET`
  matching, e.g., from outside the trusted worker? The request must be rejected
  before any rendering work begins, not after.
- What happens if two aspect ratios are requested for the same template and props
  in quick succession? Each must render and store independently — one request's
  aspect must not affect the other's output.
- What happens if the Docker build environment lacks internet access to apt
  repositories for Chromium? The build must fail clearly at the Chromium install
  step, not silently produce an image missing the browser and fail later at
  render time instead.
- What happens if the operator wants to add a new template later? Nothing in this
  feature's design should require changing the render route itself — a new
  template should be addable as a new component plus a registry entry.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The schema step MUST define exactly six tables — `assets`,
  `templates`, `posts`, `metrics`, `audit_log`, `credentials` — in
  `apps/worker/db/schema.sql`, beginning with `CREATE EXTENSION IF NOT EXISTS
  vector;`.
- **FR-002**: The schema MUST include a caption-embedding vector column whose
  dimension is documented as sourced from the `EMBED_DIMENSIONS` environment
  variable, not a bare hardcoded number with no explanation.
- **FR-003**: The schema MUST include, at minimum, indexes on `posts(state,
  scheduled_at)`, `posts(platform, state)`, `assets(times_used)`, and
  `audit_log(created_at)`.
- **FR-004**: The schema MUST be presented to the operator in full and MUST NOT be
  applied to any database until the operator explicitly confirms it.
- **FR-005**: The Python data-access layer (`apps/worker/db/models.py`) MUST
  define one model per table matching the approved schema's columns, types, and
  constraints exactly, with the SQL treated as the source of truth — no
  ORM-introduced behavior (defaults, cascades, computed columns) absent from the
  SQL.
- **FR-006**: The dashboard application MUST be hand-configured — `package.json`,
  `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, and `app/layout.tsx`
  authored directly rather than produced by a scaffolding CLI — and MUST build
  successfully.
- **FR-007**: The dashboard MUST use TypeScript, Tailwind CSS, the App Router, and
  a TypeScript ORM connected to the same database the schema (FR-001) targets, and
  MUST NOT depend on a third-party authentication library.
- **FR-008**: The dashboard MUST gate access behind a single shared session-cookie
  secret rather than individual user accounts or sign-up/sign-in flows.
- **FR-009**: The dashboard's visual foundation MUST visibly reflect `BRAND.md`
  (forest green primary, gold accent, Instrument Serif headings, Archivo body)
  rather than a default framework appearance.
- **FR-010**: The system MUST provide six post-template components — hero,
  price-card, set-breakdown, quote, before-after, carousel-slide — each accepting
  only a content `props` object and a `brand` object, with no hardcoded color or
  font value.
- **FR-011**: Every template component MUST render at 1080×1080 (1:1) by default
  and MUST support an aspect switch producing 1080×1350 (4:5) and 1080×1920 (9:16)
  outputs with content remaining fully visible and legible at each size.
- **FR-012**: The hero template specifically MUST reproduce the discussed
  reference design's structure: full-bleed background image, bottom-left-to-
  transparent gradient scrim, an Instrument Serif headline with a colored
  highlight box behind a key word, Archivo body copy, and a WhatsApp CTA in the
  brand's primary color with accent-colored text.
- **FR-013**: The system MUST provide an internal render endpoint that accepts a
  template id, content props, an aspect, and a brand object; rejects requests
  whose shared-secret header doesn't match the configured value before doing any
  rendering work; and, for a valid request, returns a URL to a stored PNG matching
  the requested template, props, and pixel dimensions.
- **FR-014**: The render endpoint MUST reject an unknown template id or props a
  template cannot use with a clear error, and MUST NOT report success while
  returning a blank or broken image.
- **FR-015**: The system MUST provide a headless preview page that renders exactly
  one template and nothing else (no navigation, no application chrome) for the
  render endpoint to screenshot.
- **FR-016**: The system MUST provide matching object-storage clients in
  TypeScript (dashboard) and Python (worker), each exposing an upload-buffer
  operation and a get-public-URL operation, both following the same public-URL
  convention.
- **FR-017**: The dashboard MUST be packaged as a multi-stage Docker image that
  installs Chromium via the OS package manager (not a bundled Puppeteer
  download), with the final runtime stage excluding the builder stage's build-time
  dependencies.
- **FR-018**: The system MUST provide a deployment service definition (for the
  existing Dokploy project) that adds the dashboard without modifying or
  disrupting any other service already running on that host.
- **FR-019**: The system MUST produce the complete list of environment variables
  the dashboard reads, presented to the operator with no secret values filled in,
  so the operator — not the agent — supplies real credentials.
- **FR-020**: The feature's completion MUST be gated on a checkpoint verifying (a)
  the dashboard build succeeds, (b) a real render request round-trips to a
  retrievable image URL, and (c) the Docker image builds — and MUST NOT be
  committed as a single change until all three pass.

### Key Entities

- **Asset**: A reusable piece of visual material (an image or clip) available to
  compose into posts. Tracked for reuse cadence (how recently/often it's been used,
  supporting the anti-repeat rule already established in `AGENTS.md`) and for
  quality signal from later weeks' vision-tagging work.
- **Template**: One of the six named post layouts. Tracked for reuse cadence in
  the same way as Asset, so the anti-repeat rule can enforce "no template repeat
  within N posts."
- **Post**: A single scheduled or published piece of content — the record that
  moves through the draft → render → review → approved → publish → failed
  lifecycle already defined in `AGENTS.md`. Carries its target platform, format,
  scheduled time, rendered image URL, caption (with its embedding for
  similarity-based anti-repeat checking), and, once published, the platform's own
  identifier for that post.
- **Metric**: A performance snapshot for a published Post at a specific time
  window (e.g., 24-hour or 7-day), used by later weeks' performance reporting and
  by the caption/asset selection logic.
- **AuditLogEntry**: An immutable record of one action taken by the system or an
  operator (per `AGENTS.md`'s no-exceptions audit rule) — who/what did it, what
  the action was, what it affected, and when.
- **Credential**: A stored platform access token (and its refresh token, where
  applicable) with an expiry, used by `AGENTS.md`'s token-refresh rule
  (`credentials.expires_at < now() + 7 days`) to decide when a refresh is due.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can review the complete schema and approve or reject it
  in one sitting, with zero ambiguity about what will be created before any SQL
  runs against a real database.
- **SC-002**: 100% of columns in the Python models correspond one-to-one with the
  approved SQL schema, with zero undocumented divergence.
- **SC-003**: The dashboard build succeeds on the first attempt after Story 3 is
  complete, with zero dependencies pulled in beyond what was deliberately chosen.
- **SC-004**: All six templates render correctly at all three aspect ratios with
  zero hardcoded brand values — swapping the brand object alone is sufficient to
  re-brand every template.
- **SC-005**: A single render request reliably (100% of attempts with valid input)
  produces a retrievable image at the correct pixel dimensions for its requested
  aspect.
- **SC-006**: The same upload/get-URL behavior is observable from both the
  TypeScript and Python storage clients, with zero divergence in the resulting
  public URL shape.
- **SC-007**: The Docker image builds successfully and the render capability
  works identically inside the container as it does locally.
- **SC-008**: The operator receives a complete, secret-free environment variable
  list — no back-and-forth needed to discover a variable the app actually reads
  but that wasn't listed.
- **SC-009**: The week's work reaches exactly one commit, made only after all
  three checkpoint items pass.

## Assumptions

- `docs/socialfte-spec-v2.md` does not actually contain a "§3 data model" or "§4
  dashboard spec" section under those numbers (its real §3 is "Where the free
  tools actually fit" and §4 is "Notification channel — Discord"); no dedicated
  data-model or dashboard-UI section exists anywhere in that document. This
  specification instead derives the six tables' behavioral requirements from what
  `AGENTS.md`/`HEARTBEAT.md` already commit to (post lifecycle states, the
  token-refresh rule, the anti-repeat rules, the audit-log rule) and from the
  environment variables in that document's actual §7. The exact column-by-column
  schema is intentionally left to `/sp.plan`'s research phase rather than asserted
  here as fact.
- The request's STEP 2 is literally titled "Drizzle schema" but its content
  describes Python/SQLAlchemy models (Drizzle is TypeScript-only) — treated here
  as a labeling slip, not a request for a second, different schema. Story 3
  separately implies the dashboard needs its own TypeScript ORM (Drizzle) layer
  connected to the same database; this specification captures that need (FR-007)
  without asserting a specific file path for it, since no step names one
  explicitly.
- Template components are verified against representative dummy/placeholder
  props for this feature; sourcing real product photography or AI room renders is
  out of scope for Week 2 per the build order in `docs/socialfte-spec-v2.md` §10.
- "Single-user SESSION_SECRET cookie only" (no auth library) is accepted as
  already decided by the operator, not re-litigated here — it is a deliberate
  scope choice for a single-operator tool, not an oversight.
- This specification covers only the Week 2 scope ("render + dashboard") from
  `docs/socialfte-spec-v2.md` §10; it does not cover Week 3's worker/publisher
  build-out, even though some Week 2 deliverables (the Python storage client, the
  models) exist specifically so Week 3 can consume them.
- Unlike Week 1's spec, this feature was not given a blanket "confirm every step
  before the next" instruction — only the schema (Story 1) and the environment
  variable handoff (Story 8) were explicitly called out for operator review before
  proceeding. The other stories are still sequenced by real dependency (schema →
  models → app → templates → render → storage → container → deploy), but do not
  each require an individual approval pause.
