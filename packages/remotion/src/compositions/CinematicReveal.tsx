import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame, spring } from 'remotion';
import { BRAND, COLORS, EASINGS, GRADIENT, RADIUS, SHADOW } from '../brand';
import { FONT_DISPLAY, FONT_BODY } from '../fonts';
import { BrandBadge, CLAMP, stripEmoji, MusicBed } from '../lib/kit';

// =============================================================================
// CinematicReveal — Film-inspired dramatic reveal with letterbox
// Focus: Premium, cinematic feel with aspect ratio reveals and smooth motion
// Duration: 7s | 1080x1920 | 30fps
// =============================================================================
export const compositionConfig = {
  id: 'CinematicReveal',
  durationInSeconds: 10,
  fps: 30,
  width: 1080,
  height: 1920
};

type Props = {
  imageUrl: string;
  title: string;
  subtitle?: string;
  tagline?: string;
};

const CinematicReveal: React.FC<Props> = ({
  imageUrl,
  title,
  subtitle = "Crafted Excellence",
  tagline
}) => {
  const frame = useCurrentFrame();

  // Letterbox reveal animation
  const letterboxOpen = spring({
    frame: frame - 15,
    fps: 30,
    config: { damping: 12, stiffness: 70 },
  });

  const letterboxClose = spring({
    frame: frame - 140,
    fps: 30,
    config: { damping: 14, stiffness: 80 },
  });

  // Image reveal with cinematic timing
  const imageScale = spring({
    frame: frame - 30,
    fps: 30,
    config: { damping: 20, stiffness: 60 },
  });

  const imageOp = interpolate(frame, [30, 60], [0, 1], {
    ...CLAMP,
    easing: EASINGS.easeInOut
  });

  // Subtle camera movement
  const camX = Math.sin(frame * 0.02) * 2;
  const camY = Math.cos(frame * 0.03) * 1.5;
  const camScale = 1 + Math.sin(frame * 0.01) * 0.03;

  // Title reveal with film timing
  const titleY = spring({
    frame: frame - 70,
    fps: 30,
    config: { damping: 18, stiffness: 100 },
  });

  const titleOp = interpolate(frame, [70, 100], [0, 1], {
    ...CLAMP,
    easing: EASINGS.overshoot
  });

  const subtitleOp = interpolate(frame, [100, 120], [0, 1], {
    ...CLAMP,
    easing: EASINGS.easeOut
  });

  const taglineOp = interpolate(frame, [120, 140], [0, 1], {
    ...CLAMP,
    easing: EASINGS.easeOut
  });

  // Letterbox height
  const letterboxHeight = 120 * (1 - Math.max(letterboxOpen, letterboxClose));

  return (
    <AbsoluteFill style={{
      backgroundColor: COLORS.d900,
    }}>
      <MusicBed trackId="CinematicReveal" />
      {/* Main image with cinematic movement */}
      <AbsoluteFill style={{
        transform: `translate(${camX}px, ${camY}px) scale(${camScale})`,
      }}>
        <AbsoluteFill style={{ opacity: imageOp }}>
          <Img
            src={imageUrl}
            maxRetries={3}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: `scale(${imageScale})`,
            }}
          />
        </AbsoluteFill>

        {/* Cinematic vignette */}
        <AbsoluteFill style={{
          background: 'radial-gradient(circle at 50% 60%, transparent 30%, rgba(0,0,0,0.6) 100%)',
        }} />
      </AbsoluteFill>

      {/* Cinematic letterbox bars */}
      <AbsoluteFill
        style={{
          top: 0,
          height: letterboxHeight,
          background: '#000',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <div style={{
          fontFamily: FONT_BODY,
          fontSize: 14,
          color: COLORS.accent,
          opacity: 0.8,
          letterSpacing: 4,
          textTransform: 'uppercase',
        }}>
          Yousuf Living Presents
        </div>
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          bottom: 0,
          height: letterboxHeight,
          background: '#000',
        }}
      />

      {/* Title reveal with cinematic timing */}
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          padding: 60,
        }}
      >
        <div
          style={{
            textAlign: 'center',
            transform: `translateY(${titleY}px)`,
          }}
        >
          <div
            style={{
              opacity: titleOp,
              fontFamily: FONT_DISPLAY,
              fontSize: 72,
              fontWeight: 700,
              color: '#fff',
              lineHeight: 1.1,
              letterSpacing: -1,
              textShadow: '0 4px 12px rgba(0,0,0,0.8)',
              marginBottom: 24,
            }}
          >
            {title}
          </div>

          {subtitle && (
            <div
              style={{
                opacity: subtitleOp,
                fontFamily: FONT_BODY,
                fontSize: 36,
                fontWeight: 500,
                color: COLORS.accent,
                letterSpacing: 1,
                textShadow: '0 2px 8px rgba(0,0,0,0.6)',
                marginBottom: 16,
              }}
            >
              {subtitle}
            </div>
          )}

          {tagline && (
            <div
              style={{
                opacity: taglineOp * 0.9,
                fontFamily: FONT_DISPLAY,
                fontSize: 24,
                fontWeight: 400,
                color: '#fff',
                letterSpacing: 2,
                textTransform: 'uppercase',
                textShadow: '0 2px 6px rgba(0,0,0,0.6)',
              }}
            >
              {stripEmoji(tagline)}
            </div>
          )}
        </div>
      </AbsoluteFill>

      {/* Film grain overlay */}
      <AbsoluteFill
        style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"%3E%3Cfilter id="noise"%3E%3CfeTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch"/%3E%3C/filter%3E%3Crect width="100%25" height="100%25" filter="url(%23noise)" opacity="0.05"/%3E%3C/svg%3E")',
          opacity: 0.3,
          pointerEvents: 'none',
        }}
      />

      {/* Brand watermark */}
      <AbsoluteFill
        style={{
          alignItems: 'flex-end',
          justifyContent: 'flex-end',
          padding: 80,
          opacity: 0.4,
        }}
      >
        <div style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 16,
          color: '#fff',
          letterSpacing: 2,
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

export default CinematicReveal;