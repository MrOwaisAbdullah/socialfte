import { resolveAspect, type Aspect, type BrandTokens } from './aspect';
import BrandBadge from './brand-badge';
import { stripEmoji } from './lib';

export type QuoteProps = {
  quote: string;
  thumbnailUrl: string;
};

// Editorial testimonial card, not a glass panel — the previous version's
// glassmorphism box (rgba(255,255,255,0.08) white glass) was built for a
// dark background and was nearly invisible here on brand.colors.light,
// adding padding and a shadow without adding any real visual distinction.
// A large decorative quotation mark + confident italic serif setting reads
// as intentional on a light page; a barely-visible box did not.
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
        background: brand.colors.light,
        fontFamily: brand.fonts.body,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: Math.round(width * 0.11),
        textAlign: 'center',
      }}
    >
      <span
        style={{
          fontFamily: brand.fonts.heading,
          fontSize: Math.round(width * 0.16),
          lineHeight: 0.6,
          color: `${brand.colors.accent}55`,
        }}
      >
        &ldquo;
      </span>

      <p
        style={{
          fontFamily: brand.fonts.heading,
          fontStyle: 'italic',
          fontSize: Math.round(width * 0.062),
          letterSpacing: -0.5,
          color: brand.colors.dark,
          lineHeight: 1.28,
          margin: `${Math.round(width * 0.02)}px 0 ${Math.round(width * 0.05)}px`,
          maxWidth: '86%',
        }}
      >
        {stripEmoji(quote)}
      </p>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: Math.round(width * 0.02),
        }}
      >
        {thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt=""
            style={{
              width: Math.round(width * 0.11),
              height: Math.round(width * 0.11),
              objectFit: 'cover',
              borderRadius: '50%',
              border: `2px solid ${brand.colors.accent}`,
            }}
          />
        )}
        <span
          style={{
            fontFamily: brand.fonts.body,
            fontWeight: 700,
            fontSize: Math.round(width * 0.03),
            letterSpacing: 0.3,
            color: brand.colors.dark,
          }}
        >
          {brand.wordmark}
        </span>
      </div>

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
