// Video brand tokens (see /BRAND.md). Import these in every composition
// so all videos stay consistent; change a value here and every shot updates.
//
// Yousuf Living — Karachi furniture brand. Palette source: BRAND.md §4.
// `/brand-setup` wrote this file, fonts.ts, and BRAND.md together — keep all three
// in sync if you edit by hand.
import { Easing } from 'remotion';

// Channel identity. Any shot that puts the brand name on screen reads it from here,
// so one edit re-brands every video.
export const BRAND = {
  // The wordmark, split in three so the MIDDLE part renders in the accent color.
  // ['Yousuf', 'Living', ''] — two-part mark, 'Living' in gold.
  // NOTE: BRAND.md's logo-usage rule (gold dot over the "i" in "Living") is a
  // typographic detail this simple three-slot wordmark can't express on its own —
  // treating "accent-colored middle word" as the closest supported approximation.
  wordmark: ['Yousuf', 'Living', ''] as readonly string[],
  signoff: 'Workshop Price. Showroom Quality.',
  // Corner logo + social handle mark, shown via <BrandBadge> (lib/kit.tsx) on
  // every composition. logoUrl empty = no logo image; socialHandle empty = no
  // handle text; showMark = false hides the badge entirely regardless of the
  // other two. Static like the rest of this file (this pipeline renders on
  // GitHub Actions, not per-request) — see apps/worker/config.py's BRAND_*
  // vars for the dashboard-side (still image) equivalent.
  logoUrl: '',
  socialHandle: '',
  showMark: true,
} as const;

export const COLORS = {
  // roles
  accent: '#C9A227', // warm gold — CTAs, price reveals, highlight BOXES behind dark
  // text (never small foreground text on paper — see BRAND.md §4 type rules)
  accent2: '#1B4332', // forest green — headers, CTA blocks, structural backgrounds
  signal: '#285e48', // deep warm green — success / positive (no cool teal per brand rule)
  signalAlt: '#4c826a', // lighter warm-green companion
  warn: '#C9762F', // burnt amber — attention pops, distinct from the gold CTA color
  danger: '#8B3A3A', // deep brick red — drawn from the brand's approved bridal "red silk" accent
  ink: '#1A1A1A', // deep charcoal — primary text on light
  muted: '#6b6b6b', // darkened from BRAND.md's #9E9E9E — the literal hex reads at
  // 2.36:1 on paper (fails the 4.5:1 caption-legibility gate); this clears 4.70:1
  paper: '#F5F0E8', // cream — primary light surface / bg
  cream: '#ede8e0', // alt light band (slightly deeper cream, card surfaces)
  line: '#e0dcd4', // 1px borders on light
  // dark scale — warm charcoal ramp (NOT the house default's cool GitHub-ink; this
  // brand explicitly forbids cool blue/grey). Currently unused (no terminal/code
  // mockups planned for this brand) but themed correctly in case a future dark
  // surface is needed.
  d900: '#0e0e0e',
  d800: '#1a1a1a',
  d600: '#383838',
  d400: '#828282',
  d300: '#ebe6de',
} as const;

// signature gradient: forest green -> gold (the brand's two hero colors)
export const GRADIENT = `linear-gradient(120deg, ${COLORS.accent2}, ${COLORS.accent})`;

export const RADIUS = { card: 16, panel: 14, window: 10, pill: 999 } as const;

export const SHADOW = {
  soft: '0 8px 32px rgba(26,26,26,0.12)',
  card: '0 10px 40px rgba(26,26,26,0.10)',
} as const;

// Warm, confident, premium-not-luxury motion (BRAND.md §5 voice -> §6 motion).
// Same calm fade-and-rise shape as the house default, never bouncy/cartoonish.
export const EASINGS = {
  easeOut: Easing.bezier(0.33, 1, 0.68, 1),
  easeIn: Easing.bezier(0.32, 0, 0.67, 0),
  easeInOut: Easing.bezier(0.37, 0, 0.63, 1),
  overshoot: Easing.bezier(0.34, 1.4, 0.64, 1), // gentle, no cartoon bounce
} as const;
