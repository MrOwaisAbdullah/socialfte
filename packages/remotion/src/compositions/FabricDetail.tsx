import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion';
import { COLORS, EASINGS } from '../brand';
import { FONT_BODY } from '../fonts';
import { BrandBadge, CLAMP, MusicBed, useSquareRevealPan } from '../lib/kit';

// =============================================================================
// FabricDetail — a slow pan across a close-up (fabric, stitching, hardware).
// Pure quality proof: no price, no CTA, per spec.md's User Story 1 scenario 3.
// Week 5, User Story 1.
// =============================================================================
export const compositionConfig = { id: 'FabricDetail', durationInSeconds: 8, fps: 30, width: 1080, height: 1920 };

const PAN_DURATION_FRAMES = 240; // 8s @ 30fps

type Props = {
  imageUrl: string;
  qualityClaim: string;
};

const FabricDetail: React.FC<Props> = ({ imageUrl, qualityClaim }) => {
  const frame = useCurrentFrame();

  // Slow pan across the source's full width, not zoomed — a steadier "close
  // inspection" feel than Ken Burns, and (unlike the old ±4% wrapper pan)
  // an actual traversal of the 1:1 source instead of a fixed center crop.
  const pan = useSquareRevealPan(1080, 1920, PAN_DURATION_FRAMES);

  const textOp = interpolate(frame, [20, 36], [0, 1], { ...CLAMP, easing: EASINGS.easeOut });
  const textY = interpolate(frame, [20, 36], [12, 0], { ...CLAMP, easing: EASINGS.easeOut });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.d900 }}>
      <MusicBed trackId="FabricDetail" />
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        <Img
          src={imageUrl}
          maxRetries={3}
          style={{ position: 'absolute', top: 0, left: pan.left, width: pan.width, height: pan.height, objectFit: 'cover' }}
        />
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
      <BrandBadge width={1080} />
    </AbsoluteFill>
  );
};

export default FabricDetail;
