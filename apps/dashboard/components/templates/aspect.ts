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
  };
  fonts: {
    heading: string;
    body: string;
  };
  wordmark: string;
};
