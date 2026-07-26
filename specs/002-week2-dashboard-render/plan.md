# Implementation Plan: Week 2 Schema, Dashboard & Render Pipeline

**Branch**: `002-week2-dashboard-render` | **Date**: 2026-07-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-week2-dashboard-render/spec.md`

**Note**: This template is filled in by the `/sp.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Stand up the SocialFTE data layer and the first working slice of the dashboard: a
six-table Postgres/pgvector schema (reviewed before it's applied) with matching
SQLAlchemy models on the Python side, a hand-configured Next.js 15 dashboard shell
in Yousuf Living's brand, six reusable post-template components driven purely by
props + a brand object, an internal Puppeteer render endpoint that turns a
template into a stored PNG, matching R2 storage clients in TypeScript and Python,
a Chromium-enabled container image, and the Dokploy service definition + env var
list for the operator to deploy with. Phase 0 research resolves the exact schema
columns (the spec's referenced "§3 data model" doesn't exist in the source docs —
see `research.md`) and verifies Next.js 15's async `searchParams`/route-handler
conventions against current docs rather than assumption.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js 15, Node.js 20) for `apps/dashboard/`; Python 3.12 for `apps/worker/db/` and `apps/worker/storage/` (matches Week 1's installed interpreter)
**Primary Dependencies**: Next.js 15, React 18/19, Tailwind CSS, Drizzle ORM + `pg`, `@aws-sdk/client-s3`, Puppeteer — SQLAlchemy 2.x, `pgvector` (Python), `boto3` (already in requirements.txt from Week 1)
**Storage**: Neon Postgres (serverless, pgvector extension) + Cloudflare R2 (S3-compatible object storage) for rendered PNGs
**Testing**: No test framework mandated by the spec; verification is direct (build succeeds, a real render round-trips, `docker build` succeeds) per Story 9's checkpoint
**Target Platform**: Docker container on the existing Dokploy-managed VPS (Linux), alongside the already-running Octively project
**Project Type**: Web application — Next.js frontend/API (`apps/dashboard/`) + Python backend data layer (`apps/worker/db/`, `apps/worker/storage/`)
**Performance Goals**: Not specified beyond "a render round-trips to a usable image" (SC-005) — no throughput/latency target given for Week 2
**Constraints**: No third-party auth library (single shared session-cookie secret); Chromium installed via apt, not Puppeteer's bundled download; final Docker image excludes builder-stage dependencies; existing Octively service on the same VPS must be undisturbed
**Scale/Scope**: Single client (Yousuf Living), single operator, six template components, six database tables — no multi-tenancy in this feature

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Same as Week 1: `.specify/memory/constitution.md` is still the unfilled template —
no principles have been ratified for this project, so this gate is **not
applicable**. Falling back to the same default engineering discipline (smallest
viable diff, no unrelated refactors, don't invent APIs/contracts, cite existing
code precisely).

**Post-Phase-1 re-check**: Still not applicable — no new governance-relevant
surface was introduced (the render endpoint's shared-secret check is a stated
requirement, not a new auth architecture decision). One finding from Phase 0
research (see `research.md` Decision 6) is flagged for the operator's attention
regardless — it affects how *this project's own tooling* is governed going
forward, separate from anything this Constitution Check gate covers.

## Project Structure

### Documentation (this feature)

```text
specs/002-week2-dashboard-render/
├── plan.md              # This file (/sp.plan command output)
├── research.md          # Phase 0 output — schema derivation, Next.js 15 API verification, CLAUDE.md/AGENTS.md finding
├── data-model.md         # Phase 1 output — Asset, Template, Post, Metric, AuditLogEntry, Credential
├── quickstart.md         # Phase 1 output — manual validation walkthrough per user story
├── contracts/             # Phase 1 output
│   ├── schema.sql               # the actual reviewed DDL (Story 1's FR-004 review artifact)
│   ├── render-api.md            # POST /api/internal/render request/response contract
│   ├── template-props.md        # the six templates' shared props/brand contract
│   ├── r2-client.md             # upload/getPublicUrl signatures, both languages
│   └── env-vars.md              # the complete .env list for Story 8's handoff
└── tasks.md              # Phase 2 output (/sp.tasks command - NOT created by /sp.plan)
```

### Source Code (repository root)

```text
# Option 2: Web application (Next.js frontend/API + Python backend data layer)
apps/
├── dashboard/                          # NEW — Next.js 15, hand-configured (Story 3)
│   ├── package.json                    # hand-written, no create-next-app
│   ├── tsconfig.json
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── app/
│   │   ├── layout.tsx                  # brand-matched shell (Story 3)
│   │   ├── render-preview/
│   │   │   └── page.tsx                # headless, no chrome (Story 5)
│   │   └── api/
│   │       └── internal/
│   │           └── render/
│   │               └── route.ts        # POST, nodejs runtime (Story 5)
│   ├── components/
│   │   └── templates/                  # the six templates (Story 4)
│   │       ├── hero.tsx
│   │       ├── price-card.tsx
│   │       ├── set-breakdown.tsx
│   │       ├── quote.tsx
│   │       ├── before-after.tsx
│   │       └── carousel-slide.tsx
│   ├── lib/
│   │   ├── db/                         # Drizzle schema + client (Story 3, research.md Decision 2)
│   │   └── r2.ts                       # TS storage client (Story 6)
│   └── Dockerfile -> ../../infra/Dockerfile.dashboard   # built from repo root (Story 7)
│
└── worker/
    ├── db/
    │   ├── schema.sql                  # NEW — source of truth (Story 1)
    │   └── models.py                   # NEW — SQLAlchemy, mirrors schema.sql (Story 2)
    ├── storage/
    │   └── r2.py                       # NEW — Python storage client (Story 6)
    └── publishers/publishers/youtube.py  # existing, from Week 1 — untouched

infra/
├── Dockerfile.dashboard                # NEW (Story 7)
└── docker-compose.yml                  # NEW — adds yl-dashboard only (Story 8)
```

**Structure Decision**: Option 2 (web application: frontend/API + backend), because
this feature genuinely introduces two independently-runnable pieces — the Next.js
dashboard (its own build, its own container) and the Python data/storage layer
consumed by the worker (built out fully starting Week 3). Both already live under
the `apps/` root established by Week 1's harvest; this feature fills in
`apps/dashboard/` (currently just a placeholder `.gitkeep`) and adds `apps/worker/db/`
and `apps/worker/storage/` alongside the existing `apps/worker/publishers/`.

## Complexity Tracking

*No entries — Constitution Check gate is not applicable (no ratified constitution),
so there is nothing to justify here.*
