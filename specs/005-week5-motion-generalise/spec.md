# Feature Specification: Week 5 — Motion, Calendar, and Generalise

**Feature Branch**: `005-week5-motion-generalise`
**Created**: 2026-07-27
**Status**: Draft
**Input**: User description: "We are in Week 5 ... motion and generalise: four 9:16
Remotion compositions, GitHub Actions render dispatch with a worker callback, an
audio processing pipeline for uploaded clips, AI cover-frame selection surfaced in
the Discord approval card, a weekly Calendar screen with drag-to-reschedule, a full
pass to strip every Yousuf-Living-specific hardcode into config/BRAND.md, a
simulated second-client onboarding, a provisioning runbook, and a v0.1.0 tag."
(full instruction preserved in the PHR for this spec)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Turning a room render into a short video, automatically (Priority: P1)

As the brand owner, I want the system to turn a still product image and a bit of
text into a finished short vertical video — the same way it already turns a photo
into a static post — so I can post video content without hand-editing anything in a
video tool.

**Why this priority**: This is the entire point of "motion" in Week 5. Nothing else
this week (footage cleanup, cover-frame picking, the calendar) has anything to
operate on until finished videos exist. It's also the highest-effort gap today: the
system already automates photo posts (Week 2–4), but every video post still has to
be made by hand.

