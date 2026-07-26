import { resolveAspect, type Aspect, type BrandTokens } from './aspect';

export type PriceCardProps = {
  productName: string;
  tierLabel: string;
  price: string;
  ctaLabel?: string;
};

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
        background: brand.colors.primary,
        fontFamily: brand.fonts.body,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Math.round(width * 0.03),
        padding: Math.round(width * 0.08),
        textAlign: 'center',
      }}
    >
      <span
        style={{
          fontFamily: brand.fonts.body,
          fontWeight: 600,
          fontSize: Math.round(width * 0.028),
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: brand.colors.accent,
        }}
      >
        {tierLabel}
      </span>
      <h1
        style={{
          fontFamily: brand.fonts.heading,
          fontSize: Math.round(width * 0.07),
          color: brand.colors.light,
          margin: 0,
        }}
      >
        {productName}
      </h1>
      <p
        style={{
          fontFamily: brand.fonts.heading,
          fontSize: Math.round(width * 0.13),
          color: brand.colors.accent,
          margin: 0,
        }}
      >
        {price}
      </p>
      <span
        style={{
          marginTop: Math.round(width * 0.02),
          fontFamily: brand.fonts.body,
          fontWeight: 600,
          fontSize: Math.round(width * 0.028),
          color: brand.colors.dark,
          background: brand.colors.accent,
          padding: `${Math.round(width * 0.016)}px ${Math.round(width * 0.032)}px`,
          borderRadius: 999,
        }}
      >
        {ctaLabel}
      </span>
    </div>
  );
}
