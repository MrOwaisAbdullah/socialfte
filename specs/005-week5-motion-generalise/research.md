# Research: Week 5 — Motion, Calendar, and Generalise

**Date**: 2026-07-27
**Scope**: Remotion 9:16 compositions, GitHub Actions render dispatch + R2 upload,
audio/cover-frame processing pipeline, calendar drag-reschedule, de-hardcoding.

Same discipline as Weeks 3–4: verify the kickoff's assumptions against current
docs before writing code. Two genuinely new integration surfaces this week
(GitHub Actions ↔ R2, Remotion's remote-image loading) hadn't been exercised
anywhere else in the project yet, unlike most of Weeks 3–4 which extended
already-proven tools.

---

## Decision 1: Composition registry — no changes needed, already points at `src/compositions/`

**Finding**: `packages/remotion/scripts/gen-registry.mjs` already scans
`src/compositions/` (its comment says `src/shots/**` but the code uses
`src/compositions`) and reads each file's exported `compositionConfig`
(`id`, `durationInSeconds`, `fps`, `width`, `height`, `transparent`). `Root.tsx`
maps every discovered entry straight into a `<Composition>` — no manual
registration step. `BrandProof.tsx` (already in `src/compositions/`, Week 1) is a
working, verified example of the exact contract to follow: default-exported
component + `compositionConfig`, reading `BRAND`/`COLORS`/`EASINGS` from
`../brand`, fonts from `../fonts`, shared primitives from `../lib/kit`.

**Choice**: The four new compositions are plain drop-in files in
`src/compositions/` following `BrandProof.tsx`'s exact shape — `compositionConfig`
sets `width: 1080, height: 1920` explicitly (the registry's default is
1920×1080, landscape, if omitted). No `Root.tsx` or registry script changes needed.

---

## Decision 2: Remote images via `<Img>` — no manual `delayRender` needed

**Choice**: Each composition receives `imageUrl` (or `detailImageUrl` for
FabricDetail) as a prop and renders it via Remotion's `<Img src={imageUrl} />`,
not a plain `<img>` tag.

**Rationale**:
- Verified via Context7 (Remotion's own docs): `<Img>` is a drop-in replacement
  for `<img>` that transparently waits for the image to finish loading before
  Remotion captures that frame — the exact "avoid flicker/blank frame" problem a
  raw `<img>` tag would hit when the source is a remote R2 URL fetched at render
  time, not a bundled local asset.
- `<Img>` accepts an absolute URL directly (no `staticFile()` wrapper needed —
  that's only for assets bundled into the Remotion project itself, not
  runtime/remote URLs).
- `<Img>` has built-in `maxRetries` (default 2, exponential backoff) and
  `onError` — worth using explicitly given the image is fetched over the network
  from R2 during a GitHub Actions render; a transient fetch failure should retry,
  not hang the render until Remotion's internal timeout.

**Alternatives considered**: Manual `delayRender()`/`continueRender()` with a
raw `<img>` and an `onLoad` handler — this is Remotion's own documented pattern
for *non-image* async data (API fetches), and `<Img>` already does this
internally for images specifically, so reimplementing it manually would be
redundant and more error-prone.

---

## Decision 3: Ken Burns zoom and text fades — `interpolate()` on `transform`/`opacity`, no new dependency

**Choice**: All motion (zoom, fade-in, wipe) uses `useCurrentFrame()` +
`interpolate()` against CSS `transform`/`opacity`, exactly as `BrandProof.tsx`
already does — no new animation library.

**Rationale**: This is already the established, working pattern in this codebase
(verified by reading `BrandProof.tsx`, not assumed) — `interpolate(frame, [in,
out], [from, to], {...CLAMP, easing: EASINGS.easeOut})` for a fade/rise, and the
same shape for a scale-based Ken Burns zoom (`interpolate(frame, [0,
durationInFrames], [0.95, 1.05])` applied to `transform: scale(...)`). No need to
introduce Remotion's `spring()` or a third-party animation library for effects
this simple; consistency with the existing utility shot matters more than a
marginally fancier easing curve.

---

## Decision 4: GitHub Actions render dispatch — props via a JSON **file**, not raw string interpolation

**Options**: (a) exactly as the kickoff describes —
`npx remotion render {composition_id} out/render.mp4 --props='{props}'` with the
`{props}` JSON string interpolated directly from a `workflow_dispatch` input into
the `run:` block; (b) write the input to a JSON file first, then pass
`--props=./input-props.json`.

**Choice**: (b) — write inputs to a file first.

**Rationale**:
- Verified via Remotion's own official "Render using GitHub Actions" doc: this
  is the pattern they document and ship, specifically
  `echo $WORKFLOW_INPUT > input-props.json` (from
  `env: WORKFLOW_INPUT: ${{ toJson(github.event.inputs) }}`) followed by
  `npx remotion render MyComp out/video.mp4 --props="./input-props.json"`.
- More importantly, this isn't just a style preference: interpolating a
  `workflow_dispatch` input's raw string value directly into a `run:` shell
  block (option a) is GitHub Actions' own documented script-injection
  anti-pattern — a value containing a shell metacharacter (quote, backtick,
  `$()`) breaks out of the intended string and executes as shell code. Routing
  the value through `env:` and then into a file via `echo "$WORKFLOW_INPUT" >
  file.json` (env-var expansion, not direct template interpolation into the
  script body) avoids this. `props` here is a JSON string coming from whoever
  can trigger the workflow — treating it as untrusted input is the correct
  default even though today that's only the SocialFTE worker/operator.
- `remotion render` accepts `--props=<path-to-json-file>` as a first-class,
  equally-supported alternative to an inline `--props='<json>'` string
  (confirmed in Remotion's "Passing props to a composition" doc) — no
  functionality is lost by writing to a file first.

**Alternatives considered**: Sanitizing/escaping the raw string before inline
interpolation — more fragile and reinvents what the file-based approach gets for
free; rejected.

---

## Decision 5: R2 upload from GitHub Actions — `aws s3 cp` with `--endpoint-url` and `region=auto`

**Choice**:
```yaml
env:
  AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
  AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
  AWS_DEFAULT_REGION: auto
run: |
  aws s3 cp out/render.mp4 "s3://${{ secrets.R2_BUCKET }}/${{ inputs.output_key }}" \
    --endpoint-url "https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com"
```

**Rationale**: Verified via Tavily against multiple current, independent sources
(a Cloudflare-focused deploy guide, an `aws-actions/configure-aws-credentials`
GitHub discussion) — R2's S3-compatible API needs exactly three things the
plain AWS CLI doesn't default to: `AWS_DEFAULT_REGION=auto` (R2 has no real AWS
regions), `--endpoint-url https://<ACCOUNT_ID>.r2.cloudflarestorage.com` on every
call, and R2-specific (not AWS IAM) access keys. `R2_ACCOUNT_ID`/`R2_BUCKET`
already exist as env vars in `apps/worker/config.py` — this workflow needs its
own copies as **repository secrets** (a GitHub Actions runner has no access to
the worker's `.env`), which is exactly what the kickoff's secrets list already
specified.

**Alternatives considered**: A dedicated third-party R2-upload GitHub Action
(`ryand56/r2-upload-action`) — functionally fine, but adds a third-party Action
dependency for something three lines of `aws s3 cp` already does with a CLI
that's preinstalled on `ubuntu-latest` runners; not worth it for a single-file
upload.

---

## Decision 6: Cover-frame scoring reuses Week 4's structured-vision-agent pattern

**Choice**: Score each of the 12 extracted candidate frames using the same
`vision_agent` shape from Week 4 (`brain/vision.py`) — a Pydantic `output_type`
(e.g. `FrameScore { score: int, reason: str }`) via the Agents SDK, one call per
frame — rather than inventing a new JSON-parsing approach for this feature.

**Rationale**: Week 4 already verified (research.md Decision from that feature)
that `output_type=SomePydanticModel` on an `Agent` gives back a typed,
already-parsed result via `result.final_output` — no manual JSON-string parsing,
no reliability gamble on the model returning clean JSON in a text response. The
kickoff's suggested prompt ("Return JSON: {score, reason}") maps directly onto a
two-field Pydantic model; there's no reason to hand-roll a different, less
reliable path for this feature specifically when a working, tested pattern
already exists one file over (`brain/vision.py`).

**Alternatives considered**: A single batched call scoring all 12 frames at
once (one prompt, one structured list output) instead of 12 separate calls —
worth considering at implementation time purely as a cost/latency optimization,
but not required for correctness; deferred to `/sp.tasks`, not a planning
blocker.

---

## Decision 7: `assets.kind` / `assets.processed` — new columns, first schema change since Week 2

**Finding**: `schema.sql`'s `assets` table (Week 2) has no way to distinguish a
still photo from an uploaded video clip, and no processing-status field. Every
week since has been additive-without-schema-changes (Week 3: none; Week 4:
none) — this is the first week that genuinely needs new columns.

**Choice**: Add `kind TEXT NOT NULL DEFAULT 'photo'` (`'photo' | 'clip'`),
`processed BOOLEAN NOT NULL DEFAULT true` (existing photo rows default to
already-processed; new clip uploads default to `false` until the audio/cover-
frame pipeline finishes), and `sync_ok BOOLEAN` (the A/V drift check result,
nullable until checked) to `assets`. Cover-frame candidates and the chosen cover
are modeled as JSONB on `posts` (`cover_frame_candidates`), following the same
"free-form JSONB for feature-specific metadata" convention already used by
`credentials.meta`, rather than a new table for what's fundamentally a short,
disposable list attached to one post.

**Rationale**: Matches this project's established minimal-schema-churn
philosophy — reuse the JSONB-metadata pattern already in production (Week 2's
`credentials.meta`) instead of introducing a new join table for a 3-item list
that only matters between "clip processed" and "reviewer picks one."

**Alternatives considered**: A separate `cover_frame_candidates` table (post_id,
url, score, rank) — more "normalized," but over-engineered for a list of at
most 3 URLs that's write-once/read-once per post and never queried
independently of its post.

---

## Open questions for `/sp.tasks` / implementation time (not blocking this plan)

- Exact current `remotion.config.ts` defaults (output codec, concurrency) —
  confirm they still make sense for 9:16 rather than assuming the Week 1
  harvest's config is untouched.
- Whether `dispatch_render.py`'s 30-second poll / 15-minute cap (per the
  kickoff) is generous enough for a real Remotion render on `ubuntu-latest` —
  no render has actually been timed yet; treat the 15-minute cap as a starting
  assumption to revisit once a real render duration is measured.
- The exact GitHub REST API endpoint/payload shape for triggering
  `workflow_dispatch` programmatically from Python (`dispatch_render.py`) and
  for polling run status — verify at implementation time rather than assumed
  here, since this plan's research budget went to the higher-risk R2/props
  questions first.
