import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame, spring } from 'remotion';
import { BRAND, COLORS, EASINGS, GRADIENT, RADIUS, SHADOW } from '../brand';
import { FONT_DISPLAY, FONT_BODY } from '../fonts';
import { BrandBadge, CLAMP, stripEmoji } from '../lib/kit';

// =============================================================================
// BentoGallery — Modern bento grid with mixed content cells
// Focus: Dynamic grid layout with images, solid colors, text, and icons
// Some cells have images, some are solid colors with text/icons - fully animated
// Duration: 8s | 1080x1080 (Square for social media) | 30fps
// =============================================================================
export const compositionConfig = {
  id: 'BentoGallery',
  durationInSeconds: 8,
  fps: 30,
  width: 1080,
  height: 1080
};

type BentoCell = {
  type: 'image' | 'color' | 'gradient' | 'text';
  content?: string;
  color?: string;
  position: { row: number; col: number; rowSpan: number; colSpan: number };
};

type Props = {
  imageUrl: string;
  secondaryImage?: string;
  title: string;
  subtitle?: string;
  highlight?: string;
};

const BentoGallery: React.FC<Props> = ({
  imageUrl,
  secondaryImage,
  title,
  subtitle = "Quality Furniture",
  highlight = "Premium Collection"
}) => {
  const frame = useCurrentFrame();

  // Define bento grid layout (3x3 grid with varied cell sizes)
  const bentoLayout: BentoCell[] = [
    // Large hero image cell (2x2)
    {
      type: 'image',
      content: imageUrl,
      position: { row: 0, col: 0, rowSpan: 2, colSpan: 2 }
    },
    // Highlight text cell (1x1)
    {
      type: 'gradient',
      color: GRADIENT,
      content: highlight,
      position: { row: 0, col: 2, rowSpan: 1, colSpan: 1 }
    },
    // Secondary image cell (1x1)
    {
      type: 'image',
      content: secondaryImage || imageUrl,
      position: { row: 1, col: 2, rowSpan: 1, colSpan: 1 }
    },
    // Brand color cell (1x2)
    {
      type: 'color',
      color: COLORS.accent2,
      content: BRAND.wordmark[0] + BRAND.wordmark[1] + BRAND.wordmark[2],
      position: { row: 2, col: 0, rowSpan: 1, colSpan: 2 }
    },
    // Title text cell (1x1)
    {
      type: 'text',
      content: title,
      position: { row: 2, col: 2, rowSpan: 1, colSpan: 1 }
    },
  ];

  // Cell animations - staggered entrance
  const cellSprings = bentoLayout.map((_, index) =>
    spring({
      frame: frame - (10 + index * 8),
      fps: 30,
      config: { damping: 15 + index, stiffness: 100 - index * 3 },
    })
  );

  // Content animations within cells
  const contentScales = bentoLayout.map((_, index) =>
    spring({
      frame: frame - (40 + index * 6),
      fps: 30,
      config: { damping: 18, stiffness: 110 },
    })
  );

  // Subtitle fade in
  const subtitleOp = interpolate(frame, [100, 130], [0, 1], {
    ...CLAMP,
    easing: EASINGS.easeOut
  });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.paper }}>
      {/* Main bento grid container */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridTemplateRows: 'repeat(3, 1fr)',
          gap: 8,
          padding: 16,
        }}
      >
        {bentoLayout.map((cell, index) => {
          const cellScale = cellSprings[index];
          const contentScale = contentScales[index];

          return (
            <div
              key={`${cell.position.row}-${cell.position.col}`}
              style={{
                gridRow: `${cell.position.row + 1} / span ${cell.position.rowSpan}`,
                gridColumn: `${cell.position.col + 1} / span ${cell.position.colSpan}`,
                position: 'relative',
                transform: `scale(${cellScale})`,
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

                  {/* Gradient overlay for depth */}
                  <AbsoluteFill style={{
                    background: 'linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.2) 100%)',
                  }} />
                </div>
              )}

              {cell.type === 'color' && (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    backgroundColor: cell.color,
                    borderRadius: RADIUS.panel,
                    boxShadow: SHADOW.soft,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 20,
                    transform: `scale(${contentScale})`,
                  }}
                >
                  <div style={{
                    fontFamily: FONT_DISPLAY,
                    fontSize: (cell.content?.length ?? 0) > 15 ? 24 : 32,
                    fontWeight: 700,
                    color: '#fff',
                    textAlign: 'center',
                    textShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  }}>
                    {stripEmoji(String(cell.content))}
                  </div>
                </div>
              )}

              {cell.type === 'gradient' && (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    background: cell.color || GRADIENT,
                    borderRadius: RADIUS.panel,
                    boxShadow: SHADOW.soft,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 16,
                    transform: `scale(${contentScale})`,
                  }}
                >
                  <div style={{
                    fontFamily: FONT_BODY,
                    fontSize: (cell.content?.length ?? 0) > 20 ? 18 : 24,
                    fontWeight: 600,
                    color: '#fff',
                    textAlign: 'center',
                    letterSpacing: 0.5,
                    textShadow: '0 2px 8px rgba(0,0,0,0.4)',
                    lineHeight: 1.2,
                  }}>
                    {stripEmoji(String(cell.content))}
                  </div>
                </div>
              )}

              {cell.type === 'text' && (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    backgroundColor: COLORS.paper,
                    borderRadius: RADIUS.panel,
                    boxShadow: SHADOW.soft,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 16,
                    transform: `scale(${contentScale})`,
                    border: `2px solid ${COLORS.accent}`,
                  }}
                >
                  <div style={{
                    fontFamily: FONT_DISPLAY,
                    fontSize: (cell.content?.length ?? 0) > 15 ? 20 : 28,
                    fontWeight: 700,
                    color: COLORS.ink,
                    textAlign: 'center',
                    lineHeight: 1.1,
                    letterSpacing: -0.5,
                  }}>
                    {stripEmoji(String(cell.content))}
                  </div>
                </div>
              )}

              {/* Decorative corner accent */}
              {index % 3 === 0 && (
                <div style={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  width: 20,
                  height: 20,
                  borderTop: `2px solid ${COLORS.accent}`,
                  borderLeft: `2px solid ${COLORS.accent}`,
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Subtitle overlay */}
      <AbsoluteFill
        style={{
          alignItems: 'flex-end',
          justifyContent: 'center',
          padding: 60,
          pointerEvents: 'none',
        }}
      >
        <div style={{ opacity: subtitleOp }}>
          <div style={{
            padding: '16px 32px',
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            borderRadius: RADIUS.pill,
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            border: `2px solid ${COLORS.accent}`,
          }}>
            <div style={{
              fontFamily: FONT_BODY,
              fontSize: 24,
              fontWeight: 600,
              color: COLORS.accent2,
              letterSpacing: 1,
              textAlign: 'center',
            }}>
              {subtitle}
            </div>
          </div>
        </div>
      </AbsoluteFill>

      {/* Brand signature */}
      <AbsoluteFill
        style={{
          alignItems: 'flex-start',
          justifyContent: 'flex-end',
          padding: 60,
          opacity: 0.4,
        }}
      >
        <div style={{
          fontFamily: FONT_BODY,
          fontSize: 14,
          color: COLORS.muted,
          letterSpacing: 1,
        }}>
          {BRAND.signoff}
        </div>
      </AbsoluteFill>

      <BrandBadge width={1080} />
    </AbsoluteFill>
  );
};

export default BentoGallery;