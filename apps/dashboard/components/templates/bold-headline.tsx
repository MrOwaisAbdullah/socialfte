import { resolveAspect, splitHeadlineWords, type Aspect, type BrandTokens } from './aspect';
import BrandBadge from './brand-badge';
import { stripEmoji } from './lib';

export type BoldHeadlineProps = {
  imageUrl: string;
  headline: string;
  subline?: string;
  badgeText?: string;
  ctaLabel?: string;
  phone?: string;
};

// Reference: Sample-posts/Bold Headline.png — dark full-bleed background,
// two-tone stacked headline top-left, framed photo with a circular discount
// badge overlapping its corner, CTA pill bottom-left, contact line
// bottom-right.
//
// Deliberately run as the black+bone+white+crimson variant (brand.colors.ink
// + brand.colors.secondary) instead of the usual green+gold — gives real
// visual variety across a batch of posts instead of every dark template
// converging on the same green+gold look (user feedback: "why all the
// posts are black + white + gold, where's the crimson").
export default function BoldHeadline({
  imageUrl,
  headline,
  subline,
  badgeText,
  ctaLabel = 'Shop Now',
  phone,
  aspect = 'square',
  brand,
}: BoldHeadlineProps & { aspect?: Aspect; brand: BrandTokens }) {
  const { width, height } = resolveAspect(aspect);
  const [line1, line2] = splitHeadlineWords(stripEmoji(headline));

  return (
    <div
      style={{
        width,
        height,
        position: 'relative',
        background: brand.colors.ink,
        fontFamily: brand.fonts.body,
        overflow: 'hidden',
      }}
    >
      <BrandBadge brand={brand} width={width} variant="lockup" textColor={brand.colors.light} />

      <div
        style={{
          position: 'absolute',
          left: Math.round(width * 0.055),
          top: Math.round(width * 0.14),
          maxWidth: '70%',
        }}
      >
        <h1
          style={{
            fontFamily: brand.fonts.heading,
            fontWeight: 800,
            // Was 0.078 — confirmed live, a real 2-word line2 ("Floor
            // Mirror") already wrapped to two lines at that size within
            // this 70%-wide box, and the framed-image box below (painted
            // after this in DOM order, so it visually covers anything
            // that overflows into its space) cut the wrapped second line
            // off mid-word. 0.062 matches the more conservative headline
            // sizing already used elsewhere (set-breakdown, carousel-slide).
            fontSize: Math.round(width * 0.062),
            letterSpacing: -1,
            lineHeight: 1.05,
            margin: 0,
            textTransform: 'uppercase',
            color: brand.colors.light,
          }}
        >
          {line1}
        </h1>
        {line2 && (
          <h1
            style={{
              fontFamily: brand.fonts.heading,
              fontWeight: 800,
              fontSize: Math.round(width * 0.062),
              lineHeight: 1.05,
              margin: 0,
              textTransform: 'uppercase',
              color: brand.colors.secondary,
            }}
          >
            {line2}
          </h1>
        )}
        {subline && (
          <p
            style={{
              marginTop: Math.round(width * 0.02),
              fontFamily: brand.fonts.body,
              fontSize: Math.round(width * 0.024),
              lineHeight: 1.4,
              color: `${brand.colors.light}CC`,
              maxWidth: '90%',
            }}
          >
            {stripEmoji(subline)}
          </p>
        )}
      </div>

      <div
        style={{
          position: 'absolute',
          left: Math.round(width * 0.055),
          right: Math.round(width * 0.055),
          // Was 0.41 — extra headroom for the headline block above
          // (worst case: an 8-word headline splits into two 4-word lines,
          // each of which can itself wrap), on top of the font-size fix.
          top: Math.round(height * 0.46),
          bottom: Math.round(height * 0.13),
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
            right: Math.round(width * 0.04),
            // Shifted down by the same 0.05 the framed-image box moved
            // (0.41 -> 0.46) so this still overlaps the image's top-right
            // corner as designed, rather than floating above it.
            top: Math.round(height * 0.41),
            width: Math.round(width * 0.16),
            height: Math.round(width * 0.16),
            borderRadius: '50%',
            background: brand.colors.secondary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            transform: 'rotate(-8deg)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          }}
        >
          <span
            style={{
              fontFamily: brand.fonts.body,
              fontWeight: 700,
              fontSize: Math.round(width * 0.017),
              color: brand.colors.light,
              lineHeight: 1.2,
            }}
          >
            {badgeText}
          </span>
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          left: Math.round(width * 0.055),
          bottom: Math.round(width * 0.045),
          fontFamily: brand.fonts.body,
          fontWeight: 700,
          fontSize: Math.round(width * 0.026),
          color: brand.colors.light,
          background: brand.colors.secondary,
          padding: `${Math.round(width * 0.017)}px ${Math.round(width * 0.036)}px`,
          borderRadius: 999,
        }}
      >
        {ctaLabel}
      </div>

      {(phone || brand.socialHandle) && (
        <div
          style={{
            position: 'absolute',
            right: Math.round(width * 0.05),
            bottom: Math.round(width * 0.045),
            textAlign: 'right',
            fontFamily: brand.fonts.body,
            fontSize: Math.round(width * 0.024),
          }}
        >
          {phone && <div style={{ color: brand.colors.light }}>{phone}</div>}
          {brand.socialHandle && <div style={{ color: brand.colors.secondary }}>{brand.socialHandle}</div>}
        </div>
      )}
    </div>
  );
}
