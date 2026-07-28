import type { BrandTokens } from './aspect';

// Small corner mark: logo image (if brand.logoUrl is set) + social handle
// text (if brand.socialHandle is set). Renders nothing if showBrandMark is
// explicitly false, or if neither logoUrl nor socialHandle is set — every
// template places this last, inside a position:'relative' outer container,
// so it always overlays in the bottom-right corner regardless of the
// template's own layout.
export default function BrandBadge({ brand, width }: { brand: BrandTokens; width: number }) {
  if (brand.showBrandMark === false) return null;
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
