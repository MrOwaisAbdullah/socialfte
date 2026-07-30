import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame, spring } from 'remotion';
import { BRAND, COLORS, EASINGS, GRADIENT, RADIUS, SHADOW } from '../brand';
import { FONT_DISPLAY, FONT_BODY } from '../fonts';
import { BrandBadge, CLAMP, stripEmoji, MusicBed } from '../lib/kit';

// =============================================================================
// BentoReel — Vertical bento grid for video reels with animated cells
// Focus: Instagram Reels/Shorts format with mixed content cells, large text, multiple images
// Duration: 12s | 1080x1920 (Portrait for reels) | 30fps
// =============================================================================
export const compositionConfig = {
  id: 'BentoReel',
  durationInSeconds: 12,
  fps: 30,
  width: 1080,
  height: 1920
};

type BentoCell = {
  type: 'image' | 'color' | 'gradient' | 'text' | 'icon';
  content?: string;
  color?: string;
  icon?: string;
  position: { row: number; col: number; rowSpan: number; colSpan: number };
};

type Props = {
  imageUrl: string;
  secondaryImage?: string;
  thirdImage?: string;
  productName: string;
  price?: string;
  tagline?: string;
  fourthImage?: string;
  fifthImage?: string;
};

const BentoReel: React.FC<Props> = ({
  imageUrl,
  secondaryImage,
  thirdImage,
  fourthImage,
  fifthImage,
  productName,
  price,
  tagline = "Premium Quality"
}) => {
  const frame = useCurrentFrame();

  // Define enhanced vertical bento grid layout — content in upper rows 0-3,
  // reserve bottom area for social media native UI (caption, like/comment icons).
  // Uses 5 rows with most content in rows 0-3, minimal content in row 4 (bottom-safe).
  const bentoLayout: BentoCell[] = [
    // Large hero image cell (2x2) - top left, rows 0-1
    {
      type: 'image',
      content: imageUrl,
      position: { row: 0, col: 0, rowSpan: 2, colSpan: 2 }
    },
    // Large gradient tagline cell (1x1) - top right, row 0
    {
      type: 'gradient',
      content: tagline,
      position: { row: 0, col: 2, rowSpan: 1, colSpan: 1 }
    },
    // Secondary image cell (1x1) - upper middle right, row 1
    {
      type: 'image',
      content: secondaryImage || imageUrl,
      position: { row: 1, col: 2, rowSpan: 1, colSpan: 1 }
    },
    // Product name cell (1x2) - large text below hero, row 2
    {
      type: 'text',
      content: productName,
      position: { row: 2, col: 0, rowSpan: 1, colSpan: 2 }
    },
    // Info cell (1x1) - middle row 2, col 2
    {
      type: 'color',
      color: COLORS.accent,
      content: 'NEW',
      position: { row: 2, col: 2, rowSpan: 1, colSpan: 1 }
    },
    // Brand cell (1x1) - row 2, col 3
    {
      type: 'color',
      color: COLORS.accent2,
      content: BRAND.wordmark[0] + '\n' + BRAND.wordmark[1],
      position: { row: 2, col: 3, rowSpan: 1, colSpan: 1 }
    },
    // Third image cell (1x2) - middle section, row 3
    {
      type: 'image',
      content: thirdImage || secondaryImage || imageUrl,
      position: { row: 3, col: 0, rowSpan: 1, colSpan: 2 }
    },
    // Fourth image cell (1x1) - row 3, col 2
    {
      type: 'image',
      content: fourthImage || thirdImage || imageUrl,
      position: { row: 3, col: 2, rowSpan: 1, colSpan: 1 }
    },
    // Fifth image cell (1x1) - row 3, col 3
    {
      type: 'image',
      content: fifthImage || fourthImage || imageUrl,
      position: { row: 3, col: 3, rowSpan: 1, colSpan: 1 }
    },
    // Price cell (1x4) - row 4 (bottom-safe, avoids social UI), full width
    {
      type: 'gradient',
      content: price || '★',
      position: { row: 4, col: 0, rowSpan: 1, colSpan: 4 }
    },
  ];

  // Cell animations - staggered entrance
  const cellSprings = bentoLayout.map((_, index) =>
    spring({
      frame: frame - (15 + index * 10),
      fps: 30,
      config: { damping: 14 + index * 2, stiffness: 95 - index * 2 },
    })
  );

  // Content animations within cells
  const contentScales = bentoLayout.map((_, index) =>
    spring({
      frame: frame - (60 + index * 8),
      fps: 30,
      config: { damping: 16, stiffness: 105 },
    })
  );

  // Price reveal animation
  const priceScale = spring({
    frame: frame - 140,
    fps: 30,
    config: { damping: 15, stiffness: 120 },
  });

  const priceOp = interpolate(frame, [140, 160], [0, 1], {
    ...CLAMP,
    easing: EASINGS.overshoot
  });

  // Final brand reveal
  const brandOp = interpolate(frame, [200, 220], [0, 1], {
    ...CLAMP,
    easing: EASINGS.easeOut
  });

  // Floating animation for image cells — extended across full duration
  // Use slow sine waves that complete ~1.5 cycles over 360 frames (12s)
  const floatY = Math.sin(frame * 0.04) * 6 + Math.sin(frame * 0.015) * 4;
  const floatRot = Math.sin(frame * 0.025) * 0.5 + Math.cos(frame * 0.018) * 0.3;

  // Late-stage accent sweep — subtle color pulse on non-image cells around frame 240-300
  const accentPulse = interpolate(frame, [240, 270, 300], [0, 1, 0], {
    ...CLAMP,
    easing: EASINGS.easeInOut,
  });

  // Extended gentle zoom-out effect on the whole grid for depth
  const gridScale = interpolate(frame, [200, 360], [1, 0.98], {
    ...CLAMP,
    easing: EASINGS.easeOut,
  });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.paper }}>
      <MusicBed trackId="BentoReel" />
      {/* Main bento grid container - enhanced for 4x3 grid */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gridTemplateRows: 'repeat(5, 1fr)',
          gap: 8,
          padding: 16,
          transform: `scale(${gridScale})`,
        }}
      >
        {bentoLayout.map((cell, index) => {
          const cellScale = cellSprings[index];
          const contentScale = contentScales[index];
          const isImageCell = cell.type === 'image';

          return (
            <div
              key={`${cell.position.row}-${cell.position.col}`}
              style={{
                gridRow: `${cell.position.row + 1} / span ${cell.position.rowSpan}`,
                gridColumn: `${cell.position.col + 1} / span ${cell.position.colSpan}`,
                position: 'relative',
                transform: `scale(${cellScale}) ${isImageCell ? `translateY(${floatY}px) rotate(${floatRot}deg)` : ''}`,
                transformOrigin: 'center',
              }}
            >
              {/* Cell content */}
              {cell.type === 'image' && (
                <div style={{
                  position: 'relative',
                  width: '100%',
                  height: '100%',
                  borderRadius: RADIUS.panel,
                  overflow: 'hidden',
                  boxShadow: SHADOW.card,
                }}>
                  <AbsoluteFill style={{ transform: `scale(${contentScale})` }}>
                    <Img
                      src={cell.content || ''}
                      maxRetries={3}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </AbsoluteFill>

                  {/* Enhanced gradient overlay */}
                  <AbsoluteFill style={{
                    background: 'linear-gradient(135deg, transparent 40%, rgba(0,0,0,0.3) 100%)',
                  }} />

                  {/* Shine effect */}
                  <AbsoluteFill style={{
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 50%)',
                    opacity: 0.3 + Math.sin(frame * 0.05 + index) * 0.1,
                  }} />
                </div>
              )}

              {cell.type === 'color' && (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    backgroundColor: cell.color,
                    borderRadius: RADIUS.popup,
                    boxShadow: SHADOW.popup,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 16,
                    transform: `scale(${contentScale})`,
                  }}
                >
                  <div style={{
                    fontFamily: FONT_DISPLAY,
                    fontSize: (cell.content?.length ?? 0) > 12 ? 20 : 28,
                    fontWeight: 700,
                    color: '#fff',
                    textAlign: 'center',
                    textShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    lineHeight: 1.1,
                  }}>
                    {stripEmoji(String(cell.content))}
                  </div>
                  {/* Late-stage accent pulse overlay */}
                  {accentPulse > 0 && (
                    <AbsoluteFill style={{
                      background: `rgba(201, 162, 39, ${accentPulse * 0.15})`,
                      borderRadius: RADIUS.popup,
                      pointerEvents: 'none',
                    }} />
                  )}
                </div>
              )}

              {cell.type === 'gradient' && (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    background: cell.color || GRADIENT,
                    borderRadius: RADIUS.popup,
                    boxShadow: SHADOW.popup,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 12,
                    transform: `scale(${contentScale})`,
                  }}
                >
                  <div style={{
                    fontFamily: FONT_BODY,
                    fontSize: (cell.content?.length ?? 0) > 15 ? 16 : 22,
                    fontWeight: 700,
                    color: '#fff',
                    textAlign: 'center',
                    letterSpacing: 0.8,
                    textShadow: '0 2px 8px rgba(0,0,0,0.4)',
                    lineHeight: 1.2,
                  }}>
                    {stripEmoji(String(cell.content))}
                  </div>
                  {/* Late-stage accent pulse overlay */}
                  {accentPulse > 0 && (
                    <AbsoluteFill style={{
                      background: `rgba(201, 162, 39, ${accentPulse * 0.15})`,
                      borderRadius: RADIUS.popup,
                      pointerEvents: 'none',
                    }} />
                  )}
                </div>
              )}

              {cell.type === 'text' && (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    backgroundColor: '#fff',
                    borderRadius: RADIUS.popup,
                    boxShadow: SHADOW.popup,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 12,
                    transform: `scale(${contentScale})`,
                    border: `3px solid ${COLORS.offer}`,
                  }}
                >
                  <div style={{
                    fontFamily: FONT_DISPLAY,
                    fontSize: (cell.content?.length ?? 0) > 12 ? 36 : 52,
                    fontWeight: 800,
                    color: COLORS.ink,
                    textAlign: 'center',
                    lineHeight: 1.1,
                    letterSpacing: -1,
                    textShadow: '0 2px 8px rgba(0,0,0,0.2)',
                  }}>
                    {stripEmoji(String(cell.content))}
                  </div>
                  {/* Late-stage accent pulse overlay */}
                  {accentPulse > 0 && (
                    <AbsoluteFill style={{
                      background: `rgba(201, 162, 39, ${accentPulse * 0.12})`,
                      borderRadius: RADIUS.popup,
                      pointerEvents: 'none',
                    }} />
                  )}
                </div>
              )}

              {/* Decorative elements */}
              {index % 4 === 0 && (
                <div style={{
                  position: 'absolute',
                  top: 6,
                  left: 6,
                  width: 16,
                  height: 16,
                  borderTop: `3px solid ${COLORS.accent}`,
                  borderLeft: `3px solid ${COLORS.accent}`,
                }} />
              )}

              {index % 4 === 2 && (
                <div style={{
                  position: 'absolute',
                  bottom: 6,
                  right: 6,
                  width: 16,
                  height: 16,
                  borderBottom: `3px solid ${COLORS.accent}`,
                  borderRight: `3px solid ${COLORS.accent}`,
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Price reveal overlay */}
      {price && (
        <AbsoluteFill
          style={{
            alignItems: 'flex-end',
            justifyContent: 'flex-end',
            padding: 80,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              transform: `scale(${priceScale})`,
              opacity: priceOp,
            }}
          >
            <div style={{
              padding: '20px 40px',
              background: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(12px)',
              borderRadius: RADIUS.card,
              boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
              border: `3px solid ${COLORS.accent}`,
            }}>
              <div style={{
                fontFamily: FONT_DISPLAY,
                fontSize: 48,
                fontWeight: 800,
                background: GRADIENT,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                letterSpacing: -1,
              }}>
                {stripEmoji(String(price))}
              </div>
            </div>
          </div>
        </AbsoluteFill>
      )}

      {/* Brand reveal */}
      <AbsoluteFill
        style={{
          alignItems: 'flex-start',
          justifyContent: 'flex-end',
          padding: 60,
          opacity: brandOp,
          pointerEvents: 'none',
        }}
      >
        <div style={{
          fontFamily: FONT_BODY,
          fontSize: 18,
          color: COLORS.ink,
          textAlign: 'right',
          opacity: 0.7,
        }}>
          <div style={{ marginBottom: 8 }}>
            {BRAND.wordmark[0]}
            <span style={{ color: COLORS.accent }}>{BRAND.wordmark[1]}</span>
            {BRAND.wordmark[2]}
          </div>
          <div style={{ fontSize: 14, color: COLORS.muted }}>
            {BRAND.signoff}
          </div>
        </div>
      </AbsoluteFill>

      <BrandBadge width={1080} />
    </AbsoluteFill>
  );
};

export default BentoReel;