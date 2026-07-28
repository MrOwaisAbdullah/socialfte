import { resolveAspect, type Aspect, type BrandTokens } from './aspect';
import BrandBadge from './brand-badge';

export type CarouselSlideProps = {
  imageUrl: string;
  headline: string;
  bodyCopy?: string;
  slideIndex?: number;
  slideCount?: number;
};

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
          background: `linear-gradient(to top, ${brand.colors.dark}CC 0%, transparent 45%)`,
        }}
      />
      {slideIndex && slideCount && (
        <span
          style={{
            position: 'absolute',
            top: Math.round(width * 0.04),
            right: Math.round(width * 0.05),
            fontFamily: brand.fonts.body,
            fontWeight: 600,
            fontSize: Math.round(width * 0.026),
            color: brand.colors.light,
            background: `${brand.colors.dark}99`,
            padding: '4px 12px',
            borderRadius: 999,
          }}
        >
          {slideIndex}/{slideCount}
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
            fontSize: Math.round(width * 0.055),
            color: brand.colors.light,
            margin: 0,
          }}
        >
          {headline}
        </h2>
        {bodyCopy && (
          <p
            style={{
              fontFamily: brand.fonts.body,
              fontSize: Math.round(width * 0.028),
              color: brand.colors.light,
              margin: 0,
            }}
          >
            {bodyCopy}
          </p>
        )}
      </div>
      <BrandBadge brand={brand} width={width} />
    </div>
  );
}
