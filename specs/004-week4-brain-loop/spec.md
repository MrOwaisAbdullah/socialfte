# Feature Specification: Week 4 — Brain, Loop, and Bootstrap

**Feature Branch**: `004-week4-brain-loop`
**Created**: 2026-07-27
**Status**: Draft
**Input**: User description: "We are in Week 4 ... Week 4 is brain and loop — OpenRouter/LiteLLM
routing, caption agent plus humanizer plus pgvector anti-repeat, collect_metrics plus
Performance screen, weekly digest to MEMORY.md, audit log everywhere, BOOTSTRAP wizard
written last." (full instruction preserved in the PHR for this spec)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automatic caption writing (Priority: P1)

As the brand owner, I want each draft post to arrive with a ready-to-review caption
already written in my brand's voice, so I never have to sit down and write marketing
copy myself before a post can be approved.

**Why this priority**: This is the "brain" the rest of Week 4 exists to serve — without
it, every other Week 4 feature (anti-repeat, metrics, digest) has nothing new to operate
on. It's also the single highest-leverage time-saver: writing captions by hand is the
part of the daily workflow most likely to get skipped or delayed.

**Independent Test**: Trigger caption generation for a single asset+template pair and
confirm a caption is produced that (a) is in the brand's configured language, (b)
contains no banned AI-sounding phrases, and (c) requires no further hand-editing to be
postable as-is.

**Acceptance Scenarios**:

1. **Given** an asset and a template with brand context available, **When** caption
   generation runs, **Then** a caption and a set of hashtags are produced in the
   brand's configured language.
