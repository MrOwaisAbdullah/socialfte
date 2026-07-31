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
        src={thumbnailUrl || ''}
        alt=""
        style={{
          width: Math.round(width * 0.22),
          height: Math.round(width * 0.22),
          objectFit: 'cover',
          borderRadius: 16,
        }}
        onLoad={() => {
          if (typeof window !== 'undefined') {
            console.log(`[Quote Template] Thumbnail loaded: ${thumbnailUrl}`);
          }
        }}
        onError={(e) => {
          if (typeof window !== 'undefined') {
            console.error(`[Quote Template] Thumbnail failed to load: ${thumbnailUrl}`);
          }
        }}
      />
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(12px)',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          boxShadow: '0 8px 24px rgba(26, 26, 26, 0.12)',
          padding: `${Math.round(width * 0.04)}px ${Math.round(width * 0.06)}px`,
        }}
      >
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
      </div>
      <span
        style={{
          fontFamily: brand.fonts.heading,
          fontSize: Math.round(width * 0.036),
          color: '#d62828',
          fontWeight: 600,
        }}
      >
        {brand.wordmark}
      </span>
      <BrandBadge brand={brand} width={width} />
    </div>
  );
}
