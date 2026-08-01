import { resolveAspect, type Aspect, type BrandTokens } from './aspect';
import BrandBadge from './brand-badge';
import { stripEmoji } from './lib';

export type SetBreakdownProps = {
  setName: string;
  pieces: { name: string; price: string }[];
  bundlePrice: string;
  savings?: string;
  imageUrl?: string;
};

// Editorial list card: hairline-divided rows instead of the previous
// glassmorphism boxes (rgba(255,255,255,0.08) white glass on this
// template's light background, same near-invisible issue as quote.tsx had)
// and an italic-serif bundle price for the same two-tier type contrast the
// rest of the templates use. `imageUrl` is new and optional — this
// template previously had no image slot at all, so compose_batch.py's
// single-asset path (pieces=[], bundlePrice='' — no real per-piece data to
// show) rendered almost entirely blank space; a photo, when available,
// gives it something to look at either way.
export default function SetBreakdown({
  setName,
  pieces,
  bundlePrice,
  savings,
  imageUrl,
  aspect = 'square',
  brand,
}: SetBreakdownProps & { aspect?: Aspect; brand: BrandTokens }) {
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
        padding: Math.round(width * 0.07),
      }}
    >
      <h1
        style={{
          fontFamily: brand.fonts.heading,
          fontWeight: 700,
          fontSize: Math.round(width * 0.062),
          letterSpacing: -0.5,
          color: brand.colors.dark,
          margin: 0,
        }}
      >
        {stripEmoji(setName)}
      </h1>

      {imageUrl && (
        <div
          style={{
            marginTop: Math.round(width * 0.03),
            height: Math.round(height * 0.32),
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}

      <div
        style={{
          marginTop: Math.round(width * 0.04),
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          borderTop: `1px solid ${brand.colors.muted}33`,
        }}
      >
        {pieces.map((piece) => (
          <div
            key={piece.name}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              borderBottom: `1px solid ${brand.colors.muted}33`,
              padding: `${Math.round(width * 0.02)}px 0`,
            }}
          >
            <span style={{ fontSize: Math.round(width * 0.03), color: brand.colors.dark }}>{stripEmoji(piece.name)}</span>
            <span style={{ fontSize: Math.round(width * 0.03), color: brand.colors.muted }}>{stripEmoji(piece.price)}</span>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: Math.round(width * 0.04),
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <span style={{ display: 'block', fontSize: Math.round(width * 0.024), color: brand.colors.muted }}>
            Bundle price
          </span>
          <span
            style={{
              fontFamily: brand.fonts.heading,
              fontStyle: 'italic',
              fontSize: Math.round(width * 0.088),
              color: brand.colors.accent,
            }}
          >
            {stripEmoji(bundlePrice)}
          </span>
        </div>
        {savings && (
          <span
            style={{
              fontSize: Math.round(width * 0.024),
              fontWeight: 700,
              color: brand.colors.dark,
              background: brand.colors.accent,
              padding: `${Math.round(width * 0.012)}px ${Math.round(width * 0.02)}px`,
              borderRadius: 4,
            }}
          >
            {stripEmoji(savings)}
          </span>
        )}
      </div>
      <BrandBadge brand={brand} width={width} />
    </div>
  );
}