2. **Given** a generated caption that contains a banned phrase (e.g. "elevate your
   space"), **When** the humanizer check runs, **Then** the caption is rejected and
   regenerated before it ever reaches a human reviewer.
3. **Given** the caption-writing model is unavailable, **When** generation is
   attempted, **Then** the failure is logged and no post is silently left blank.

---

### User Story 2 - No repetitive posts (Priority: P1)

As the brand owner, I want the system to refuse to reuse the same template too soon,
reuse the same photo too often, or write a caption that's basically a copy of a recent
one, so the brand's feed doesn't look repetitive or automated to my followers.

**Why this priority**: This is a trust-and-quality gate on User Story 1 — a caption
generator without a repetition check can silently degrade the brand's feed quality
over weeks without anyone noticing until a follower points it out. It has to exist
before automatic composition (User Story 3) is safe to run unattended.

**Independent Test**: Force a duplicate scenario (same template used in the last 4
posts, or a near-identical caption within the last 30) and confirm the system rejects
it and produces a different result instead of publishing the duplicate.

**Acceptance Scenarios**:

1. **Given** a template was used in any of the last 4 posts, **When** a new post is
   composed, **Then** a different template is chosen instead.
2. **Given** a photo asset was used in any of the last 10 posts, **When** a new post
   is composed, **Then** a different asset is chosen instead.
3. **Given** a newly generated caption is more than 85% similar to any caption used in
   the last 30 posts, **When** the similarity check runs, **Then** the caption is
   discarded and a new one is generated in its place.
4. **Given** repeated regeneration attempts all still violate a repetition rule,
   **When** a reasonable retry limit is reached, **Then** the system stops trying,
   records why, and surfaces this to the brand owner rather than looping forever or
   publishing a violation anyway.

---

### User Story 3 - Fully automatic daily draft queue (Priority: P1)

As the brand owner, I want a fresh batch of draft posts to appear in my review queue
every day without me having to pick a photo, pick a layout, and request a caption
myself, so my only remaining job is to approve or skip what's already been prepared.

**Why this priority**: This is the payoff that makes User Stories 1 and 2 worth
building — it's the actual "no manual work" outcome the whole product promises. It
depends on both being in place first, which is why it's still P1 but sequenced last
among the three.

**Independent Test**: Let the daily composition run once and confirm new posts appear
in the review queue in draft state, each with a real (non-placeholder) rendered image
and caption, without any manual input during the run.

**Acceptance Scenarios**:

1. **Given** it is time for the daily batch, **When** composition runs, **Then** one
   or more new posts appear in the review queue, each with a rendered image and a
   caption, and none of them violate the repetition rules from User Story 2.
2. **Given** the asset library or template set is exhausted of non-repeating options,
   **When** composition runs, **Then** it produces as many valid posts as it safely
   can and reports the shortfall rather than forcing a repeat.

---

### User Story 4 - Performance visibility without checking each app (Priority: P2)

As the brand owner, I want to see how my published posts are performing (reach,
likes, saves, comments, shares) in one place, so I don't have to open Facebook,
Instagram, and YouTube separately to know what's working.

**Why this priority**: Valuable but not blocking — posts can be composed, reviewed,
and published without this. It becomes valuable once there's a real history of
published posts to look back on.

**Independent Test**: After a post has been live for a while, confirm its performance
numbers appear on the performance screen, matching what's visible on the platform
itself.

**Acceptance Scenarios**:

1. **Given** a post has been published to a platform that reports engagement data,
   **When** performance numbers are collected, **Then** they appear on the
   performance screen within one collection cycle.
2. **Given** a post was only ever prepared for manual posting (never published
   through an API), **When** performance is collected, **Then** it is correctly
   skipped rather than shown as zero or erroring the whole collection run.

---

### User Story 5 - Weekly performance summary, delivered automatically (Priority: P2)

As the brand owner, I want a short written summary of how the past week went —
what published well, what didn't, anything that kept failing — delivered to me
automatically once a week, so I don't have to go digging through logs or the
performance screen myself to know if things are on track.

**Why this priority**: Builds directly on User Story 4's data; without collected
performance numbers there's nothing meaningful to summarize.

**Independent Test**: Trigger the weekly summary and confirm a written summary is
both delivered to the notification channel and saved to a durable, human-readable
history the brand owner can look back on later.

**Acceptance Scenarios**:

1. **Given** at least one post published in the past week, **When** the weekly
   summary runs, **Then** a written summary covering that week is sent to the
   notification channel and saved to a persistent record.
2. **Given** nothing published in the past week, **When** the weekly summary runs,
   **Then** it says so plainly rather than fabricating activity.

---

### User Story 6 - Photo library quality gate (Priority: P3)

As the brand owner, I want newly uploaded photos to be automatically checked for
quality and tagged with what they show, so I don't have to manually sort and label
every photo I add to the library before the system can use it.

**Why this priority**: Nice-to-have quality-of-life improvement on the existing
(Week 2) manual asset upload flow. The library already works without it; this makes
adding to it faster and more consistent.

**Independent Test**: Upload a photo and confirm it's automatically tagged (subject,
tier, variant) and flagged if it fails a basic quality check (e.g. poor lighting),
without needing to manually fill in that metadata.

**Acceptance Scenarios**:

1. **Given** a newly uploaded photo, **When** it's processed, **Then** it is tagged
   with subject/tier/variant metadata and a quality score automatically.
2. **Given** a photo with a clear quality problem (e.g. very poor lighting), **When**
   it's processed, **Then** it is flagged with the specific reason rather than
   silently accepted into the library.

---

### User Story 7 - Guided setup for a new brand (Priority: P3)

As someone setting up this system for a brand for the first time, I want a guided,
step-by-step setup flow that asks me for my brand's details, connects my social
accounts, and confirms everything works, so I don't have to hand-edit configuration
files or guess what needs to be filled in.

**Why this priority**: Only matters once — for the very first setup, or for
onboarding a second brand later. Every other Week 4 feature must exist first, since
this wizard's "verify and finish" step exercises all of them (a real render, a real
post attempt, a real notification, a real LLM call).

**Independent Test**: Run the setup flow for a brand-new (empty) configuration and
confirm it collects everything needed and reports a clear pass/fail for each thing it
verifies at the end, without requiring any manual file editing.

