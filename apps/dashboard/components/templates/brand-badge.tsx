import type { BrandTokens } from './aspect';

type BrandBadgeProps = {
  brand: BrandTokens;
  width: number;
  // 'corner' (default): small bottom-right pill, logo + social handle —
  // used by hero/price-card/etc. 'lockup': prominent top-left mark (logo
  // circle + bold wordmark), the way the sample-post designs actually brand
  // every post — used by the sample-post-inspired templates
  // (bold-headline, exclusive-badge, light-circle-frame, sweet-dreams).
  variant?: 'corner' | 'lockup';
  // 'lockup' only — text color depends on the template's own background,
  // which BrandBadge has no way to know on its own.
  textColor?: string;
};

export default function BrandBadge({ brand, width, variant = 'corner', textColor }: BrandBadgeProps) {
  if (brand.showBrandMark === false) return null;

  if (variant === 'lockup') {
    // Degrades to wordmark-only text (no empty circle) when there's no
    // uploaded logo — still renders as long as there's a wordmark, unlike
    // 'corner' which needs a logo or handle to be worth showing at all.
    if (!brand.wordmark) return null;
    const markSize = Math.round(width * 0.075);
    return (
      <div
        style={{
          position: 'absolute',
          left: Math.round(width * 0.055),
          top: Math.round(width * 0.045),
          display: 'flex',
          alignItems: 'center',
          gap: Math.round(width * 0.018),
        }}
      >
        {brand.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brand.logoUrl}
            alt=""
            style={{
              width: markSize,
              height: markSize,
              borderRadius: '50%',
              objectFit: 'cover',
              border: `1.5px solid ${textColor || brand.colors.accent}`,
            }}
          />
        )}
        <span
          style={{
            fontFamily: brand.fonts.heading,
            fontWeight: 700,
            fontSize: Math.round(width * 0.03),
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: textColor || brand.colors.light,
          }}
        >
          {brand.wordmark}
        </span>
      </div>
    );
  }

  // 'corner': small bottom-right mark, logo image (if brand.logoUrl is set)
  // + social handle text (if brand.socialHandle is set). Renders nothing if
  // neither logoUrl nor socialHandle is set — every template places this
  // last, inside a position:'relative' outer container, so it always
  // overlays in the bottom-right corner regardless of the template's own
  // layout.
  if (!brand.logoUrl && !brand.socialHandle) return null;

  const logoSize = Math.round(width * 0.09);

  return (
    <div
      style={{
        position: 'absolute',
        right: Math.round(width * 0.04),
        bottom: Math.round(width * 0.04),
        display: 'flex',
        alignItems: 'center',
        gap: Math.round(width * 0.015),
        padding: `${Math.round(width * 0.012)}px ${Math.round(width * 0.02)}px`,
        borderRadius: 999,
        background: `${brand.colors.dark}66`,
      }}
    >
      {brand.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={brand.logoUrl}
          alt=""
          style={{ width: logoSize, height: logoSize, borderRadius: '50%', objectFit: 'cover' }}
        />
      )}
      {brand.socialHandle && (
        <span
          style={{
            fontFamily: brand.fonts.body,
            fontWeight: 600,
            fontSize: Math.round(width * 0.024),
            color: brand.colors.light,
          }}
        >
          {brand.socialHandle}
        </span>
      )}
    </div>
  );
}
