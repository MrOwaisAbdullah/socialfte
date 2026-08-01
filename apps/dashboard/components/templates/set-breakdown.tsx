import { resolveAspect, type Aspect, type BrandTokens } from './aspect';
import BrandBadge from './brand-badge';
import { stripEmoji } from './lib';

export type SetBreakdownProps = {
  setName: string;
  pieces: { name: string; price: string }[];
  bundlePrice: string;
  savings?: string;
  imageUrl?: string;
};

// Ranked-bars treatment for the piece list (docs/daily-linkedin-posts-
// pipeline/skills/illustration-formats/SKILL.md's RANKED_BARS format:
// italic serif rank numeral, bold label, a proportional bar, value at
// far right, three color tiers by rank) — replaces both the earlier
// invisible glassmorphism rows (rgba(255,255,255,0.08) white glass on
// this template's light background, same issue quote.tsx had) and a
// plainer hairline-list version. Bar width is only proportional when a
// real numeric value can be parsed out of the price string — pieces
// that don't parse get an equal, honest-looking bar rather than a
// fabricated proportion. `imageUrl` stays optional: this template had no
// image slot at all before, and compose_batch.py's single-asset path
// (pieces=[], no real per-piece data) still needs something to show.
function parsePriceValue(price: string): number | null {
  const match = price.replace(/,/g, '').match(/\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

export default function SetBreakdown({
  setName,
  pieces,
  bundlePrice,
  savings,
  imageUrl,
  aspect = 'square',
  brand,
}: SetBreakdownProps & { aspect?: Aspect; brand: BrandTokens }) {
  const { width, height } = resolveAspect(aspect);
  const values = pieces.map((p) => parsePriceValue(p.price));
  const maxValue = Math.max(...values.filter((v): v is number => v !== null), 1);
  const tierColor = (i: number) =>
    i === 0 ? brand.colors.accent : i <= 2 ? `${brand.colors.accent}AA` : `${brand.colors.dark}66`;

  return (
    <div
      style={{
        width,
        height,
        position: 'relative',
        background: brand.colors.light,
        fontFamily: brand.fonts.body,
        display: 'flex',
        flexDirection: 'column',
        padding: Math.round(width * 0.07),
      }}
    >
      <h1
        style={{
          fontFamily: brand.fonts.heading,
          fontWeight: 700,
          fontSize: Math.round(width * 0.062),
          letterSpacing: -0.5,
          color: brand.colors.dark,
          margin: 0,
        }}
      >
        {stripEmoji(setName)}
      </h1>

      {imageUrl && (
        <div
          style={{
            marginTop: Math.round(width * 0.03),
            height: Math.round(height * 0.32),
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}

      <div
        style={{
          marginTop: Math.round(width * 0.045),
          display: 'flex',
          flexDirection: 'column',
          gap: Math.round(width * 0.024),
          flex: 1,
          justifyContent: 'center',
        }}
      >
        {pieces.map((piece, i) => {
          const value = values[i];
          const barPct = value !== null ? Math.max(10, (value / maxValue) * 100) : 100;
          return (
            <div key={piece.name} style={{ display: 'flex', flexDirection: 'column', gap: Math.round(width * 0.006) }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: Math.round(width * 0.014) }}>
                  <span
                    style={{
                      fontFamily: brand.fonts.heading,
                      fontStyle: 'italic',
                      fontSize: Math.round(width * 0.024),
                      color: brand.colors.muted,
                    }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: Math.round(width * 0.028), color: brand.colors.dark }}>
                    {stripEmoji(piece.name)}
                  </span>
                </span>
                <span style={{ fontWeight: 700, fontSize: Math.round(width * 0.026), color: brand.colors.dark }}>
                  {stripEmoji(piece.price)}
                </span>
              </div>
              <div style={{ height: 10, borderRadius: 999, background: `${brand.colors.muted}22` }}>
                <div
                  style={{
                    width: `${barPct}%`,
                    height: '100%',
                    borderRadius: 999,
                    background: tierColor(i),
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: Math.round(width * 0.04),
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <span style={{ display: 'block', fontSize: Math.round(width * 0.024), color: brand.colors.muted }}>
            Bundle price
          </span>
          <span
            style={{
              fontFamily: brand.fonts.heading,
              fontStyle: 'italic',
              fontSize: Math.round(width * 0.088),
              color: brand.colors.accent,
            }}
          >
            {stripEmoji(bundlePrice)}
          </span>
        </div>
        {savings && (
          <span
            style={{
              fontSize: Math.round(width * 0.024),
              fontWeight: 700,
              color: brand.colors.dark,
              background: brand.colors.accent,
              padding: `${Math.round(width * 0.012)}px ${Math.round(width * 0.02)}px`,
              borderRadius: 4,
            }}
          >
            {stripEmoji(savings)}
          </span>
        )}
      </div>
      <BrandBadge brand={brand} width={width} />
    </div>
  );
}