**Acceptance Scenarios**:

1. **Given** a fresh installation with nothing configured, **When** the setup flow is
   run to completion, **Then** every required piece of configuration (identity,
   brand, at least one platform, a notification channel, a posting cadence) has been
   collected and saved.
2. **Given** the setup flow reaches its final verification step, **When** it runs its
   checks, **Then** it reports which checks passed and which failed, rather than
   declaring success regardless of outcome.
3. **Given** setup has completed successfully, **When** the flow finishes, **Then**
   the one-time setup instructions are no longer presented as an available step (it
   shouldn't be possible to accidentally "re-run first-time setup" from scratch and
   silently overwrite an already-configured brand).

### Edge Cases

- What happens when the caption-writing or vision model provider is unreachable
  (network failure, provider outage, key exhausted)? The affected job must fail
  loudly (logged, and for user-facing flows like composition, reported) rather than
  produce a blank or placeholder result that looks like a real success.
- What happens when every available asset/template combination has already been used
  too recently to pass the repetition check? The system produces fewer posts than
  requested rather than forcing a repeat, and says so.
- What happens when a post was published through a platform whose performance data
  isn't accessible via API (e.g. a manually-posted TikTok video)? It's excluded from
  automatic performance collection without failing the rest of the run.
- What happens when the weekly summary period had zero published posts? It reports
  the absence of activity rather than fabricating a summary.
- What happens if the guided setup flow is interrupted partway through (e.g. closed
  browser tab, killed CLI process)? Progress already saved (e.g. brand details
  already written) is not lost — the flow can resume rather than starting over.
- What happens if a photo fails the automatic quality check? It's still added to the
  library but flagged with the reason, not silently discarded — a human should be
  able to see and decide, not have photos vanish unexplained.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST generate a caption and hashtags for a given asset+template
  pairing, written in the brand's configured caption language, without manual
  authoring.
- **FR-002**: System MUST reject any generated caption containing a banned AI-sounding
  phrase (e.g. "elevate your space", forced-enthusiasm language) and regenerate it
  before it becomes visible to a reviewer.
- **FR-003**: System MUST prevent a template from being reused within the 4 most
  recent posts.
- **FR-004**: System MUST prevent a photo asset from being reused within the 10 most
  recent posts.
- **FR-005**: System MUST prevent a caption from being used if it is more than 85%
  similar to any caption used in the last 30 posts.
- **FR-006**: System MUST stop retrying and record the outcome if repeated attempts to
  satisfy the repetition rules (FR-003–FR-005) fail after a bounded number of
  attempts, rather than retrying indefinitely or giving up silently.
- **FR-007**: System MUST automatically compose a batch of new draft posts on a daily
  schedule, each including a chosen asset, a chosen template, a generated caption, and
  a rendered image, without manual intervention.
- **FR-008**: System MUST collect published-post performance data (reach, likes,
  saves, comments, shares) on a recurring schedule for platforms that expose it via
  API, covering both a short (~24 hour) and longer (~7 day) window per post.
- **FR-009**: System MUST exclude posts published outside of an API-driven flow (e.g.
  manually posted) from automatic performance collection without failing the
  collection run for other posts.
- **FR-010**: System MUST present collected performance data to the brand owner in a
  dedicated view, broken out by platform and by collection window.
- **FR-011**: System MUST generate and deliver a written weekly performance summary on
  a recurring weekly schedule, sent to the brand's configured notification channel.
- **FR-012**: System MUST persist every weekly summary to a durable, human-readable
  history that survives beyond the notification message itself.
- **FR-013**: System MUST automatically tag newly added photo assets with subject,
  tier, and variant metadata without requiring manual entry.
- **FR-014**: System MUST automatically evaluate newly added photo assets for basic
  quality issues (e.g. lighting, composition) and record a pass/fail-with-reason
  result rather than accepting all uploads unconditionally.
