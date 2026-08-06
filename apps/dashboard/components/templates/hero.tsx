import { resolveAspect, type Aspect, type BrandTokens } from './aspect';
import BrandBadge from './brand-badge';
import { stripEmoji } from './lib';

export type HeroProps = {
  imageUrl: string;
  headline: string;
  highlightWord?: string;
  price?: string;
  ctaLabel?: string;
};

// Full-bleed background image, bottom-left-to-transparent gradient scrim,
// Instrument Serif headline with the highlight word set in a solid
// brand.colors.secondary (crimson) box — matches Sample-posts/post-popup.png's
// "Furniture your [dulhan] deserves." treatment exactly, a highlighter-style
// box behind one emphasized word rather than plain color/italic contrast.
// Archivo body, WhatsApp CTA in brand.colors.primary with
// brand.colors.accent text.
export default function Hero({
  imageUrl,
  headline,
  highlightWord,
  price,
  ctaLabel = 'WhatsApp for details',
  aspect = 'square',
  brand,
}: HeroProps & { aspect?: Aspect; brand: BrandTokens }) {
  const { width, height } = resolveAspect(aspect);
  const cleanHeadline = stripEmoji(headline);
  const cleanHighlightWord = highlightWord ? stripEmoji(highlightWord) : undefined;
  const parts = cleanHighlightWord ? cleanHeadline.split(cleanHighlightWord) : [cleanHeadline];

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
          background: `linear-gradient(115deg, ${brand.colors.dark}E6 0%, ${brand.colors.dark}99 35%, transparent 70%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          padding: Math.round(width * 0.06),
          paddingRight: Math.round(width * 0.25),
          maxWidth: '82%',
          display: 'flex',
          flexDirection: 'column',
          gap: Math.round(width * 0.02),
        }}
      >
        <h1
          style={{
            fontFamily: brand.fonts.heading,
            fontWeight: 700,
            fontSize: Math.round(width * 0.075),
            letterSpacing: -1,
            lineHeight: 1.08,
            color: brand.colors.light,
            margin: 0,
            textShadow: `0 2px 12px ${brand.colors.dark}88`,
          }}
        >
          {cleanHighlightWord ? (
            <>
              {parts[0]}
              <span
                style={{
                  display: 'inline-block',
                  fontStyle: 'italic',
                  fontWeight: 700,
                  color: brand.colors.light,
                  background: brand.colors.secondary,
                  padding: `0 ${Math.round(width * 0.016)}px`,
                  borderRadius: 6,
                }}
              >
                {cleanHighlightWord}
              </span>
              {parts[1]}
            </>
          ) : (
            cleanHeadline
          )}
        </h1>
        {(price || ctaLabel) && (
          // Frosted-glass info card instead of a flat price line + solid
          // pill — same glassmorphism idea as antigravity's overlay agent
          // (semi-transparent backdrop-blur panel), staying inside BRAND.md's
          // existing depth rules (soft shadow, warm hairline border, no
          // stark black) rather than introducing a new visual language.
          // backgroundColor alone (no blur) is a safe degrade for any
          // Chromium build without backdrop-filter support.
          <div
            style={{
              marginTop: Math.round(width * 0.02),
              alignSelf: 'flex-start',
              display: 'flex',
              flexDirection: 'column',
              gap: Math.round(width * 0.012),
              padding: `${Math.round(width * 0.022)}px ${Math.round(width * 0.03)}px`,
              borderRadius: 18,
              background: `${brand.colors.light}26`,
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              border: `1px solid ${brand.colors.light}40`,
              boxShadow: `0 8px 32px ${brand.colors.dark}33`,
            }}
          >
            {price && (
              <p
                style={{
                  fontFamily: brand.fonts.body,
                  fontSize: Math.round(width * 0.032),
                  color: brand.colors.light,
                  margin: 0,
                }}
              >
                {stripEmoji(price)}
              </p>
            )}
            {ctaLabel && (
              <span
                style={{
                  alignSelf: 'flex-start',
                  fontFamily: brand.fonts.body,
                  fontWeight: 600,
                  fontSize: Math.round(width * 0.026),
                  color: brand.colors.accent,
                  background: brand.colors.primary,
                  padding: `${Math.round(width * 0.014)}px ${Math.round(width * 0.028)}px`,
                  borderRadius: 999,
                }}
              >
                {stripEmoji(ctaLabel)}
              </span>
            )}
          </div>
        )}
      </div>
      <BrandBadge brand={brand} width={width} />
    </div>
  );
}
