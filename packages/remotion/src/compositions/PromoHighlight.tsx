import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame, spring } from 'remotion';
import { BRAND, COLORS, EASINGS, GRADIENT, RADIUS, SHADOW } from '../brand';
import { FONT_DISPLAY, FONT_BODY } from '../fonts';
import { BrandBadge, CLAMP, stripEmoji, MusicBed } from '../lib/kit';

// =============================================================================
// PromoHighlight — Bold headline with badge and circular frame elements
// Inspired by the sample posts: Bold Headline, Exclusive + Save Badge,
// Light Circle Frame, Sweet Dreams. Square format for Instagram/Facebook.
// Duration: 8s | 1080x1080 | 30fps
// =============================================================================
export const compositionConfig = {
  id: 'PromoHighlight',
  durationInSeconds: 8,
  fps: 30,
  width: 1080,
  height: 1080
};

type Props = {
  imageUrl: string;
  headline: string;
  subline?: string;
  badgeText?: string;
  offerPrice?: string;
};

const PromoHighlight: React.FC<Props> = ({
  imageUrl,
  headline,
  subline = "Limited Edition",
  badgeText = "EXCLUSIVE",
  offerPrice
}) => {
  const frame = useCurrentFrame();

  // Bold headline entrance with overshoot
  const headlineScale = spring({
    frame: frame - 10,
    fps: 30,
    config: { damping: 12, stiffness: 130 },
  });

  const headlineOp = interpolate(frame, [10, 25], [0, 1], {
    ...CLAMP,
    easing: EASINGS.overshoot
  });

  const headlineY = interpolate(frame, [10, 28], [40, 0], {
    ...CLAMP,
    easing: EASINGS.overshoot
  });

  // Circular frame expansion
  const circleScale = spring({
    frame: frame - 20,
    fps: 30,
    config: { damping: 15, stiffness: 100 },
  });

  const circleOp = interpolate(frame, [20, 40], [0, 0.6], {
    ...CLAMP,
    easing: EASINGS.easeOut
  });

  // Badge slide-in from top-right
  const badgeX = interpolate(frame, [30, 50], [100, 0], {
    ...CLAMP,
    easing: EASINGS.easeOut
  });

  const badgeOp = interpolate(frame, [30, 45], [0, 1], {
    ...CLAMP,
    easing: EASINGS.overshoot
  });

  // Subline and price reveal
  const sublineOp = interpolate(frame, [55, 70], [0, 1], {
    ...CLAMP,
    easing: EASINGS.overshoot
  });

  const priceScale = spring({
    frame: frame - 75,
    fps: 30,
    config: { damping: 14, stiffness: 120 },
  });

  const priceOp = interpolate(frame, [75, 90], [0, 1], {
    ...CLAMP,
    easing: EASINGS.overshoot
  });

  // Gentle floating for the main image
  const floatY = Math.sin(frame * 0.03) * 6;
  const floatRot = Math.sin(frame * 0.02) * 0.5;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.paper }}>
      <MusicBed trackId="ShowcaseCard" />

      {/* Circular light frame effect */}
      <AbsoluteFill style={{
        alignItems: 'center',
        justifyContent: 'center',
        opacity: circleOp,
      }}>
        <div style={{
          width: '80%',
          height: '80%',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(201, 162, 39, 0.15) 0%, transparent 70%)',
          transform: `scale(${circleScale})`,
        }} />
      </AbsoluteFill>

      {/* Main product image with glassmorphism card */}
      <AbsoluteFill style={{
        alignItems: 'center',
        justifyContent: 'center',
        padding: 60,
      }}>
        <div
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 700,
            aspectRatio: 1,
            transform: `translateY(${floatY}px) rotate(${floatRot}deg)`,
            transformOrigin: 'center',
          }}
        >
          {/* Glass card */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(12px)',
            borderRadius: RADIUS.popup,
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: SHADOW.popup,
          }} />

          {/* Image */}
          <div style={{
            position: 'absolute',
            inset: 20,
            borderRadius: RADIUS.panel,
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          }}>
            <AbsoluteFill style={{ transform: `scale(${headlineScale})` }}>
              <Img
                src={imageUrl}
                maxRetries={3}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            </AbsoluteFill>

            {/* Gradient overlay */}
            <AbsoluteFill style={{
              background: 'linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.4) 100%)',
            }} />
          </div>
        </div>
      </AbsoluteFill>

      {/* Bold headline overlay */}
      <AbsoluteFill style={{
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: 60,
      }}>
        <div
          style={{
            opacity: headlineOp,
            transform: `translateY(${headlineY}px) scale(${headlineScale})`,
          }}
        >
          <div style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 72,
            fontWeight: 800,
            color: COLORS.forest,
            textAlign: 'center',
            lineHeight: 1.1,
            letterSpacing: -1.5,
            textShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}>
            {stripEmoji(headline)}
          </div>
        </div>
      </AbsoluteFill>

      {/* Badge (top-right) */}
      <AbsoluteFill style={{
        alignItems: 'flex-start',
        justifyContent: 'flex-end',
        padding: 60,
      }}>
        <div
          style={{
            opacity: badgeOp,
            transform: `translateX(${badgeX}px)`,
          }}
        >
          <div style={{
            background: COLORS.offer,
            color: '#fff',
            fontFamily: FONT_BODY,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: 1.2,
            padding: '12px 24px',
            borderRadius: RADIUS.popup,
            boxShadow: SHADOW.popup,
            textTransform: 'uppercase',
          }}>
            {badgeText}
          </div>
        </div>
      </AbsoluteFill>

      {/* Subline and offer price */}
      <AbsoluteFill style={{
        alignItems: 'flex-end',
        justifyContent: 'flex-end',
        padding: 80,
      }}>
        <div
          style={{
            opacity: sublineOp,
            transform: `translateY(-${Math.max(0, frame - 55) * 0.5}px)`,
          }}
        >
          <div style={{
            fontFamily: FONT_BODY,
            fontSize: 24,
            fontWeight: 600,
            color: COLORS.accent,
            letterSpacing: 0.5,
            textShadow: '0 1px 4px rgba(0,0,0,0.3)',
            marginBottom: 12,
          }}>
            {subline}
          </div>
        </div>

        {offerPrice && (
          <div
            style={{
              opacity: priceOp,
              transform: `scale(${priceScale})`,
            }}
          >
            <div style={{
              padding: '16px 32px',
              background: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(12px)',
              borderRadius: RADIUS.popup,
              boxShadow: SHADOW.popup,
              border: `3px solid ${COLORS.offer}`,
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
                {stripEmoji(offerPrice)}
              </div>
            </div>
          </div>
        )}
      </AbsoluteFill>

      <BrandBadge width={1080} />
    </AbsoluteFill>
  );
};

export default PromoHighlight;
