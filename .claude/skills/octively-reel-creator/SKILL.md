---
name: octively-reel-creator
description: Load before planning or building any short vertical (9:16) promotional video for Octively — Reels, TikTok, YouTube Shorts. Covers the hook-first storyboarding method (1s hook / 3s payoff, hook-archetype selection), the platform safe-zone constraints, the Remotion vertical-video technical rig in video/octively-demo (reusable components, the playbackRate gotcha, render commands), and Octively's non-negotiable copy rules (AI agent builder not chatbot, no em dash, no rupee symbol). Trigger on "make a reel", "short video", "TikTok", "Shorts", "vertical video", "hook", "promotional video", or any request to cut new social video content from the product footage library.
---

# Octively Reel Creator

Builds short (15-30s), hook-first, vertical promotional videos for Octively — an **AI agent
builder** SaaS (never say "chatbot" in new copy). Every reel is a Remotion composition in the
isolated `video/octively-demo` project, reusing the same component rig as the 60s long-form demo.

## What This Skill Does
- Plans a reel: picks one hook archetype, writes the hook line, storyboards beats to a timestamp
- Builds the reel as a Remotion vertical composition (1080×1920 @ 30fps)
- Enforces platform safe zones, retention pacing, and Octively brand/copy rules
- Reuses the existing footage library, brand assets, and licensed music bed

## What This Skill Does NOT Do
- Write the full multi-week social posting calendar (see `social-media-posts/POSTING-ORDER.md`)
- Generate new product footage (only cuts from `video/raw/` / `video/octively-demo/public/clips/`)
- Post/upload to any platform — output is a rendered `.mp4` for the user to publish

---

## Before Implementation

| Source | Gather |
|---|---|
| **This skill's references** | `references/hooks.md` for the archetype + line library, `references/technical-rig.md` for the Remotion recipe, `references/retention-rules.md` for the hard numeric constraints |
| **Footage inventory** | `video/octively-demo/public/clips/*.mp4` — check what's already cut vs. unused (see table in `references/technical-rig.md`) |
| **Conversation** | Which value prop / pain point the user wants this reel to hit; footage-based or text-only; any specific CTA |
| **Existing reels** | `video/octively-demo/src/reels/` — check for a prior reel to match pacing/style before inventing a new pattern |

---

## Required Clarifications

Only ask if genuinely ambiguous — most reels map directly onto the hook library in `references/hooks.md`:

1. **Which hook/value prop** — pain point, speed-to-build, portal differentiator, free plan, pricing gap, or retainer-upsell math?
2. **Footage or text-only** — does it need product UI, or is it a pure typographic/brand reel?
3. **Any specific number or claim to hero** (a price, a time, a stat) — must be verified against `CLAUDE.md` pricing facts, never invented.

---

## Workflow

1. **Pick ONE hook archetype** from `references/hooks.md`. One idea per reel — do not combine two value props.
2. **Write the hook line**: 5-8 words, must be fully legible as on-screen text with sound off, must land by **frame 15** (0.5s @ 30fps) for the pattern-interrupt text, spoken/implied hook complete by **frame 30** (1s).
3. **Write the payoff beat**: the promise must be visually or textually clear by **frame 90** (3s). This is what stops the algorithm's early-audience test from killing distribution.
4. **Storyboard remaining beats** to a timestamp table (see any file in `src/reels/` for the pattern) — total runtime **15-30s**, sweet spot 15-20s for a single-idea reel.
5. **Check every beat against `references/retention-rules.md` safe zones** before writing code — text position, font size, bottom margin.
6. **Build** using the technical recipe in `references/technical-rig.md`. Reuse `Stage`, `BrowserWindow`, `ClipFrame`, `Caption` — do not fork new copies of these components for vertical; they are already aspect-ratio-aware.
7. **Verify with stills** at 3-4 key frames (hook, payoff, mid, CTA) before a full render. Retry on Chrome-connect `TimeoutError` — it's a WSL flake, not a code bug.
8. **Full render**: `npx remotion render <CompId> out/<name>.mp4 --codec=h264 --crf=16 --jpeg-quality=100`.
9. **Run every caption/VO line through the copy rules checklist below** before considering the reel done — this is the single easiest thing to slip on when writing punchy hook copy fast.

---

## Copy Rules (Non-Negotiable)

These apply to hook lines, captions, VO scripts, and any on-screen text in a reel — not just written posts.

| Rule | Do | Don't |
|---|---|---|
| Product name | "AI agent", "AI agent builder" | "chatbot", "AI chatbot" (old positioning, corrected 2026-06) |
| Em dash | Split into two sentences, or use a period/comma | Any `—` character anywhere in on-screen text or VO |
| Rupee symbol | `Rs2,500/mo`, `PKR` | `₨2,500` or `₹2,500` — the glyph itself is banned, not the currency |
| Currency by audience | PKR (`Rs`) for Pakistan-first platforms; `$`/USD for international-facing cuts | Mixing both in one reel |
| Accent color | Sky-Teal `#0EA5E9` only, via `COLORS.skyTeal` | Indigo, purple, or any other highlight color |
| Pricing claims | Verify against `CLAUDE.md` root: Free = Rs0/1 bot/200 convos/no card; Starter Rs2,500 ($15); Agency Rs20,000 ($79); competitors Stammer.ai $197, ConvoCore $220, ChatLab $360 | Inventing or rounding numbers for punch |

---

## Output Checklist

Before delivering a reel, verify:
- [ ] One hook archetype, one value prop — not a mashup
- [ ] Hook text on screen by frame 15, payoff clear by frame 90 (3s)
- [ ] All text inside the 900×1400 safe zone (see `references/retention-rules.md`)
- [ ] Runtime is 15-30s
- [ ] Every on-screen/VO line passes the Copy Rules table above
- [ ] `npx tsc --noEmit` clean before rendering
- [ ] Verified with stills at hook / payoff / CTA frames before full render
- [ ] Rendered at `--crf=16 --jpeg-quality=100` (matches the long-form demo's quality bar)

---

## Reference Files

| File | When to Read |
|---|---|
| `references/hooks.md` | Choosing a hook archetype and writing the hook/payoff line — Octively-specific line library |
| `references/retention-rules.md` | The numeric constraints (timing, safe zones, length) — check every storyboard against this |
| `references/technical-rig.md` | Building the reel — file layout, component reuse, the `playbackRate` gotcha, render commands, footage inventory |