- **FR-015**: System MUST record an audit entry for every automated decision made by
  the caption agent, the repetition gate, the performance collector, and the weekly
  summary generator — no action in this feature is exempt from logging.
- **FR-016**: System MUST provide a guided, step-by-step setup flow (available both
  as a command-line flow and as a page in the dashboard) that collects: agent
  identity, brand details, at least one connected social platform, a notification
  channel, and a posting cadence.
- **FR-017**: System MUST verify, as the final step of the guided setup flow, that a
  real test render, a real (private/draft) test post to each connected platform, a
  real test notification, and a real test call to the language-model provider all
  succeed — and report each result individually rather than a single pass/fail.
- **FR-018**: System MUST prevent the guided setup flow from being treated as
  available "first-time setup" once it has completed successfully, so a fully
  configured brand cannot be silently reset by re-running it.
- **FR-019**: System MUST NOT hardcode any brand-specific value (name, colors, fonts,
  language, platforms, cadence) anywhere introduced by this feature — every such
  value must come from the brand's own configuration, so onboarding a second,
  different brand requires no code changes.

### Key Entities

- **Draft post**: An asset, a template, and a caption combined into a single
  reviewable unit — this feature is what fills the review queue that already exists;
  it doesn't introduce a new concept, but is the first thing to *produce* entries in
  it automatically end-to-end.
- **Performance record**: A per-post, per-window (24h / 7d) snapshot of engagement
  numbers (reach, likes, saves, comments, shares) for a single platform.
- **Weekly summary**: A dated, written recap of the past week's publishing activity
  and performance, kept as a running history.
- **Repetition history**: The recent-use record (which templates, which assets, which
  captions) that the repetition gate checks against — a rolling window, not a
  permanent ban list.
- **Brand configuration**: The complete set of brand-specific values (identity,
  visual brand, connected platforms, notification channel, cadence) that the guided
  setup flow exists to collect, and that every other part of this feature must read
  from rather than hardcode.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A full day's worth of draft posts can be produced with zero manual
  photo selection, layout selection, or caption writing.
- **SC-002**: Across 30 consecutive composed posts, no template repeats within any
  4-post window, no asset repeats within any 10-post window, and no two captions
  within any 30-post window exceed 85% similarity.
- **SC-003**: Generated captions contain zero instances of known AI-sounding stock
  phrases across a sample of at least 20 generated captions.
- **SC-004**: The brand owner can see performance numbers for a published post
  without opening that platform's own app or website.
- **SC-005**: A weekly summary is delivered without any manual step, every week that
  the schedule fires, for as long as there has been at least one published post that
  week.
- **SC-006**: A second, entirely different brand can be fully onboarded (identity
  through verified, working platform connections) using only the guided setup flow,
  with zero source-code edits.
- **SC-007**: Every automated decision this feature makes (a caption chosen, a
  repetition rejection, a performance number recorded, a summary generated) has a
  corresponding, inspectable record after the fact.

## Assumptions

- The banned-phrase list for the humanizer check starts with the phrases already
  called out in project conventions (e.g. "elevate your space", generic forced
  enthusiasm) and is expected to grow over time as new AI-sounding patterns are
  noticed — it is not expected to be exhaustive on day one.
- A bounded retry limit for the repetition gate (FR-006) is an internal implementation
  choice, not a user-facing setting, as long as it reliably avoids both infinite
  retries and silent repetition violations.
- "Platforms that expose performance data via API" currently means the platforms this
  product already publishes to through an API (not the draft-only/manual-post path) —
  if a platform is added later without an insights API, it is simply excluded from
  performance collection, not treated as an error.
- The guided setup flow's command-line and dashboard versions are expected to collect
  the same information and reach the same end state; they are two entry points to one
  flow, not two independently-specified flows.
- "Human-readable history" for weekly summaries means a persisted, readable record a
  non-technical brand owner could open and read later — not a database table only
  visible to developers.
