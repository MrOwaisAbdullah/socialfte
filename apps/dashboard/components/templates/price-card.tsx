import { resolveAspect, type Aspect, type BrandTokens } from './aspect';
import { stripEmoji } from './lib';

export type PriceCardProps = {
  productName: string;
  tierLabel: string;
  price: string;
  ctaLabel?: string;
};

// Editorial stat-card treatment (no product photo to work with, so this
// leans into type instead of trying to fake a hero image): a small solid
// eyebrow badge, an upright bold serif headline, the price set large in
// italic serif — the same two-tier contrast the rest of the templates
// build with a photo, built here with weight/style alone — and a hairline
// footer rule instead of another glass-panel CTA block.
export default function PriceCard({
  productName,
  tierLabel,
  price,
  ctaLabel = 'WhatsApp for details',
  aspect = 'square',
  brand,
}: PriceCardProps & { aspect?: Aspect; brand: BrandTokens }) {
  const { width, height } = resolveAspect(aspect);

  return (
    <div
      style={{
        width,
        height,
        position: 'relative',
        background: brand.colors.light,
        fontFamily: brand.fonts.body,
        display: 'flex',
        flexDirection: 'column',
        padding: Math.round(width * 0.08),
      }}
    >
      <span
        style={{
          alignSelf: 'flex-start',
          fontFamily: brand.fonts.body,
          fontWeight: 700,
          fontSize: Math.round(width * 0.022),
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: brand.colors.light,
          background: brand.colors.dark,
          padding: `${Math.round(width * 0.012)}px ${Math.round(width * 0.02)}px`,
          borderRadius: 4,
        }}
      >
        {stripEmoji(tierLabel)}
      </span>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <h1
          style={{
            fontFamily: brand.fonts.heading,
            fontWeight: 700,
            fontSize: Math.round(width * 0.08),
            letterSpacing: -1,
            lineHeight: 1.08,
            color: brand.colors.dark,
            margin: 0,
          }}
        >
          {stripEmoji(productName)}
        </h1>
        <p
          style={{
            fontFamily: brand.fonts.heading,
            fontStyle: 'italic',
            fontSize: Math.round(width * 0.15),
            color: brand.colors.accent,
            margin: `${Math.round(width * 0.02)}px 0 0`,
            lineHeight: 1,
          }}
        >
          {stripEmoji(price)}
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: `1px solid ${brand.colors.muted}44`,
          paddingTop: Math.round(width * 0.03),
        }}
      >
        <span
          style={{
            fontFamily: brand.fonts.body,
            fontSize: Math.round(width * 0.024),
            color: brand.colors.muted,
          }}
        >
          {brand.wordmark}
        </span>
        <span
          style={{
            fontFamily: brand.fonts.body,
            fontWeight: 700,
            fontSize: Math.round(width * 0.026),
            color: brand.colors.dark,
            background: brand.colors.accent,
            padding: `${Math.round(width * 0.014)}px ${Math.round(width * 0.03)}px`,
            borderRadius: 999,
          }}
        >
          {stripEmoji(ctaLabel)}
        </span>
      </div>
    </div>
  );
}
