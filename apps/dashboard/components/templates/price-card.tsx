import { resolveAspect, type Aspect, type BrandTokens } from './aspect';
import BrandBadge from './brand-badge';
import { stripEmoji } from './lib';

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
        position: 'relative',
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
          color: '#d62828',
        }}
      >
        {stripEmoji(tierLabel)}
      </span>
      <h1
        style={{
          fontFamily: brand.fonts.heading,
          fontSize: Math.round(width * 0.07),
          color: brand.colors.light,
          margin: 0,
        }}
      >
        {stripEmoji(productName)}
      </h1>
      {/* Price with glassmorphism card effect */}
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(12px)',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          boxShadow: '0 8px 24px rgba(26, 26, 26, 0.12)',
          padding: `${Math.round(width * 0.024)}px ${Math.round(width * 0.048)}px`,
        }}
      >
        <p
          style={{
            fontFamily: brand.fonts.heading,
            fontSize: Math.round(width * 0.13),
            color: '#d62828',
            margin: 0,
          }}
        >
          {stripEmoji(price)}
        </p>
      </div>
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
        {stripEmoji(ctaLabel)}
      </span>
      <BrandBadge brand={brand} width={width} />
    </div>
  );
}
