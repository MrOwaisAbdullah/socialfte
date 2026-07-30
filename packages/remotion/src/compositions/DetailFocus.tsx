import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame, spring } from 'remotion';
import { BRAND, COLORS, EASINGS, RADIUS } from '../brand';
import { FONT_DISPLAY, FONT_BODY } from '../fonts';
import { BrandBadge, CLAMP, stripEmoji } from '../lib/kit';

export const compositionConfig = {
  id: 'DetailFocus',
  durationInSeconds: 10,
  fps: 30,
  width: 1080,
  height: 1080
};

type Props = {
  imageUrl: string;
  detailName: string;
  description?: string;
  qualityBadge?: string;
};

const DetailFocus: React.FC<Props> = ({
  imageUrl,
  detailName,
  description = "Handcrafted excellence",
  qualityBadge = "Premium Quality"
}) => {
  const frame = useCurrentFrame();

  const revealProgress = spring({
    frame: frame - 10,
    fps: 30,
    config: { damping: 15, stiffness: 95 },
  });

  const imageScale = 1 + revealProgress * 0.2;
  const imagePan = interpolate(frame, [10, 150], [-2, 2], {
    ...CLAMP,
    easing: EASINGS.easeInOut
  });

  const detailScale = spring({
    frame: frame - 40,
    fps: 30,
    config: { damping: 16, stiffness: 110 },
  });

  const descFade = interpolate(frame, [60, 85], [0, 1], {
    ...CLAMP,
    easing: EASINGS.easeOut
  });

  const badgeSpring = spring({
    frame: frame - 90,
    fps: 30,
    config: { damping: 18, stiffness: 120 },
  });

  const circleRadius = revealProgress * 80;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.d900 }}>
      {/* Image layer */}
      <AbsoluteFill>
        <Img
          src={imageUrl}
          maxRetries={3}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${imageScale}) translateX(${imagePan}%)`,
          }}
        />
      </AbsoluteFill>

      {/* Dark overlay that recedes as circle expands */}
      <AbsoluteFill
        style={{
          background: COLORS.d900,
          clipPath: `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, calc(50% - ${circleRadius}vmax) calc(50% - ${circleRadius}vmax), calc(50% - ${circleRadius}vmax) calc(50% + ${circleRadius}vmax), calc(50% + ${circleRadius}vmax) calc(50% + ${circleRadius}vmax), calc(50% + ${circleRadius}vmax) calc(50% - ${circleRadius}vmax), calc(50% - ${circleRadius}vmax) calc(50% - ${circleRadius}vmax))`,
        }}
      />

      {/* Vignette for depth */}
      <AbsoluteFill style={{
        background: 'radial-gradient(circle at 50% 50%, transparent 30%, rgba(0,0,0,0.7) 100%)',
      }} />

      {/* Content overlay */}
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'flex-start',
          padding: 80,
          pointerEvents: 'none',
        }}
      >
        <div style={{ transform: `scale(${detailScale})`, marginBottom: 20 }}>
          <div style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 64,
            fontWeight: 700,
            color: '#fff',
            lineHeight: 1.1,
            letterSpacing: -0.5,
            textShadow: '0 4px 12px rgba(0,0,0,0.8)',
          }}>
            {stripEmoji(detailName)}
          </div>
        </div>

        <div style={{ opacity: descFade, marginBottom: 32 }}>
          <div style={{
            fontFamily: FONT_BODY,
            fontSize: 28,
            fontWeight: 400,
            color: '#fff',
            lineHeight: 1.4,
            letterSpacing: 0.3,
            textShadow: '0 2px 8px rgba(0,0,0,0.6)',
            maxWidth: 600,
          }}>
            {description}
          </div>
        </div>

        <div style={{ transform: `scale(${badgeSpring})` }}>
          <div style={{
            padding: '16px 32px',
            background: 'rgba(201, 162, 39, 0.2)',
            border: `2px solid ${COLORS.accent}`,
            borderRadius: RADIUS.pill,
            backdropFilter: 'blur(10px)',
          }}>
            <div style={{
              fontFamily: FONT_BODY,
              fontSize: 20,
              fontWeight: 600,
              color: COLORS.accent,
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}>
              {qualityBadge}
            </div>
          </div>
        </div>
      </AbsoluteFill>

      {/* Corner accent */}
      <AbsoluteFill
        style={{
          alignItems: 'flex-start',
          justifyContent: 'flex-start',
          padding: 40,
        }}
      >
        <div style={{
          width: 80,
          height: 80,
          borderLeft: `4px solid ${COLORS.accent}`,
          borderTop: `4px solid ${COLORS.accent}`,
          opacity: 0.8,
        }} />
      </AbsoluteFill>

      {/* Brand signature */}
      <AbsoluteFill
        style={{
          alignItems: 'flex-end',
          justifyContent: 'flex-end',
          padding: 60,
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

export default DetailFocus;