**Independent Test**: Trigger video creation for one look (e.g. "reveal a room,
then show the price") and confirm a finished, correctly-sized vertical video lands
back in the system ready for review — no manual editing step in between.

**Acceptance Scenarios**:

1. **Given** a room photo and a price, **When** a "reveal the room" video is
   requested, **Then** a finished vertical video is produced showing the room, a
   slow zoom, a headline, and the brand mark, and it appears in the review queue
   the same way an image post does.
2. **Given** a price to announce, **When** a "reveal the price" video is requested,
   **Then** the finished video builds anticipation before showing the number
   clearly, ends with the brand mark, and appears in the review queue.
3. **Given** a close-up detail shot (fabric, hardware, craftsmanship), **When** a
   "quality proof" video is requested, **Then** the finished video is a slow,
   text-annotated close-up with no price and no call-to-action — purely to build
   trust in build quality.
4. **Given** a multi-piece furniture set, **When** a "reveal the set" video is
   requested, **Then** the finished video builds up to revealing the whole set
   together with its name and bundle price.
5. **Given** video creation is requested for a look that doesn't exist, **When**
   the request is made, **Then** it fails clearly rather than silently producing a
   blank or wrong video.
6. **Given** a video creation request that never finishes (the rendering step gets
   stuck or crashes), **When** enough time has passed with no result, **Then** the
   failure is visible (logged/reported) rather than a post silently vanishing from
   the pipeline forever.

---

### User Story 2 - Clean, verified audio on every video clip (Priority: P1)

As the brand owner, I want any video clip I upload to have background noise
removed, a background music bed added, and a basic quality check run
automatically, so a clip with bad audio or a broken cut never reaches a follower.

**Why this priority**: A video with noisy or desynced audio actively damages the
brand — worse than not posting at all. This has to exist before clip-based content
(as opposed to still-image-based video, User Story 1) is safe to publish
unattended, and it's what the cover-frame flow (User Story 3) depends on for
already-processed footage.

**Independent Test**: Upload a raw video clip and confirm that, without any manual
audio editing, the result has background noise reduced, a music bed underneath the
voice, and a recorded pass/fail on whether picture and sound stayed in sync.

**Acceptance Scenarios**:

1. **Given** a newly uploaded video clip, **When** processing runs, **Then**
   background noise is reduced in the clip's audio without needing an internet
   call to a third-party voice-cleanup service.
2. **Given** a processed clip, **When** the sync check runs, **Then** the clip is
   flagged with a clear pass/fail on whether picture and sound match up, and a
   failing clip is not silently treated as good.
3. **Given** a clip that passes the sync check, **When** processing finishes,
   **Then** a background music track has been added under the voice at a level
   that doesn't compete with it, and the clip's quality is recorded for later use.
4. **Given** a clip that fails the sync check, **When** processing finishes,
   **Then** the clip is marked accordingly and does not proceed to cover-frame
   selection or get treated as ready to use.

---

### User Story 3 - Picking the best cover image without scrubbing through footage (Priority: P2)

As the brand owner, I want the system to suggest a handful of good still frames
from a processed video clip so I can just pick one as the cover image, instead of
scrubbing through footage myself to find a frame that looks good.

**Why this priority**: Valuable time-saver but not blocking — a video can be
posted with a default or manually-chosen cover without this. It depends on User
Story 2's cleanup/verification having already happened, since picking a cover from
an unverified or rejected clip isn't useful.

**Independent Test**: Feed a processed, verified video clip through cover-frame
selection and confirm a small number of candidate still images are presented for a
one-tap choice, without needing to scrub the video manually.

**Acceptance Scenarios**:

1. **Given** a verified video clip, **When** cover-frame selection runs, **Then**
   several candidate frames are pulled from across the clip and narrowed down to a
   short, ranked shortlist based on how clearly the product is shown, how in-focus
   the frame is, and how clean the composition is.
2. **Given** a shortlist of candidate frames for a post, **When** the post is sent
   for review, **Then** the reviewer can see the candidates alongside the post and
   pick one with a single action, without leaving the review flow.
3. **Given** none of the extracted frames are usable (e.g. every frame is blurry),
   **When** the shortlist would otherwise be empty, **Then** this is reported
   rather than presenting a broken or empty pick-a-cover step.

---

### User Story 4 - Seeing and adjusting the week's schedule at a glance (Priority: P2)

As the brand owner, I want to see everything scheduled to post this week, laid out
by day and platform, and be able to drag a post to a different day if I need to
reshuffle, so I don't have to check each post individually to understand what's
coming up or to move something.

**Why this priority**: A real quality-of-life and planning improvement, but the
publishing pipeline already works without it (Week 3's review queue covers
approval; this is about seeing the bigger picture). It doesn't block any other
Week 5 capability.

**Independent Test**: With several posts already scheduled across different days
and platforms, open the weekly view and confirm every post appears in the right
day/platform slot, and confirm dragging one to a different day actually changes
when it will publish.

**Acceptance Scenarios**:

1. **Given** posts scheduled across the week for different platforms, **When** the
   weekly view is opened, **Then** each post appears under its correct day and
   platform, and it's visually obvious which days are close to or over the daily
   posting cap for a platform.
2. **Given** a post shown in the weekly view, **When** it's opened for a closer
   look, **Then** its rendered preview, caption, and current status are visible
   without navigating away from the weekly view.
3. **Given** a scheduled post in the weekly view, **When** it's dragged to a
   different day, **Then** its scheduled time updates accordingly and the change
   is reflected immediately in the view.
4. **Given** a post is dragged onto a day that's already at its platform's daily
   cap, **When** the drop happens, **Then** the system makes this visible rather
   than silently allowing an over-cap schedule with no indication.

---

### User Story 5 - Nothing brand-specific left hardcoded (Priority: P3)

As whoever runs this product for more than one brand, I want every brand-specific
detail (colors, prices, the brand's name, contact numbers, account IDs) to live in
that brand's own configuration rather than baked into the code, so running the
product for a second, completely different brand doesn't require editing source
code.

**Why this priority**: This is a one-time structural cleanup that only pays off
once someone actually tries to onboard a second brand (User Story 6). Every
feature built so far already works correctly for the first brand without it —
this is about removing a hidden constraint, not adding new capability.

**Independent Test**: Search the whole product for anything specific to the first
brand (its name, its colors, its prices, its account identifiers) outside of
comments or example files, and confirm nothing turns up.

**Acceptance Scenarios**:

1. **Given** the complete codebase, **When** it's searched for the current brand's
   name, its color values, its prices, or its account/contact identifiers,
   **Then** none appear outside of comments, documentation, or clearly-marked
   example/stub content.
2. **Given** a value that used to be hardcoded (e.g. a brand color), **When** the
   brand's own configuration is changed, **Then** the product reflects the new
   value everywhere that value was used, with no leftover hardcoded copy
   overriding it anywhere.

---

### User Story 6 - Proving a second brand can be onboarded without touching the first (Priority: P3)

As whoever runs this product, I want to simulate onboarding a second, completely
different brand and confirm it doesn't read or write anything belonging to the
first brand, so I have real evidence the isolation between brands actually works
before I try it for real.

**Why this priority**: Directly validates User Story 5 — without this, "we
generalised the code" is an unverified claim. It's the last thing that needs to be
true before the product can be sold or handed to a second client.

**Independent Test**: Run the setup flow for a brand-new, second configuration
pointed at its own isolated files and confirm it completes successfully without
ever touching the first brand's identity or configuration files.

**Acceptance Scenarios**:

1. **Given** a fresh, separate configuration for a second brand, **When** the
   guided setup flow is run against it, **Then** it completes successfully using
   only that second brand's own files.
2. **Given** the second brand's setup has completed, **When** the first brand's
   identity and configuration files are inspected, **Then** none of them were
   created, modified, or read as part of the second brand's setup.

---

### User Story 7 - A written runbook for onboarding a real second client (Priority: P3)

As whoever runs this product commercially, I want a step-by-step written guide for
onboarding an entirely new client — the infrastructure, the accounts, the
one-time setup, what changes per client, and what must be kept secret and rotated
— so onboarding doesn't depend on remembering how it was done the first time.

**Why this priority**: Only useful once User Stories 5 and 6 have made a second
client onboarding technically possible and proven — the runbook documents a real,
working process, not an aspirational one.

**Independent Test**: Hand the written runbook to someone unfamiliar with the
system and confirm they can identify every step, every per-client value that must
change, and every secret that must be rotated, without needing to ask follow-up
questions about missing steps.

**Acceptance Scenarios**:

1. **Given** the runbook, **When** it's followed step by step for a new client,
   **Then** every infrastructure/account step needed (hosting, database, storage,
   the guided setup flow, handing over access) is covered in order with a time
   estimate for each.
2. **Given** the runbook, **When** it's checked against the actual product,
   **Then** every configuration value that differs per client and every secret
   that must be rotated for a new client is listed.

### Edge Cases

- What happens when a requested video look doesn't match anything the system
  knows how to produce? It fails with a clear reason rather than producing a
  blank, wrong, or silently-skipped video.
- What happens when video rendering starts but never reports back (crash, timeout,
  lost connection)? This is detected and surfaced rather than leaving a post stuck
  invisibly forever.
- What happens when an uploaded clip has no usable audio at all (e.g. silent
  footage)? Noise cleanup and the sync check complete without error on silent
  audio; music can still be added underneath.
- What happens when every extracted candidate cover frame is judged low-quality?
  The reviewer is told no good candidate was found rather than being shown a
  broken or empty picker.
- What happens when two people try to reschedule the same post via drag-and-drop
  at the same moment? The post ends up with one consistent final time; it doesn't
  end up in two places or with corrupted scheduling data.
- What happens when rescheduling a post via drag would exceed that day's platform
  cap? The system flags it visibly; it does not silently forbid the action nor
  silently allow it without any indication.
- What happens if the de-hardcoding pass (User Story 5) misses something and a
  second brand's setup (User Story 6) surfaces leftover first-brand content? The
  second-brand simulation is expected to catch this before a real second client
  onboarding ever happens — that's the entire purpose of testing it first.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST produce a finished, correctly-sized vertical video from
  a still product image, without manual video editing, for each of the four
  supported looks: a slow room reveal with headline and price, a price-reveal
  build-up, a close-up quality/detail proof with no price or call-to-action, and a
  multi-piece set reveal with bundle price.
- **FR-002**: System MUST make every finished video available in the same review
  queue that image posts already use, rather than a separate, disconnected flow.
- **FR-003**: System MUST fail clearly and visibly when a requested video look is
  invalid or unsupported, rather than producing a blank or incorrect result.
- **FR-004**: System MUST detect and surface a video-creation request that never
  completes (rendering crashes, hangs, or never reports back) rather than leaving
  it stuck with no visibility.
- **FR-005**: System MUST reduce background noise on every uploaded video clip's
  audio using only a local, offline method — no third-party cloud voice-cleanup
  service.
- **FR-006**: System MUST check every processed clip for picture/sound
  synchronization and record a clear pass/fail result; a failing clip MUST NOT
  proceed to cover-frame selection or be treated as ready to use.
- **FR-007**: System MUST add a background music track under the voice on every
  clip that passes its sync check, at a level that stays under the voice rather
  than competing with it.
- **FR-008**: System MUST extract multiple candidate still frames from a verified
  video clip and narrow them down to a short, ranked shortlist based on product
  visibility, focus, and composition quality.
- **FR-009**: System MUST present the cover-frame shortlist to the reviewer
  alongside the post it belongs to, allowing a one-action choice without leaving
  the review flow.
- **FR-010**: System MUST report clearly when no usable cover-frame candidate was
  found, rather than presenting an empty or broken picker.
- **FR-011**: System MUST provide a weekly view showing every scheduled post
  organized by day and by platform.
- **FR-012**: System MUST show, within the weekly view, how close each platform is
  to its daily posting cap on each day, in a way that's visually obvious without
  opening each post.
- **FR-013**: Users MUST be able to open a scheduled post from the weekly view and
  see its rendered preview, caption, and current status without navigating away.
- **FR-014**: Users MUST be able to reschedule a post to a different day by
  dragging it in the weekly view, with the change taking effect immediately.
- **FR-015**: System MUST make it visible when a drag-reschedule would push a
  platform over its daily cap for the target day, rather than allowing it with no
  indication.
- **FR-016**: System MUST NOT contain any hardcoded reference to the current
  brand's name, colors, prices, or account/contact identifiers outside of
  comments, documentation, or clearly-marked example content — every such value
  must be sourced from that brand's own configuration.
- **FR-017**: System MUST demonstrate, via a simulated second, isolated brand
  configuration, that running setup for a new brand never reads, writes, or
  otherwise depends on the first brand's identity or configuration files.
- **FR-018**: System MUST be accompanied by a written runbook covering every step
  to onboard a new client, the time each step takes, every configuration value
  that changes per client, and every secret that must be rotated.

### Key Entities

- **Video composition**: One of the four supported "looks" (room reveal, price
  reveal, quality/detail proof, set reveal) that a still image and some text can be
  turned into — a template for motion content, the video equivalent of the six
  existing static post templates.
- **Render job**: A single request to turn a specific composition and its
  properties into a finished video file, with a lifecycle from requested through
  either finished (with a location for the resulting file) or failed/timed-out.
- **Video clip**: An uploaded piece of raw video footage distinct from a still
  photo asset, which must pass through noise cleanup and a sync check before it's
  considered usable, and carries its own quality/verification result.
- **Cover-frame candidate**: One of a short list of still images extracted from a
  verified video clip, ranked by suitability, offered to a reviewer as a pick for
  the post's cover image.
- **Weekly schedule view**: A day-by-platform layout of everything scheduled to
  post in a given week, including each platform's daily cap status per day.
- **Client/brand configuration**: The complete, isolated set of brand-specific
  values (identity, visuals, cadence, accounts) a single client's instance reads
  from — this feature's generalisation work is what makes more than one of these
  safely coexist without cross-contamination.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A finished vertical video for any of the four supported looks can be
  produced from a still image and short text with zero manual video-editing steps.
- **SC-002**: Every video clip uploaded has noise cleanup, a sync-check result, and
  (if it passes) background music applied without any manual audio-editing step.
- **SC-003**: A reviewer can choose a video's cover image from a short list of
  system-suggested candidates in a single action, without scrubbing through the
  source footage themselves.
- **SC-004**: The brand owner can see the entire week's scheduled posts across all
  platforms, and successfully reschedule one by dragging it, without leaving a
  single screen.
- **SC-005**: A search of the complete codebase for the first brand's name,
  colors, prices, or account identifiers returns zero matches outside of comments,
  documentation, or example content.
- **SC-006**: A second, fully isolated brand configuration can complete guided
  setup successfully with zero cross-contamination of the first brand's files —
  verified, not assumed.
- **SC-007**: A person unfamiliar with the system can follow the written runbook
  and identify every step, every per-client configuration change, and every
  secret rotation needed to onboard a new client, without needing to ask a
  clarifying question about a missing step.

## Assumptions

- "Video clip" is a new kind of upload distinct from the still-photo assets
  already supported (Week 2) — the system needs to be able to tell the two apart
  and track a clip's own processing/verification state, which is new data this
  feature introduces the need for (exact storage shape is an implementation
  decision for planning, not this spec).
- The four video "looks" in User Story 1 are a fixed starting set for this
  feature, the video equivalent of the six existing static templates — adding
  more looks later is expected but out of scope here.
- "Fails clearly" for an invalid video request or a stuck render means the
  failure is logged and visible to whoever's monitoring the system (matching this
  project's existing audit-log-everything convention), not necessarily an
  end-user-facing error message, since these are automated/background operations.
- The daily-cap visualization in the weekly view (FR-012) reuses the same
  per-platform daily caps already enforced elsewhere in the system (Week 3) — this
  feature surfaces that existing limit visually, it doesn't introduce a new or
  different cap concept.
- "Simulated" second-client onboarding (User Story 6) means a real, isolated
  configuration and a real run of the setup flow against it, on the same
  infrastructure — not an actual separate deployment, second hosting environment,
  or real paying client. That is deliberately out of scope for this feature.
- The runbook (User Story 7) is a documentation deliverable; it describes
  infrastructure and account-provisioning steps (hosting, database, storage) that
  are performed manually by whoever onboards a client — this feature does not
  require automating those steps themselves.
