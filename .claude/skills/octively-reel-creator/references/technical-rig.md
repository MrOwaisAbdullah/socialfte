# Technical Rig

All reel work happens in the isolated Remotion project `video/octively-demo` (own
`package.json`, doesn't touch the main Next.js app's dependencies). This is the same project
that produced the 60s long-form demo — reels reuse its component library.

Repo path has spaces — always `cd "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas/video/octively-demo"`
or quote the path in every command.

## Aspect-ratio-aware shared components (already built, reuse — don't fork)

| Component | Path | Vertical-aware behavior |
|---|---|---|
| `Stage` | `src/components/Stage.tsx` | Dark backdrop + radial glow + grid, `AbsoluteFill`-based — works at any size unmodified |
| `BrowserWindow` | `src/components/BrowserWindow.tsx` | Floating macOS-style chrome with fake URL bar — no size assumptions, just wraps children |
| `ClipFrame` | `src/components/ClipFrame.tsx` | Places trimmed footage in `BrowserWindow` with Ken Burns zoom + blur overlays. `frameW = width - width*0.0625*2` reads `useVideoConfig().width` — this is what makes it work at both 1920 landscape and 1080 vertical. **Do not reintroduce a hardcoded `WIDTH` import here.** |
| `Caption` | `src/components/Caption.tsx` | Word-by-word animated bottom-third caption with scrim. Auto-detects vertical via `height > width` and defaults to `fontSize: 46, bottom: 260, sideMargin: 72` (matches `retention-rules.md` safe zones) vs. landscape's `52/96/96`. Override via props only if you've re-checked the safe-zone numbers |

For a **hook line** (not a bottom-third caption), don't reuse `Caption` — hook text lives in the
top third and needs its own component per reel (see `src/scenes/Scene1Problem.tsx` for the
spring-based word-entrance pattern to copy from).

## Theme constants

`src/theme.ts` — `COLORS`, `FPS = 30`, landscape `WIDTH = 1920` / `HEIGHT = 1080`, vertical
`WIDTH_V = 1080` / `HEIGHT_V = 1920`. Import `WIDTH_V, HEIGHT_V` for reel `Composition` entries.

## File layout for reels

```
src/reels/
  <reel-name>/
    timeline.ts       # beat array (id, clip?, url?, trimBefore/After, durationSec, zoom, blur, caption)
    <ReelName>.tsx     # top-level composition component, Stage + hook text + beats
```

Register each in `src/Root.tsx`:

```tsx
<Composition
  id="ReelPain"
  component={ReelPain}
  durationInFrames={sec(18)} // pick from the storyboard's total runtime
  fps={FPS}
  width={WIDTH_V}
  height={HEIGHT_V}
/>
```

## Footage inventory (`public/clips/`, mirrored in `video/raw/`)

All 1920×1080 30fps recordings of the real product UI (dark theme, "Noor Dental" demo bot).

| Clip | Used in 60s demo? | Content |
|---|---|---|
| `admin-01-dashboard` | Yes | Bot list / dashboard overview |
| `admin-02-create-form` | Yes | Create-bot form (name, URL, currency, system prompt) |
| `admin-03-embed-copy` | Yes | Copy embed script, bot detail page |
| `admin-04-settings` | No | Bot settings tab |
| `admin-05-widget-preview` | Yes | Live widget test on white page |
| `admin-06-knowledge` | **No — unused** | Knowledge base / RAG document + URL training |
| `admin-07-unanswered` | **No — unused** | Unanswered questions / human handoff |
| `portal-01-dashboard` | Yes | Client portal stats overview |
| `portal-02-conversations` | Yes | Conversation list (static list window is 4.1-6.5s of source, collapses to blank after) |
| `portal-03-leads-table-trimmed` | Yes | Leads table, user-trimmed to remove scroll (static throughout) |
| `portal-04-export-csv` | Yes | CSV export action |

`admin-06-knowledge` and `admin-07-unanswered` are unused and are the natural footage source for
new feature-specific reels beyond the initial five.

## Brand + audio assets

- `public/brand/`: `logo-horizontal-transparent-white.png`, `logo-horizontal-transparent-teal.png`,
  `social-dp-teal-icon.png`, `landing.png` (real marketing homepage screenshot, usable in
  text-only reels for a "proof" visual)
- `public/audio/bg-music-Blueprint_for_Noon.mp3` — 175s licensed track, safe to trim for reels
- `public/audio/01-*.mp3` through `17-*.mp3` — short per-beat VO lines from the long-form demo
  (see `VO-SCRIPT.md` for the pattern of writing new short single-sentence VO). Reels can reuse
  matching lines (e.g. `12-leads.mp3` for a leads-table beat) or need new short recordings —
  don't reuse a VO line whose wording doesn't exactly match the reel's beat.

## Beat pattern (timeline.ts)

Same shape as the long-form demo's `src/timeline.ts` beats:

```ts
{
  id: "hook",
  clip: "admin-02-create-form",
  url: "admin.octively.com",
  trimBefore: 29,       // seconds into the source clip
  trimAfter: 36,         // MUST equal trimBefore + durationSec — see gotcha below
  playbackRate: 1,
  durationSec: 7,
  zoom: { from: 1.04, to: 1.1, originY: 0.4 },
  blur: [{ x: 0.16, y: 0.5, w: 0.7, h: 0.06 }], // viewport fractions, hides sensitive data
  caption: [{ text: "Name it." }, { text: "Point it at a site.", highlight: true }],
}
```

## Critical gotcha: `playbackRate` does not stretch/compress footage

`@remotion/media`'s `<Video>` component accepts a `playbackRate` prop, but in the installed
version it does **not** actually speed up or slow down the decoded frames during render. Setting
`playbackRate: 0.5` and expecting a clip to visually slow down to fill a longer beat will silently
fail — the clip plays at 1.0x regardless, and the beat runs past the trimmed window into whatever
comes next in the source (often a blank/transition frame).

**Rule: `trimAfter - trimBefore` must always equal `durationSec` exactly.** If you need a beat
longer or shorter than the footage's natural pace, change `durationSec` and the trim window
together — never rely on `playbackRate` to do the stretching. (Verified by direct inspection of
`node_modules/@remotion/media/dist/video/video.d.ts` — the prop type exists but the internal
frame extraction doesn't honor it for render-time compression/stretching.)

## Commands

```bash
# Typecheck after every edit, before rendering
npx tsc --noEmit

# Verification stills at key frames (hook, payoff, CTA) — cheaper than a full render
npx remotion still <CompId> preview/check.png --frame=<N> --scale=0.5
# Flakes with "TimeoutError: ... trying to connect to the browser" on WSL sometimes —
# this is a transient Chrome-launch issue, just retry the same command.

# Final render — matches the long-form demo's quality bar
npx remotion render <CompId> out/<name>.mp4 --codec=h264 --crf=16 --jpeg-quality=100
```

## Delivering the file to the user (WSL environment)

The user works in Windows via WSL2. To hand off a rendered file:

```bash
# Copy to Windows Downloads (find the real user profile, not Default/Public)
ls -d /mnt/c/Users/*/Downloads | grep -viE "Default|Public"
cp out/<name>.mp4 "/mnt/c/Users/<realuser>/Downloads/<name>.mp4"

# Open in the default Windows player
cd out && cmd.exe /c start "" "<name>.mp4"
```
