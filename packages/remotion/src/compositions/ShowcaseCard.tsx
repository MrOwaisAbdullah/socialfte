import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame, spring } from 'remotion';
import { BRAND, COLORS, EASINGS, GRADIENT, RADIUS, SHADOW } from '../brand';
import { FONT_DISPLAY, FONT_BODY } from '../fonts';
import { BrandBadge, CLAMP, stripEmoji } from '../lib/kit';

// =============================================================================
// ShowcaseCard — Modern glassmorphism card with dynamic entrance
// Focus: Product showcase with premium feel, depth, and smooth motion
// Duration: 5s | 1080x1920 | 30fps
// =============================================================================
export const compositionConfig = {
  id: 'ShowcaseCard',
  durationInSeconds: 8,
  fps: 30,
  width: 1080,
  height: 1920
};

type Props = {
  imageUrl: string;
  productName: string;
  highlight?: string;
  price?: string;
};

const ShowcaseCard: React.FC<Props> = ({
  imageUrl,
  productName,
  highlight = "Quality You Can See",
  price
}) => {
  const frame = useCurrentFrame();

  // Staggered entrance animation with spring physics
  const cardScale = spring({
    frame: frame - 15,
    fps: 30,
    config: {
      damping: 15,
      stiffness: 100,
      mass: 1,
    },
  });

  const cardRotate = spring({
    frame: frame - 20,
    fps: 30,
    config: {
      damping: 12,
      stiffness: 80,
    },
  });

  // Image reveal with scale + opacity
  const imageScale = spring({
    frame: frame - 25,
    fps: 30,
    config: {
      damping: 20,
      stiffness: 120,
    },
  });

  const imageOp = interpolate(frame, [25, 40], [0, 1], {
    ...CLAMP,
    easing: EASINGS.easeOut
  });

  // Text entrance with stagger
  const nameScale = spring({
    frame: frame - 45,
    fps: 30,
    config: { damping: 18, stiffness: 110 },
  });

  const nameOp = interpolate(frame, [45, 60], [0, 1], {
    ...CLAMP,
    easing: EASINGS.overshoot
  });

  const highlightOp = interpolate(frame, [55, 70], [0, 1], {
    ...CLAMP,
    easing: EASINGS.overshoot
  });

  const priceScale = spring({
    frame: frame - 65,
    fps: 30,
    config: { damping: 15, stiffness: 130 },
  });

  const priceOp = interpolate(frame, [65, 80], [0, 1], {
    ...CLAMP,
    easing: EASINGS.overshoot
  });

  // Subtle floating animation
  const floatY = Math.sin(frame * 0.03) * 8;
  const floatRot = Math.sin(frame * 0.02) * 0.5;

  return (
    <AbsoluteFill style={{
      backgroundColor: COLORS.d900,
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      {/* Animated background with gradient */}
      <AbsoluteFill style={{
        background: `radial-gradient(circle at 30% 40%, ${COLORS.accent2}22 0%, transparent 50%)`,
      }} />

      {/* Main glassmorphism card */}
      <AbsoluteFill style={{
        justifyContent: 'center',
        alignItems: 'center',
        padding: 60,
      }}>
        <div
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 840,
            aspectRatio: 3/4,
            transform: `scale(${cardScale}) rotate(${cardRotate}deg) translateY(${floatY}px)`,
            transformOrigin: 'center',
          }}
        >
          {/* Glass effect background */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(20px)',
            borderRadius: RADIUS.card,
            border: `1px solid rgba(255, 255, 255, 0.15)`,
            boxShadow: SHADOW.soft,
          }} />

          {/* Product image with mask */}
          <div style={{
            position: 'absolute',
            top: 40,
            left: 40,
            right: 40,
            height: '60%',
            borderRadius: RADIUS.panel,
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            transform: `rotate(${floatRot}deg)`,
          }}>
            <AbsoluteFill style={{ transform: `scale(${imageScale})` }}>
              <Img
                src={imageUrl}
                maxRetries={3}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  opacity: imageOp,
                }}
              />
            </AbsoluteFill>

            {/* Gradient overlay for depth */}
            <AbsoluteFill style={{
              background: 'linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.4) 100%)',
            }} />
          </div>

          {/* Product name */}
          <div
            style={{
              position: 'absolute',
              bottom: price ? 140 : 100,
              left: 40,
              right: 40,
              textAlign: 'center',
              transform: `scale(${nameScale})`,
              opacity: nameOp,
            }}
          >
            <div style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 52,
              fontWeight: 700,
              color: '#fff',
              lineHeight: 1.1,
              textShadow: '0 2px 8px rgba(0,0,0,0.5)',
              letterSpacing: -0.5,
            }}>
              {stripEmoji(productName)}
            </div>
          </div>

          {/* Highlight text */}
          {highlight && (
            <div
              style={{
                position: 'absolute',
                bottom: price ? 100 : 60,
                left: 40,
                right: 40,
                textAlign: 'center',
                opacity: highlightOp,
              }}
            >
              <div style={{
                fontFamily: FONT_BODY,
                fontSize: 28,
                fontWeight: 500,
                color: COLORS.accent,
                letterSpacing: 0.3,
                textShadow: '0 1px 4px rgba(0,0,0,0.4)',
              }}>
                {highlight}
              </div>
            </div>
          )}

          {/* Price reveal */}
          {price && (
            <div
              style={{
                position: 'absolute',
                bottom: 40,
                left: 40,
                right: 40,
                textAlign: 'center',
                transform: `scale(${priceScale})`,
                opacity: priceOp,
              }}
            >
              <div style={{
                fontFamily: FONT_DISPLAY,
                fontSize: 64,
                fontWeight: 800,
                background: GRADIENT,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                letterSpacing: -1,
              }}>
                {stripEmoji(price)}
              </div>
            </div>
          )}
        </div>
      </AbsoluteFill>

      {/* Brand watermark */}
      <AbsoluteFill style={{
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: 80,
        opacity: 0.3,
      }}>
        <div style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 24,
          color: '#fff',
          textAlign: 'center',
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

export default ShowcaseCard;