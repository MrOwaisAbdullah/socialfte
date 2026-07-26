# Retention Rules

Sourced from 2026 short-form platform research (Instagram Reels algorithm behavior, OpusClip's
50M-ad hook analysis, cross-platform safe-zone guides). Treat every number here as a hard
constraint to check a storyboard against, not a suggestion.

## Timing

| Checkpoint | Frame @ 30fps | Why |
|---|---|---|
| Pattern-interrupt text on screen | ≤15 (0.5s) | ~60% of viewers watch muted; if there's no bold text by half a second, they've already decided to scroll |
| Hook fully landed | ≤30 (1s) | The scroll-decision window. Miss this and the algorithm's small-audience test scores the post as a skip |
| Payoff / promise clear | ≤90 (3s) | Instagram tests new Reels on ~200 viewers and gates wider distribution almost entirely on 3-second retention. This is the single highest-leverage number in this file |
| Total runtime | 450-900 frames (15-30s) | Sweet spot for a single-idea hook reel is 15-20s (450-600 frames). Longer only if the payoff genuinely needs it — never pad |

## Hook text requirements

- 5-8 words max, on screen, no sound required to understand it
- High contrast against the background (use the `Caption` component's scrim gradient, don't rely on video contrast alone)
- Positioned in the **top third** of the frame for the hook line specifically (not the bottom-third caption position used for narration text later in the reel)

## Safe zones (1080×1920 canvas)

Universal safe zone across TikTok, Reels, and Shorts: **900×1400px centered** in the 1080×1920
frame. Keep every essential element — hook text, product UI, CTA — inside this box.

| Zone | Pixels | Reason |
|---|---|---|
| Top dead zone | 0-100px | Camera/status bar UI overlays on most apps |
| Bottom dead zone | 1670-1920px (bottom 250px) | Captions, audio-attribution bar, interaction buttons — present on all three platforms |
| TikTok right dead zone | Right 120-150px | TikTok's action bar (like/comment/share/playlist icons) |
| Content-safe column | Centered 900px width | Never place text or CTA outside this horizontally |

The project's `Caption` component already defaults to these numbers when `height > width`
(vertical detection) — see `references/technical-rig.md`. Don't override `bottom`/`sideMargin`
below the safe values unless you've re-checked the platform guide.

## Hook archetype performance (OpusClip, 50M ads analyzed)

Pick ONE per reel. Ranked by retention:

| Archetype | Retention | Use for |
|---|---|---|
| Specific Outcome | ~45% | "Built a client-ready AI agent in 58 seconds" — concrete number, concrete result |
| POV / Realism | ~42% | "Your client, 9pm, asking for the numbers again" — put the viewer inside a scene they recognize |
| Unpopular Opinion / Contrarian | ~38% | "Every AI agent tool gives you a 14-day trial. We didn't." — state the norm, then break it |
| Question | ~28% | "Why does your client still have to text you for updates?" |
| Curiosity Gap | varies, strong if specific | "The feature that stopped 40+ status-update calls a month" |
| Generic product reveal | ~12% (worst) | Never lead with "Introducing Octively" or "Here's our product" — this is the failure mode to avoid |

Pattern interrupts (what makes a hook work): unexpected visuals, a contrarian statement, or a
curiosity gap — anything that breaks the scrolling autopilot state. A hook that sounds like
marketing copy has already lost.
