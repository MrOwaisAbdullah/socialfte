import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion';
import { COLORS, EASINGS } from '../brand';
import { FONT_BODY } from '../fonts';
import { CLAMP } from '../lib/kit';

// =============================================================================
// FabricDetail — a slow pan across a close-up (fabric, stitching, hardware).
// Pure quality proof: no price, no CTA, per spec.md's User Story 1 scenario 3.
// Week 5, User Story 1.
// =============================================================================
export const compositionConfig = { id: 'FabricDetail', durationInSeconds: 4, fps: 30, width: 1080, height: 1920 };

const PAN_DURATION_FRAMES = 120; // 4s @ 30fps

type Props = {
  imageUrl: string;
  qualityClaim: string;
};

const FabricDetail: React.FC<Props> = ({ imageUrl, qualityClaim }) => {
  const frame = useCurrentFrame();

  // Slow pan: the image is rendered oversized and translated across the frame,
  // rather than zoomed, for a steadier "close inspection" feel than Ken Burns.
  const panX = interpolate(frame, [0, PAN_DURATION_FRAMES], [-4, 4], {
    ...CLAMP,
    easing: EASINGS.easeInOut,
  });

  const textOp = interpolate(frame, [20, 36], [0, 1], { ...CLAMP, easing: EASINGS.easeOut });
  const textY = interpolate(frame, [20, 36], [12, 0], { ...CLAMP, easing: EASINGS.easeOut });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.d900 }}>
      <AbsoluteFill style={{ transform: `translateX(${panX}%) scale(1.12)` }}>
        <Img src={imageUrl} maxRetries={3} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>

      <AbsoluteFill
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 40%)' }}
      />

      <AbsoluteFill style={{ justifyContent: 'flex-end', padding: '0 64px 120px' }}>
        <div
          style={{
            opacity: textOp,
            transform: `translateY(${textY}px)`,
            fontFamily: FONT_BODY,
            fontWeight: 500,
            fontSize: 32,
            letterSpacing: 0.5,
            color: '#fff',
            maxWidth: 820,
          }}
        >
          {qualityClaim}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export default FabricDetail;
