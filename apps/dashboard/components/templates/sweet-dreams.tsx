import { resolveAspect, type Aspect, type BrandTokens } from './aspect';
import BrandBadge from './brand-badge';

export type SweetDreamsProps = {
  imageUrl: string;
  headline: string;
  ctaLabel?: string;
  phone?: string;
};

// Reference: Sample-posts/Sweet Dreams.png — dark split layout: left panel
// carries a big stacked headline (one word per line) and a small CTA pill,
// right panel is the photo bleeding to the edge with rounded inner corners.
// Bottom-left carries a "buy online" box, bottom-right the phone.
export default function SweetDreams({
  imageUrl,
  headline,
  ctaLabel = 'Shop Now',
  phone,
  aspect = 'square',
  brand,
}: SweetDreamsProps & { aspect?: Aspect; brand: BrandTokens }) {
  const { width, height } = resolveAspect(aspect);
  const words = headline.trim().split(/\s+/).filter(Boolean);

  return (
    <div
      style={{
        width,
        height,
        position: 'relative',
        background: brand.colors.dark,
        fontFamily: brand.fonts.body,
        display: 'flex',
        overflow: 'hidden',
      }}
    >
      <BrandBadge brand={brand} width={width} variant="lockup" textColor={brand.colors.light} />

      <div
        style={{
          width: '46%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: `0 ${Math.round(width * 0.055)}px`,
          gap: Math.round(width * 0.03),
        }}
      >
        <div>
          {words.map((word, i) => (
            <h1
              key={i}
              style={{
                fontFamily: brand.fonts.heading,
                fontWeight: 800,
                fontSize: Math.round(width * 0.078),
                lineHeight: 1.05,
                textTransform: 'uppercase',
                color: brand.colors.light,
                margin: 0,
              }}
            >
              {word}
            </h1>
          ))}
        </div>
        <span
          style={{
            alignSelf: 'flex-start',
            fontFamily: brand.fonts.body,
            fontWeight: 700,
            fontSize: Math.round(width * 0.024),
            color: brand.colors.dark,
            background: brand.colors.accent,
            padding: `${Math.round(width * 0.015)}px ${Math.round(width * 0.03)}px`,
            borderRadius: 6,
          }}
        >
          {ctaLabel}
        </span>
      </div>

      <div
        style={{
          position: 'absolute',
          right: 0,
          top: Math.round(height * 0.16),
          bottom: Math.round(height * 0.16),
          left: '46%',
          borderRadius: `${Math.round(width * 0.025)}px 0 0 ${Math.round(width * 0.025)}px`,
          overflow: 'hidden',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>

      {brand.socialHandle && (
        <div
          style={{
            position: 'absolute',
            left: Math.round(width * 0.055),
            bottom: Math.round(width * 0.045),
            border: `1.5px solid ${brand.colors.accent}`,
            borderRadius: 8,
            padding: `${Math.round(width * 0.012)}px ${Math.round(width * 0.02)}px`,
          }}
        >
          <div style={{ fontFamily: brand.fonts.body, fontSize: Math.round(width * 0.017), color: `${brand.colors.light}CC` }}>
            Buy online:
          </div>
          <div style={{ fontFamily: brand.fonts.body, fontWeight: 700, fontSize: Math.round(width * 0.022), color: brand.colors.accent }}>
            {brand.socialHandle}
          </div>
        </div>
      )}

      {phone && (
        <div
          style={{
            position: 'absolute',
            right: Math.round(width * 0.05),
            bottom: Math.round(width * 0.045),
            fontFamily: brand.fonts.body,
            fontSize: Math.round(width * 0.024),
            color: brand.colors.light,
          }}
        >
          {phone}
        </div>
      )}
    </div>
  );
}
