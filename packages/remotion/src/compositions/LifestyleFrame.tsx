import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame, spring } from 'remotion';
import { BRAND, COLORS, EASINGS, GRADIENT, RADIUS, SHADOW } from '../brand';
import { FONT_DISPLAY, FONT_BODY } from '../fonts';
import { BrandBadge, CLAMP } from '../lib/kit';

// =============================================================================
// LifestyleFrame — Warm, lifestyle-focused template with room context
// Focus: Natural room setting with ambient lighting and homey feel
// Duration: 6s | 1080x1080 (Square) | 30fps
// =============================================================================
export const compositionConfig = {
  id: 'LifestyleFrame',
  durationInSeconds: 6,
  fps: 30,
  width: 1080,
  height: 1080
};

type Props = {
  imageUrl: string;
  roomName?: string;
  feeling?: string;
  productTag?: string;
};

const LifestyleFrame: React.FC<Props> = ({
  imageUrl,
  roomName = "Your Space",
  feeling = "Warm & Inviting",
  productTag
}) => {
  const frame = useCurrentFrame();

  // Ambient light animation
  const lightRotate = interpolate(frame, [0, 180], [0, 360], {
    ...CLAMP,
    easing: EASINGS.easeInOut
  });

  const lightIntensity = 0.3 + Math.sin(frame * 0.05) * 0.1;

  // Photo frame reveal
  const frameSpring = spring({
    frame: frame - 15,
    fps: 30,
    config: { damping: 16, stiffness: 75 },
  });

  // Content entrance
  const roomNameSlide = spring({
    frame: frame - 40,
    fps: 30,
    config: { damping: 14, stiffness: 85 },
  });

  const feelingFade = interpolate(frame, [60, 85], [0, 1], {
    ...CLAMP,
    easing: EASINGS.easeOut
  });

  const tagSpring = spring({
    frame: frame - 90,
    fps: 30,
    config: { damping: 18, stiffness: 95 },
  });

  // Subtle movement
  const floatY = Math.sin(frame * 0.02) * 4;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.paper }}>
      {/* Room background with ambient light effect */}
      <AbsoluteFill style={{
        background: `radial-gradient(circle at 30% 40%, rgba(201, 162, 39, ${lightIntensity}) 0%, transparent 50%)`,
        transform: `rotate(${lightRotate}deg)`,
      }} />

      {/* Photo frame */}
      <AbsoluteFill style={{
        justifyContent: 'center',
        alignItems: 'center',
        padding: 80,
      }}>
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            transform: `scale(${frameSpring}) translateY(${floatY}px)`,
          }}
        >
          {/* Frame border */}
          <div style={{
            position: 'absolute',
            inset: 0,
            border: `12px solid ${COLORS.ink}`,
            borderRadius: 8,
            boxShadow: SHADOW.card,
            backgroundColor: '#fff',
          }} />

          {/* Image */}
          <AbsoluteFill style={{ margin: 16 }}>
            <Img
              src={imageUrl}
              maxRetries={3}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />

            {/* Warm overlay */}
            <AbsoluteFill style={{
              background: 'linear-gradient(to bottom, transparent 40%, rgba(245,240,232,0.2) 100%)',
            }} />
          </AbsoluteFill>

          {/* Corner decorations */}
          <div style={{
            position: 'absolute',
            top: 24,
            left: 24,
            right: 24,
            height: 2,
            background: COLORS.accent,
            opacity: 0.8,
          }} />
          <div style={{
            position: 'absolute',
            bottom: 24,
            left: 24,
            right: 24,
            height: 2,
            background: COLORS.accent,
            opacity: 0.8,
          }} />
        </div>
      </AbsoluteFill>

      {/* Room name */}
      <AbsoluteFill
        style={{
          alignItems: 'flex-start',
          justifyContent: 'flex-start',
          padding: 60,
        }}
      >
        <div
          style={{
            transform: `translateX(${-roomNameSlide * 30}px)`,
            opacity: roomNameSlide,
          }}
        >
          <div style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 48,
            fontWeight: 700,
            color: COLORS.ink,
            marginBottom: 12,
          }}>
            {roomName}
          </div>
        </div>
      </AbsoluteFill>

      {/* Feeling tag */}
      <AbsoluteFill
        style={{
          alignItems: 'flex-start',
          justifyContent: 'flex-start',
          padding: 60,
          paddingTop: 140,
        }}
      >
        <div style={{ opacity: feelingFade }}>
          <div
            style={{
              padding: '8px 20px',
              background: 'rgba(201, 162, 39, 0.15)',
              border: `1px solid ${COLORS.accent}`,
              borderRadius: RADIUS.pill,
              display: 'inline-block',
            }}
          >
            <div style={{
              fontFamily: FONT_BODY,
              fontSize: 20,
              fontWeight: 500,
              color: COLORS.accent2,
              letterSpacing: 0.5,
            }}>
              {feeling}
            </div>
          </div>
        </div>
      </AbsoluteFill>

      {/* Product tag */}
      {productTag && (
        <AbsoluteFill
          style={{
            alignItems: 'flex-end',
            justifyContent: 'flex-end',
            padding: 60,
          }}
        >
          <div
            style={{
              transform: `scale(${tagSpring})`,
              opacity: tagSpring,
            }}
          >
            <div style={{
              padding: '12px 24px',
              background: GRADIENT,
              borderRadius: RADIUS.pill,
              boxShadow: '0 4px 16px rgba(201, 162, 39, 0.3)',
            }}>
              <div style={{
                fontFamily: FONT_BODY,
                fontSize: 18,
                fontWeight: 600,
                color: '#fff',
                letterSpacing: 0.5,
                textTransform: 'uppercase',
              }}>
                {productTag}
              </div>
            </div>
          </div>
        </AbsoluteFill>
      )}

      {/* Brand signature */}
      <AbsoluteFill
        style={{
          alignItems: 'flex-end',
          justifyContent: 'flex-end',
          padding: 60,
          paddingBottom: 80,
          opacity: 0.5,
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

export default LifestyleFrame;