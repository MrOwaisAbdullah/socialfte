import { resolveAspect, type Aspect, type BrandTokens } from './aspect';

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
              borderBottom: `1px solid ${brand.colors.dark}22`,
              paddingBottom: Math.round(width * 0.015),
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
            color: brand.colors.primary,
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
    </div>
  );
}
