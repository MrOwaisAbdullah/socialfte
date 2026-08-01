import { resolveAspect, type Aspect, type BrandTokens } from './aspect';
import BrandBadge from './brand-badge';
import { stripEmoji } from './lib';

export type CarouselSlideProps = {
  imageUrl: string;
  headline: string;
  bodyCopy?: string;
  slideIndex?: number;
  slideCount?: number;
};

// Deliberately lighter-touch than hero.tsx (which this used to duplicate
// almost exactly — same full-bleed-photo-plus-glass-panel shape): a slide
// meant to be swiped through many times in a row reads better with the
// text sitting directly on the photo (text-shadow for legibility) than
// another heavy glass panel every single slide. The slide counter is a
// small solid rect, not a pill, so it reads as a page marker rather than
// a second CTA-shaped element competing with the real one on other templates.
export default function CarouselSlide({
  imageUrl,
  headline,
  bodyCopy,
  slideIndex,
  slideCount,
  aspect = 'square',
  brand,
}: CarouselSlideProps & { aspect?: Aspect; brand: BrandTokens }) {
  const { width, height } = resolveAspect(aspect);

  return (
    <div
      style={{
        width,
        height,
        position: 'relative',
        overflow: 'hidden',
        fontFamily: brand.fonts.body,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(to top, ${brand.colors.dark}E6 0%, transparent 55%)`,
        }}
      />
      {slideIndex && slideCount && (
        <span
          style={{
            position: 'absolute',
            top: Math.round(width * 0.045),
            right: Math.round(width * 0.05),
            fontFamily: brand.fonts.body,
            fontWeight: 700,
            fontSize: Math.round(width * 0.024),
            color: brand.colors.dark,
            background: brand.colors.light,
            padding: '5px 12px',
            borderRadius: 4,
          }}
        >
          {slideIndex} / {slideCount}
        </span>
      )}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: Math.round(width * 0.06),
          display: 'flex',
          flexDirection: 'column',
          gap: Math.round(width * 0.015),
        }}
      >
        <h2
          style={{
            fontFamily: brand.fonts.heading,
            fontWeight: 700,
            fontSize: Math.round(width * 0.058),
            letterSpacing: -0.5,
            lineHeight: 1.1,
            color: brand.colors.light,
            margin: 0,
            textShadow: `0 2px 12px ${brand.colors.dark}AA`,
          }}
        >
          {stripEmoji(headline)}
        </h2>
        {bodyCopy && (
          <p
            style={{
              fontFamily: brand.fonts.body,
              fontSize: Math.round(width * 0.028),
              color: brand.colors.light,
              margin: 0,
              textShadow: `0 1px 8px ${brand.colors.dark}AA`,
            }}
          >
            {stripEmoji(bodyCopy)}
          </p>
        )}
      </div>
      <BrandBadge brand={brand} width={width} />
    </div>
  );
}
