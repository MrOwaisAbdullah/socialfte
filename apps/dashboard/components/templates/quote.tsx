import { resolveAspect, type Aspect, type BrandTokens } from './aspect';
import BrandBadge from './brand-badge';

export type QuoteProps = {
  quote: string;
  thumbnailUrl: string;
};

// Brand mark rendered per BRAND.md's logo-usage rule: wordmark in the display
// font, forest-green-on-cream (this template's light background).
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
        padding: Math.round(width * 0.1),
        gap: Math.round(width * 0.05),
        textAlign: 'center',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbnailUrl}
        alt=""
        style={{
          width: Math.round(width * 0.22),
          height: Math.round(width * 0.22),
          objectFit: 'cover',
          borderRadius: 16,
        }}
      />
      <p
        style={{
          fontFamily: brand.fonts.heading,
          fontStyle: 'italic',
          fontSize: Math.round(width * 0.06),
          color: brand.colors.dark,
          lineHeight: 1.3,
          margin: 0,
        }}
      >
        &ldquo;{quote}&rdquo;
      </p>
      <span
        style={{
          fontFamily: brand.fonts.heading,
          fontSize: Math.round(width * 0.036),
          color: brand.colors.primary,
        }}
      >
        {brand.wordmark}
      </span>
      <BrandBadge brand={brand} width={width} />
    </div>
  );
}
