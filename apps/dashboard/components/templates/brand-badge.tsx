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
  // + social handle text (if brand.socialHandle is set), plus an optional
  // website/phone contact pill stacked above it (only when set — same
  // no-fabrication rule as the caption CTA: never a placeholder on a
  // rendered image). Renders nothing if none of the four are set — every
  // template places this last, inside a position:'relative' outer
  // container, so it always overlays in the bottom-right corner regardless
  // of the template's own layout.
  if (!brand.logoUrl && !brand.socialHandle && !brand.website && !brand.phone) return null;

  const logoSize = Math.round(width * 0.09);
  const contactFontSize = Math.round(width * 0.022);
  const iconSize = Math.round(width * 0.02);

  return (
    <div
      style={{
        position: 'absolute',
        right: Math.round(width * 0.04),
        bottom: Math.round(width * 0.04),
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: Math.round(width * 0.012),
      }}
    >
      {(brand.website || brand.phone) && (
        // Stacked rows (website above phone), not one wide row — a
        // combined "yousufliving.pk  +92 313 045 3565" pill grew far
        // wider than the corner clearance existing templates already
        // reserve for the (much shorter) logo/handle pill it stacks
        // above, and overlapped headline text on real renders
        // (carousel-slide.tsx confirmed live). Each row alone is roughly
        // the same width as "@yousufliving", so it fits the clearance
        // every template using BrandBadge already has.
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: Math.round(width * 0.006),
            padding: `${Math.round(width * 0.012)}px ${Math.round(width * 0.018)}px`,
            borderRadius: Math.round(width * 0.014),
            background: `${brand.colors.primary}EE`,
            border: `1.5px solid ${brand.colors.accent}`,
          }}
        >
          {brand.website && (
            <span style={{ display: 'flex', alignItems: 'center', gap: Math.round(width * 0.006) }}>
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={brand.colors.accent} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                <path d="M2 12h20" />
              </svg>
              <span style={{ fontFamily: brand.fonts.body, fontWeight: 700, fontSize: contactFontSize, color: brand.colors.light }}>
                {brand.website}
              </span>
            </span>
          )}
          {brand.phone && (
            <span style={{ display: 'flex', alignItems: 'center', gap: Math.round(width * 0.006) }}>
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={brand.colors.accent} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              <span style={{ fontFamily: brand.fonts.body, fontWeight: 700, fontSize: contactFontSize, color: brand.colors.light }}>
                {brand.phone}
              </span>
            </span>
          )}
        </div>
      )}
      {(brand.logoUrl || brand.socialHandle) && (
        <div
          style={{
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
      )}
    </div>
  );
}
