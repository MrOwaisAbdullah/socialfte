import { resolveAspect, type Aspect, type BrandTokens } from './aspect';
import BrandBadge from './brand-badge';

export type HeroProps = {
  imageUrl: string;
  headline: string;
  highlightWord?: string;
  price?: string;
  ctaLabel?: string;
};

// Reference design (spec.md Story 4, Acceptance Scenario 3): full-bleed
// background image, bottom-left-to-transparent gradient scrim, Instrument
// Serif headline with a colored highlight box behind the key word, Archivo
// body, WhatsApp CTA in brand.colors.primary with brand.colors.accent text.
export default function Hero({
  imageUrl,
  headline,
  highlightWord,
  price,
  ctaLabel = 'WhatsApp for details',
  aspect = 'square',
  brand,
}: HeroProps & { aspect?: Aspect; brand: BrandTokens }) {
  const { width, height } = resolveAspect(aspect);
  const parts = highlightWord ? headline.split(highlightWord) : [headline];

  return (
    <div
      style={{
        width,
        height,
        position: 'relative',
        overflow: 'hidden',
        fontFamily: brand.fonts.body,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(115deg, ${brand.colors.dark}CC 0%, ${brand.colors.dark}66 40%, transparent 70%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          padding: Math.round(width * 0.06),
          maxWidth: '82%',
          display: 'flex',
          flexDirection: 'column',
          gap: Math.round(width * 0.02),
        }}
      >
        <h1
          style={{
            fontFamily: brand.fonts.heading,
            fontSize: Math.round(width * 0.075),
            lineHeight: 1.1,
            color: brand.colors.light,
            margin: 0,
          }}
        >
          {highlightWord ? (
            <>
              {parts[0]}
              <span
                style={{
                  background: brand.colors.accent,
                  color: brand.colors.dark,
                  padding: '0 0.2em',
                  borderRadius: 6,
                }}
              >
                {highlightWord}
              </span>
              {parts[1]}
            </>
          ) : (
            headline
          )}
        </h1>
        {price && (
          <p
            style={{
              fontFamily: brand.fonts.body,
              fontSize: Math.round(width * 0.032),
              color: brand.colors.light,
              margin: 0,
            }}
          >
            {price}
          </p>
        )}
        <span
          style={{
            marginTop: Math.round(width * 0.015),
            alignSelf: 'flex-start',
            fontFamily: brand.fonts.body,
            fontWeight: 600,
            fontSize: Math.round(width * 0.026),
            color: brand.colors.accent,
            background: brand.colors.primary,
            padding: `${Math.round(width * 0.014)}px ${Math.round(width * 0.028)}px`,
            borderRadius: 999,
          }}
        >
          {ctaLabel}
        </span>
      </div>
      <BrandBadge brand={brand} width={width} />
    </div>
  );
}
