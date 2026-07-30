import { resolveAspect, type Aspect, type BrandTokens } from './aspect';
import BrandBadge from './brand-badge';

export type SetBreakdownProps = {
  setName: string;
  pieces: { name: string; price: string }[];
  bundlePrice: string;
  savings?: string;
};

export default function SetBreakdown({
  setName,
  pieces,
  bundlePrice,
  savings,
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
          fontSize: Math.round(width * 0.06),
          color: brand.colors.primary,
          margin: 0,
        }}
      >
        {setName}
      </h1>
      <div
        style={{
          marginTop: Math.round(width * 0.04),
          display: 'flex',
          flexDirection: 'column',
          gap: Math.round(width * 0.02),
          flex: 1,
        }}
      >
        {pieces.map((piece) => (
          <div
            key={piece.name}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              background: 'rgba(255, 255, 255, 0.08)',
              backdropFilter: 'blur(12px)',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 8px 24px rgba(26, 26, 26, 0.12)',
              padding: `${Math.round(width * 0.016)}px ${Math.round(width * 0.032)}px`,
            }}
          >
            <span style={{ fontSize: Math.round(width * 0.032), color: brand.colors.dark }}>{piece.name}</span>
            <span style={{ fontSize: Math.round(width * 0.032), color: brand.colors.muted }}>{piece.price}</span>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: Math.round(width * 0.04),
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: Math.round(width * 0.01),
        }}
      >
        <span style={{ fontSize: Math.round(width * 0.028), color: brand.colors.muted }}>Bundle price</span>
        <span
          style={{
            fontFamily: brand.fonts.heading,
            fontSize: Math.round(width * 0.09),
            color: '#d62828',
          }}
        >
          {bundlePrice}
        </span>
        {savings && (
          <span
            style={{
              fontSize: Math.round(width * 0.026),
              fontWeight: 600,
              color: brand.colors.dark,
              background: brand.colors.accent,
              padding: `${Math.round(width * 0.01)}px ${Math.round(width * 0.02)}px`,
              borderRadius: 6,
            }}
          >
            {savings}
          </span>
        )}
      </div>
      <BrandBadge brand={brand} width={width} />
    </div>
  );
}
