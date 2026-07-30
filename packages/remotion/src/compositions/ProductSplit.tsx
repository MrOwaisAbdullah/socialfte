import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame, spring } from 'remotion';
import { BRAND, COLORS, EASINGS, GRADIENT, RADIUS, SHADOW } from '../brand';
import { FONT_DISPLAY, FONT_BODY } from '../fonts';
import { BrandBadge, CLAMP, stripEmoji } from '../lib/kit';

// =============================================================================
// ProductSplit — Split-screen layout with dynamic content balance
// Focus: Modern editorial style with image/text split layout
// Duration: 5s | 1080x1080 (Square for Instagram) | 30fps
// =============================================================================
export const compositionConfig = {
  id: 'ProductSplit',
  durationInSeconds: 8,
  fps: 30,
  width: 1080,
  height: 1080
};

type Props = {
  imageUrl: string;
  productName: string;
  highlight?: string;
  price?: string;
};

const ProductSplit: React.FC<Props> = ({
  imageUrl,
  productName,
  highlight = "Premium Quality",
  price
}) => {
  const frame = useCurrentFrame();

  // Split reveal animation
  const splitProgress = spring({
    frame: frame - 10,
    fps: 30,
    config: { damping: 14, stiffness: 85 },
  });

  // Content animations
  const imageScale = spring({
    frame: frame - 20,
    fps: 30,
    config: { damping: 16, stiffness: 90 },
  });

  const textSlide = spring({
    frame: frame - 30,
    fps: 30,
    config: { damping: 12, stiffness: 80 },
  });

  const nameScale = spring({
    frame: frame - 50,
    fps: 30,
    config: { damping: 15, stiffness: 110 },
  });

  const priceScale = spring({
    frame: frame - 70,
    fps: 30,
    config: { damping: 18, stiffness: 120 },
  });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.paper }}>
      {/* Dynamic split layout */}
      <div style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        position: 'absolute',
      }}>
        {/* Left side - Image */}
        <div
          style={{
            position: 'relative',
            width: `${50 + splitProgress * 10}%`,
            height: '100%',
            overflow: 'hidden',
          }}
        >
          <AbsoluteFill style={{ transform: `scale(${imageScale})` }}>
            <Img
              src={imageUrl}
              maxRetries={3}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </AbsoluteFill>

          {/* Gradient overlay */}
          <AbsoluteFill style={{
            background: 'linear-gradient(to right, transparent 60%, rgba(245,240,232,0.3) 100%)',
          }} />
        </div>

        {/* Right side - Content */}
        <div
          style={{
            position: 'relative',
            width: `${50 - splitProgress * 10}%`,
            height: '100%',
            backgroundColor: COLORS.paper,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 60,
          }}
        >
          <div
            style={{
              transform: `translateX(${textSlide * -20}px)`,
              textAlign: 'center',
            }}
          >
            {/* Highlight badge */}
            <div
              style={{
                padding: '12px 24px',
                background: COLORS.accent2,
                borderRadius: RADIUS.pill,
                marginBottom: 32,
                transform: `translateX(${textSlide * 50}px)`,
                opacity: textSlide,
              }}
            >
              <div style={{
                fontFamily: FONT_BODY,
                fontSize: 20,
                fontWeight: 600,
                color: '#fff',
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}>
                {highlight}
              </div>
            </div>

            {/* Product name */}
            <div
              style={{
                transform: `scale(${nameScale})`,
                marginBottom: 24,
              }}
            >
              <div style={{
                fontFamily: FONT_DISPLAY,
                fontSize: 56,
                fontWeight: 700,
                color: COLORS.ink,
                lineHeight: 1.1,
                letterSpacing: -0.5,
              }}>
                {stripEmoji(productName)}
              </div>
            </div>

            {/* Price reveal */}
            {price && (
              <div
                style={{
                  transform: `scale(${priceScale})`,
                }}
              >
                <div style={{
                  fontFamily: FONT_DISPLAY,
                  fontSize: 48,
                  fontWeight: 800,
                  background: GRADIENT,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>
                  {stripEmoji(price)}
                </div>
              </div>
            )}
          </div>

          {/* Brand signature */}
          <div style={{
            position: 'absolute',
            bottom: 40,
            left: 0,
            right: 0,
            textAlign: 'center',
            opacity: 0.6,
          }}>
            <div style={{
              fontFamily: FONT_BODY,
              fontSize: 16,
              color: COLORS.muted,
              letterSpacing: 1,
            }}>
              {BRAND.wordmark[0]}
              <span style={{ color: COLORS.accent }}>{BRAND.wordmark[1]}</span>
              {BRAND.wordmark[2]}
            </div>
          </div>
        </div>
      </div>

      {/* Decorative elements */}
      <AbsoluteFill style={{
        pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(45deg, transparent 48%, ${COLORS.accent}15 48%, ${COLORS.accent}15 52%, transparent 52%),
          linear-gradient(-45deg, transparent 48%, ${COLORS.accent2}08 48%, ${COLORS.accent2}08 52%, transparent 52%)
        `,
      }} />

      <BrandBadge width={1080} />
    </AbsoluteFill>
  );
};

export default ProductSplit;