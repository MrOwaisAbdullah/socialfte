// Shared aspect -> pixel dimensions (Week 2, Story 4). See
// specs/002-week2-dashboard-render/contracts/template-props.md.
export type Aspect = 'square' | 'feed' | 'reel';

export const ASPECT_SIZES: Record<Aspect, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  feed: { width: 1080, height: 1350 },
  reel: { width: 1080, height: 1920 },
};

export function resolveAspect(aspect: Aspect = 'square') {
  return ASPECT_SIZES[aspect];
}

// Shared brand token shape every template consumes — see template-props.md.
// No component may import a color/font constant directly; everything visual
// comes from this object (FR-010).
export type BrandTokens = {
  colors: {
    primary: string;
    accent: string;
    light: string;
    dark: string;
    muted: string;
    // secondary: a second accent hue (e.g. crimson) for occasional
    // highlight-box treatments (Sample-posts/post-popup.png's "dulhan"
    // box) — distinct from `accent`, which is the everyday gold pop color.
    // ink: a true near-black background for templates that want a
    // black+bone+white+secondary variant instead of the brand's usual
    // deep-green `dark` — gives real visual variety across a batch rather
    // than every dark-background template looking identical.
    secondary: string;
    ink: string;
  };
  fonts: {
    heading: string;
    body: string;
  };
  wordmark: string;
  // Optional — a render can omit these and get no badge at all (see
  // brand-badge.tsx). showBrandMark defaults to true when undefined so
  // existing callers that don't pass it keep their current behavior.
  logoUrl?: string;
  socialHandle?: string;
  showBrandMark?: boolean;
  // Real contact facts (brand_config.phone/.website via compose_batch.py's
  // _build_brand_tokens() — same no-fabrication source as the caption CTA).
  // Undefined/empty means BrandBadge omits that line rather than a
  // placeholder ever reaching a rendered image.
  phone?: string;
  website?: string;
};

// Splits a short (2-5 word) generated headline into two roughly-even word
// groups, for templates that render it as two differently-colored stacked
// lines (bold-headline, sweet-dreams) rather than hero.tsx's inline
// highlightWord — an AI-generated headline has no natural "highlight word"
// boundary the way a hand-written one does, but splitting by word count
// reliably gives a clean two-tone break regardless of headline length.
export function splitHeadlineWords(headline: string): [string, string] {
  const words = headline.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [headline, ''];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
}
