import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame, spring } from 'remotion';
import { BRAND, COLORS, EASINGS, GRADIENT, RADIUS, SHADOW } from '../brand';
import { FONT_DISPLAY, FONT_BODY } from '../fonts';
import { BrandBadge, CLAMP } from '../lib/kit';

// =============================================================================
// DynamicGrid — Modern grid layout with animated cells
// Focus: Product showcase with dynamic cell reveals and smooth transitions
// Duration: 6s | 1080x1920 | 30fps
// =============================================================================
export const compositionConfig = {
  id: 'DynamicGrid',
  durationInSeconds: 6,
  fps: 30,
  width: 1080,
  height: 1920
};

type Props = {
  imageUrl: string;
  productName: string;
  description?: string;
  ctaText?: string;
};

const DynamicGrid: React.FC<Props> = ({
  imageUrl,
  productName,
  description = "Crafted for comfort, built to last",
  ctaText = "Shop Now"
}) => {
  const frame = useCurrentFrame();

  // Dynamic grid cell animations
  const cell1Spring = spring({
    frame: frame - 10,
    fps: 30,
    config: { damping: 15, stiffness: 90 },
  });

  const cell2Spring = spring({
    frame: frame - 20,
    fps: 30,
    config: { damping: 12, stiffness: 85 },
  });

  const cell3Spring = spring({
    frame: frame - 30,
    fps: 30,
    config: { damping: 18, stiffness: 95 },
  });

  // Content reveal
  const titleScale = spring({
    frame: frame - 40,
    fps: 30,
    config: { damping: 14, stiffness: 120 },
  });

  const titleOp = interpolate(frame, [50, 70], [0, 1], {
    ...CLAMP,
    easing: EASINGS.easeOutBack
  });

  const descOp = interpolate(frame, [70, 90], [0, 1], {
    ...CLAMP,
    easing: EASINGS.easeOut
  });

  const ctaScale = spring({
    frame: frame - 100,
    fps: 30,
    config: { damping: 16, stiffness: 140 },
  });

  const ctaOp = interpolate(frame, [100, 120], [0, 1], {
    ...CLAMP,
    easing: EASINGS.easeOutBack
  });

  return (
    <AbsoluteFill style={{
      backgroundColor: COLORS.paper,
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      {/* Animated grid cells */}
      <AbsoluteFill style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: 'repeat(3, 1fr)',
        gap: 2,
        padding: 20,
      }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((cell, index) => {
          const spring = [cell1Spring, cell2Spring, cell3Spring][index % 3];
          const delay = index * 3;

          return (
            <div
              key={cell}
              style={{
                position: 'relative',
                backgroundColor: index % 2 === 0 ? COLORS.accent2 : COLORS.accent,
                opacity: 0.1 + (index * 0.05),
                transform: `scale(${spring * 0.15})`,
                transitionDelay: `${delay}ms`,
              }}
            />
          );
        })}
      </AbsoluteFill>

      {/* Main content card */}
      <AbsoluteFill style={{
        justifyContent: 'center',
        alignItems: 'center',
        padding: 60,
      }}>
        <div
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 900,
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: RADIUS.card,
            boxShadow: SHADOW.card,
            padding: 40,
            backdropFilter: 'blur(10px)',
            border: `2px solid ${COLORS.accent}`,
          }}
        >
          {/* Product image */}
          <div style={{
            position: 'relative',
            width: '100%',
            aspectRatio: 16/9,
            borderRadius: RADIUS.panel,
            overflow: 'hidden',
            marginBottom: 32,
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          }}>
            <Img
              src={imageUrl}
              maxRetries={3}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: `scale(${1 + cell1Spring * 0.05})`,
              }}
            />

            {/* Overlay gradient */}
            <AbsoluteFill style={{
              background: 'linear-gradient(to top, rgba(0,0,0,0.3) 0%, transparent 50%)',
            }} />
          </div>

          {/* Product name */}
          <div
            style={{
              textAlign: 'center',
              transform: `scale(${titleScale})`,
              opacity: titleOp,
              marginBottom: 16,
            }}
          >
            <div style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 64,
              fontWeight: 700,
              color: COLORS.ink,
              lineHeight: 1.1,
              letterSpacing: -1,
            }}>
              {productName}
            </div>
          </div>

          {/* Description */}
          <div
            style={{
              textAlign: 'center',
              opacity: descOp,
              marginBottom: 32,
            }}
          >
            <div style={{
              fontFamily: FONT_BODY,
              fontSize: 28,
              fontWeight: 400,
              color: COLORS.muted,
              lineHeight: 1.4,
              maxWidth: 700,
              margin: '0 auto',
            }}>
              {description}
            </div>
          </div>

          {/* CTA Button */}
          <div
            style={{
              textAlign: 'center',
              transform: `scale(${ctaScale})`,
              opacity: ctaOp,
            }}
          >
            <div style={{
              display: 'inline-block',
              padding: '20px 48px',
              background: GRADIENT,
              borderRadius: RADIUS.pill,
              boxShadow: '0 8px 24px rgba(201, 162, 39, 0.3)',
              border: '2px solid transparent',
              transition: 'all 0.2s ease',
            }}>
              <div style={{
                fontFamily: FONT_BODY,
                fontSize: 28,
                fontWeight: 600,
                color: '#fff',
                letterSpacing: 0.5,
                textTransform: 'uppercase',
              }}>
                {ctaText}
              </div>
            </div>
          </div>
        </div>
      </AbsoluteFill>

      {/* Brand badge */}
      <AbsoluteFill style={{
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: 60,
      }}>
        <div style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 20,
          color: COLORS.ink,
          textAlign: 'center',
          opacity: 0.6,
        }}>
          {BRAND.wordmark[0]}
          <span style={{ color: COLORS.accent }}>{BRAND.wordmark[1]}</span>
          {BRAND.wordmark[2]}
        </div>
      </AbsoluteFill>

      <BrandBadge width={1080} />
    </AbsoluteFill>
  );
};

export default DynamicGrid;