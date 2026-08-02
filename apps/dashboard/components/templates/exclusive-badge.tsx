import { resolveAspect, type Aspect, type BrandTokens } from './aspect';
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
//
// The header row and photo used to both be absolutely positioned, with the
// photo's `top` a hardcoded fraction of the canvas height. That only held
// up for a short headline — a longer one (e.g. "Your Daily Routine,
// Upgraded.") wraps to 2 lines, making the header block taller than the
// fixed offset assumed, so the box's bottom edge visually overlapped the
// photo below it (confirmed live via a real post's render, and reproduced
// exactly with that same headline text). Switched the header/photo/footer
// to a flex column instead: the header's real rendered height — whatever
// it turns out to be for a given headline — pushes the photo down via
// normal flow, so this can't recur regardless of headline length.
//
// Deliberately run as the black+bone+white+crimson variant (brand.colors.ink
// + brand.colors.secondary) instead of the usual green+gold — gives real
// visual variety across a batch of posts instead of every dark template
// converging on the same green+gold look (user feedback: "why all the
// posts are black + white + gold, where's the crimson").
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
        background: brand.colors.ink,
        fontFamily: brand.fonts.body,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          padding: `${Math.round(width * 0.055)}px ${Math.round(width * 0.05)}px 0`,
          gap: Math.round(width * 0.03),
        }}
      >
        {brand.wordmark && (
          <span
            style={{
              fontFamily: brand.fonts.heading,
              fontWeight: 700,
              fontSize: Math.round(width * 0.03),
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: brand.colors.light,
            }}
          >
            {brand.wordmark}
          </span>
        )}
        <div style={{ textAlign: 'right', maxWidth: '58%' }}>
          <div
            style={{
              fontFamily: brand.fonts.heading,
              fontStyle: 'italic',
              fontSize: Math.round(width * 0.042),
              color: `${brand.colors.light}E6`,
            }}
          >
            {stripEmoji(eyebrow)}
          </div>
          <div
            style={{
              marginTop: Math.round(width * 0.012),
              display: 'inline-block',
              border: `2px solid ${brand.colors.secondary}`,
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
                color: brand.colors.secondary,
              }}
            >
              {stripEmoji(headline)}
            </span>
          </div>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          position: 'relative',
          margin: `${Math.round(width * 0.03)}px ${Math.round(width * 0.22)}px ${Math.round(width * 0.03)}px ${Math.round(width * 0.055)}px`,
        }}
      >
        {/* Image clipping lives on its own inset layer, separate from this
            container — the badge below floats outside this box on purpose
            (right is negative), and this container's own overflow must stay
            visible or the badge gets clipped away with it (confirmed live:
            badgeText/badgeValue were set but the circle never appeared). */}
        <div style={{ position: 'absolute', inset: 0, borderRadius: Math.round(width * 0.025), overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>

        {badgeText && (
          <div
            style={{
              position: 'absolute',
              right: -Math.round(width * 0.175),
              top: '50%',
              transform: 'translateY(-50%)',
              width: Math.round(width * 0.17),
              height: Math.round(width * 0.17),
              borderRadius: '50%',
              border: `1.5px solid ${brand.colors.light}`,
              background: brand.colors.secondary,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              gap: 2,
            }}
          >
            <span style={{ fontFamily: brand.fonts.body, fontSize: Math.round(width * 0.015), color: brand.colors.light }}>
              {stripEmoji(badgeText)}
            </span>
            {badgeValue && (
              <span
                style={{
                  fontFamily: brand.fonts.heading,
                  fontWeight: 800,
                  fontSize: Math.round(width * 0.034),
                  color: brand.colors.light,
                }}
              >
                {stripEmoji(badgeValue)}
              </span>
            )}
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `0 ${Math.round(width * 0.055)}px ${Math.round(width * 0.045)}px`,
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
            color: brand.colors.light,
            background: brand.colors.secondary,
            padding: `${Math.round(width * 0.017)}px ${Math.round(width * 0.036)}px`,
            borderRadius: 999,
          }}
        >
          {stripEmoji(ctaLabel)}
        </span>
        <span style={{ fontFamily: brand.fonts.body, fontSize: Math.round(width * 0.024), color: brand.colors.secondary }}>
          {brand.socialHandle || ''}
        </span>
      </div>
    </div>
  );
}
