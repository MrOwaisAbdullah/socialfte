import { resolveAspect, type Aspect, type BrandTokens } from './aspect';
import BrandBadge from './brand-badge';
import { stripEmoji } from './lib';

export type LightCircleFrameProps = {
  imageUrl: string;
  headline: string;
  eyebrow?: string;
  badgeText?: string;
  badgeValue?: string;
  ctaLabel?: string;
  phone?: string;
};

// Reference: Sample-posts/Light Circle Frame.png — light/cream background,
// small top-left lockup, italic eyebrow + headline top-right, large circular
// framed photo with a ring border in the brand's dark color, a discount
// badge floating over the ring's left edge, contact info bottom-left, CTA
// pill bottom-right.
export default function LightCircleFrame({
  imageUrl,
  headline,
  eyebrow = 'Exclusive',
  badgeText,
  badgeValue,
  ctaLabel = 'Order Now',
  phone,
  aspect = 'square',
  brand,
}: LightCircleFrameProps & { aspect?: Aspect; brand: BrandTokens }) {
  const { width, height } = resolveAspect(aspect);
  const circleSize = Math.round(Math.min(width, height) * 0.82);

  return (
    <div
      style={{
        width,
        height,
        position: 'relative',
        background: brand.colors.light,
        fontFamily: brand.fonts.body,
        overflow: 'hidden',
      }}
    >
      <BrandBadge brand={brand} width={width} variant="lockup" textColor={brand.colors.dark} />

      <div
        style={{
          position: 'absolute',
          right: Math.round(width * 0.05),
          top: Math.round(width * 0.045),
          textAlign: 'right',
        }}
      >
        <div
          style={{
            fontFamily: brand.fonts.heading,
            fontStyle: 'italic',
            fontSize: Math.round(width * 0.034),
            color: brand.colors.dark,
          }}
        >
          {stripEmoji(eyebrow)}
        </div>
        <div
          style={{
            fontFamily: brand.fonts.heading,
            fontWeight: 800,
            fontSize: Math.round(width * 0.052),
            letterSpacing: -0.5,
            textTransform: 'uppercase',
            color: brand.colors.dark,
            lineHeight: 1.1,
          }}
        >
          {stripEmoji(headline)}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '55%',
          transform: 'translate(-50%, -50%)',
          width: circleSize,
          height: circleSize,
          borderRadius: '50%',
          border: `${Math.round(width * 0.017)}px solid ${brand.colors.dark}`,
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
            left: Math.round(width * 0.06),
            top: Math.round(height * 0.44),
            width: Math.round(width * 0.16),
            height: Math.round(width * 0.16),
            borderRadius: '50%',
            background: brand.colors.accent,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          }}
        >
          <span style={{ fontFamily: brand.fonts.body, fontSize: Math.round(width * 0.015), color: brand.colors.dark }}>
            {stripEmoji(badgeText)}
          </span>
          {badgeValue && (
            <span
              style={{
                fontFamily: brand.fonts.heading,
                fontWeight: 800,
                fontSize: Math.round(width * 0.03),
                color: brand.colors.dark,
              }}
            >
              {stripEmoji(badgeValue)}
            </span>
          )}
        </div>
      )}

      {phone && (
        <div
          style={{
            position: 'absolute',
            left: Math.round(width * 0.05),
            bottom: Math.round(width * 0.045),
            fontFamily: brand.fonts.body,
            fontSize: Math.round(width * 0.024),
          }}
        >
          <div style={{ color: brand.colors.muted, fontSize: Math.round(width * 0.02) }}>Call for more info</div>
          <div style={{ color: brand.colors.dark, fontWeight: 700 }}>{phone}</div>
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          right: Math.round(width * 0.05),
          bottom: Math.round(width * 0.045),
          fontFamily: brand.fonts.body,
          fontWeight: 700,
          fontSize: Math.round(width * 0.026),
          color: brand.colors.dark,
          background: brand.colors.accent,
          padding: `${Math.round(width * 0.017)}px ${Math.round(width * 0.036)}px`,
          borderRadius: 999,
        }}
      >
        {stripEmoji(ctaLabel)}
      </div>
    </div>
  );
}
