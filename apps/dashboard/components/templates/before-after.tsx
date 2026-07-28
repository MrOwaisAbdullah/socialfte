import { resolveAspect, type Aspect, type BrandTokens } from './aspect';
import BrandBadge from './brand-badge';

export type BeforeAfterProps = {
  beforeImageUrl: string;
  afterImageUrl: string;
  label?: string;
};

// Two-panel still layout (spec.md Story 4) — side-by-side on wide/square
// aspects, stacked on the tall 9:16 reel aspect where a side-by-side split
// would leave each panel too narrow to read.
export default function BeforeAfter({
  beforeImageUrl,
  afterImageUrl,
  label,
  aspect = 'square',
  brand,
}: BeforeAfterProps & { aspect?: Aspect; brand: BrandTokens }) {
  const { width, height } = resolveAspect(aspect);
  const stacked = aspect === 'reel';

  return (
    <div
      style={{
        width,
        height,
        position: 'relative',
        background: brand.colors.dark,
        fontFamily: brand.fonts.body,
        display: 'flex',
        flexDirection: stacked ? 'column' : 'row',
      }}
    >
      {[
        { src: beforeImageUrl, caption: 'Before' },
        { src: afterImageUrl, caption: 'After' },
      ].map((panel) => (
        <div key={panel.caption} style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={panel.src}
            alt=""
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <span
            style={{
              position: 'absolute',
              left: 16,
              bottom: 16,
              fontFamily: brand.fonts.body,
              fontWeight: 600,
              fontSize: Math.round(width * 0.028),
              color: brand.colors.light,
              background: `${brand.colors.dark}CC`,
              padding: '4px 12px',
              borderRadius: 6,
            }}
          >
            {panel.caption}
          </span>
        </div>
      ))}
      {label && (
        <div
          style={{
            position: 'absolute',
            top: Math.round(height * 0.04),
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: brand.fonts.heading,
            fontSize: Math.round(width * 0.04),
            color: brand.colors.accent,
            background: brand.colors.dark,
            padding: '6px 18px',
            borderRadius: 999,
          }}
        >
          {label}
        </div>
      )}
      <BrandBadge brand={brand} width={width} />
    </div>
  );
}
