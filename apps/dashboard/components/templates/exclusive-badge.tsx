import { resolveAspect, type Aspect, type BrandTokens } from './aspect';
import BrandBadge from './brand-badge';
import { stripEmoji } from './lib';

export type ExclusiveBadgeProps = {
  imageUrl: string;
  headline: string;
  eyebrow?: string;
  badgeText?: string;
  badgeValue?: string;
  ctaLabel?: string;
  phone?: string;
};

// Reference: Sample-posts/Exclusive + Save Badge.png — dark background,
// italic eyebrow + outlined boxed headline top-right, tall framed photo,
// circular discount badge floating over the photo's right edge, CTA pill
// centered on the bottom bar with phone/handle either side.
export default function ExclusiveBadge({
  imageUrl,
  headline,
  eyebrow = 'Exclusive',
  badgeText,
  badgeValue,
  ctaLabel = 'Book Now',
  phone,
  aspect = 'square',
  brand,
}: ExclusiveBadgeProps & { aspect?: Aspect; brand: BrandTokens }) {
  const { width, height } = resolveAspect(aspect);

  return (
    <div
      style={{
        width,
        height,
        position: 'relative',
        background: brand.colors.dark,
        fontFamily: brand.fonts.body,
        overflow: 'hidden',
      }}
    >
      <BrandBadge brand={brand} width={width} variant="lockup" textColor={brand.colors.light} />

      <div
        style={{
          position: 'absolute',
          right: Math.round(width * 0.05),
          top: Math.round(width * 0.055),
          textAlign: 'right',
          maxWidth: '52%',
        }}
      >
        <div
          style={{
            fontFamily: brand.fonts.heading,
            fontStyle: 'italic',
            fontSize: Math.round(width * 0.042),
            color: `${brand.colors.light}E6`,
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            marginTop: Math.round(width * 0.012),
            display: 'inline-block',
            border: `2px solid ${brand.colors.accent}`,
            padding: `${Math.round(width * 0.014)}px ${Math.round(width * 0.026)}px`,
          }}
        >
          <span
            style={{
              fontFamily: brand.fonts.heading,
              fontWeight: 800,
              fontSize: Math.round(width * 0.044),
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: brand.colors.accent,
            }}
          >
            {stripEmoji(headline)}
          </span>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: Math.round(width * 0.055),
          right: '22%',
          top: Math.round(height * 0.15),
          bottom: Math.round(height * 0.15),
          borderRadius: Math.round(width * 0.025),
          overflow: 'hidden',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>

      {badgeText && (
        <div
          style={{
            position: 'absolute',
            right: Math.round(width * 0.045),
            top: Math.round(height * 0.5),
            width: Math.round(width * 0.17),
            height: Math.round(width * 0.17),
            borderRadius: '50%',
            border: `1.5px solid ${brand.colors.accent}`,
            background: `${brand.colors.primary}CC`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            gap: 2,
          }}
        >
          <span style={{ fontFamily: brand.fonts.body, fontSize: Math.round(width * 0.015), color: brand.colors.light }}>
            {badgeText}
          </span>
          {badgeValue && (
            <span
              style={{
                fontFamily: brand.fonts.heading,
                fontWeight: 800,
                fontSize: Math.round(width * 0.034),
                color: brand.colors.accent,
              }}
            >
              {badgeValue}
            </span>
          )}
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `${Math.round(width * 0.045)}px ${Math.round(width * 0.055)}px`,
        }}
      >
        <span style={{ fontFamily: brand.fonts.body, fontSize: Math.round(width * 0.024), color: brand.colors.light }}>
          {phone || ''}
        </span>
        <span
          style={{
            fontFamily: brand.fonts.body,
            fontWeight: 700,
            fontSize: Math.round(width * 0.026),
            color: brand.colors.dark,
            background: brand.colors.accent,
            padding: `${Math.round(width * 0.017)}px ${Math.round(width * 0.036)}px`,
            borderRadius: 999,
          }}
        >
          {ctaLabel}
        </span>
        <span style={{ fontFamily: brand.fonts.body, fontSize: Math.round(width * 0.024), color: brand.colors.accent }}>
          {brand.socialHandle || ''}
        </span>
      </div>
    </div>
  );
}
