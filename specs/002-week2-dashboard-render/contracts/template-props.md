# Template Component Contract (Story 4)

Every template is a pure function of `props` + `brand` + `aspect`. **No component
imports a color or font constant directly** — everything visual comes from
`brand` (FR-010).

## Shared `BrandTokens` shape

Read from `BRAND.md` (Week 1) — do not hardcode these values inside a component;
pass them down from wherever the render is triggered.

```ts
type BrandTokens = {
  colors: {
    primary: string;   // #1B4332 forest green
    accent: string;    // #C9A227 warm gold
    light: string;     // #F5F0E8 cream
    dark: string;      // #1A1A1A deep charcoal
    muted: string;     // secondary/caption text — see BRAND.md's contrast note (darkened from #9E9E9E)
  };
  fonts: {
    heading: string;   // Instrument Serif
    body: string;      // Archivo
  };
  wordmark: string;    // "Yousuf Living"
};
```

## Shared `aspect` sizing

| `aspect` | Pixels | Ratio |
|---|---|---|
| `square` (default) | 1080×1080 | 1:1 |
| `feed` | 1080×1350 | 4:5 |
| `reel` | 1080×1920 | 9:16 |

Every template must keep its content fully visible and legible at all three —
this generally means the layout scales/reflows around a safe central content
area rather than assuming a fixed aspect.

## Per-template `props`

### `hero.tsx`

```ts
type HeroProps = {
  imageUrl: string;         // full-bleed background (room render or real photo)
  headline: string;         // Instrument Serif
  highlightWord?: string;   // the word inside headline to wrap in the accent highlight box
  price?: string;           // e.g. "From Rs 190,000"
  ctaLabel?: string;        // e.g. "WhatsApp for details"
};
```
Reference design (per spec.md Story 4, Acceptance Scenario 3): full-bleed
background image; gradient scrim from bottom-left toward transparent; Instrument
Serif headline with a colored highlight box behind `highlightWord`; Archivo body;
a WhatsApp CTA rendered in `brand.colors.primary` with `brand.colors.accent` text.

### `price-card.tsx`

```ts
type PriceCardProps = {
  productName: string;
  tierLabel: string;    // e.g. "Tier 2"
  price: string;        // e.g. "Rs 250,000"
  ctaLabel?: string;
};
```

### `set-breakdown.tsx`

```ts
type SetBreakdownProps = {
  setName: string;
  pieces: { name: string; price: string }[];  // e.g. 5 entries: bed, 2x side table, dressing, wardrobe
  bundlePrice: string;
  savings?: string;      // e.g. "Saves Rs 23,500"
};
```

### `quote.tsx`

```ts
type QuoteProps = {
  quote: string;
  thumbnailUrl: string;  // small product image
};
```
Brand mark (wordmark) rendered per `BRAND.md`'s logo-usage rule.

### `before-after.tsx`

```ts
type BeforeAfterProps = {
  beforeImageUrl: string;
  afterImageUrl: string;
  label?: string;        // e.g. "Workshop -> Showroom"
};
```
Two-panel still layout (side-by-side or split), per spec.md Story 4.

### `carousel-slide.tsx`

```ts
type CarouselSlideProps = {
  imageUrl: string;
  headline: string;
  bodyCopy?: string;
  slideIndex?: number;   // for an optional "2/5" indicator
  slideCount?: number;
};
```

## Contract enforcement

The render route (`render-api.md`) validates `props` against the named
template's required fields (`imageUrl`/`headline` for `hero`, etc.) before
rendering — an unknown/missing required field is a `400`, not a broken render.
