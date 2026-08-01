import { resolveAspect, type Aspect, type BrandTokens } from './aspect';
import BrandBadge from './brand-badge';
import { stripEmoji } from './lib';

export type QuoteProps = {
  quote: string;
  thumbnailUrl: string;
};

// Editorial testimonial card. Was a flat brand.colors.light background
// with no photo at all — next to the rest of the (photo-driven) lineup it
// read as unfinished, flagged live as "looking very empty". Now uses the
// same asset photo compose_batch already passes as `thumbnailUrl` as a
// full-bleed background, darkened by a heavy gradient scrim so only its
// texture/mood comes through rather than a clear, competing product shot
// — the quote text stays the visual focus, the photo just stops the card
// from being a blank rectangle. Text flipped to light-on-dark to match.
export default function Quote({
  quote,
  thumbnailUrl,
  aspect = 'square',
  brand,
}: QuoteProps & { aspect?: Aspect; brand: BrandTokens }) {
  const { width, height } = resolveAspect(aspect);

  return (
    <div
      style={{
        width,
        height,
        position: 'relative',
        background: brand.colors.dark,
        fontFamily: brand.fonts.body,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: Math.round(width * 0.11),
        textAlign: 'center',
      }}
    >
      {thumbnailUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnailUrl}
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(180deg, ${brand.colors.dark}F0 0%, ${brand.colors.dark}D9 100%)`,
        }}
      />

      <span
        style={{
          position: 'relative',
          fontFamily: brand.fonts.heading,
          fontSize: Math.round(width * 0.16),
          lineHeight: 0.6,
          color: `${brand.colors.accent}88`,
        }}
      >
        &ldquo;
      </span>

      <p
        style={{
          position: 'relative',
          fontFamily: brand.fonts.heading,
          fontStyle: 'italic',
          fontSize: Math.round(width * 0.062),
          letterSpacing: -0.5,
          color: brand.colors.light,
          lineHeight: 1.28,
          margin: `${Math.round(width * 0.02)}px 0 ${Math.round(width * 0.05)}px`,
          maxWidth: '86%',
        }}
      >
        {stripEmoji(quote)}
      </p>

      <span
        style={{
          position: 'relative',
          fontFamily: brand.fonts.body,
          fontWeight: 700,
          fontSize: Math.round(width * 0.03),
          letterSpacing: 0.3,
          color: brand.colors.light,
        }}
      >
        {brand.wordmark}
      </span>

      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: Math.round(width * 0.07),
          transform: 'translateX(-50%)',
          width: Math.round(width * 0.1),
          height: 2,
          background: brand.colors.accent,
        }}
      />

      <BrandBadge brand={brand} width={width} />
    </div>
  );
}
