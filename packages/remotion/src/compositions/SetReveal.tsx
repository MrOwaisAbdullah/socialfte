import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion';
import { BRAND, COLORS, EASINGS, SHADOW } from '../brand';
import { FONT_DISPLAY, FONT_BODY } from '../fonts';
import { BrandBadge, CLAMP, MusicBed, useSquareRevealPan } from '../lib/kit';

// =============================================================================
// SetReveal — two "wardrobe door" panels slide open (CSS transform) to reveal
// the full set image underneath, then the set name + bundle price appear.
// Week 5, User Story 1.
// =============================================================================
export const compositionConfig = { id: 'SetReveal', durationInSeconds: 10, fps: 30, width: 1080, height: 1920 };

const DOOR_OPEN_START = 20;
const DOOR_OPEN_END = 65;

type Props = {
  imageUrl: string;
  setName: string;
  bundlePrice: string;
};

const SetReveal: React.FC<Props> = ({ imageUrl, setName, bundlePrice }) => {
  const frame = useCurrentFrame();
  const pan = useSquareRevealPan(1080, 1920, compositionConfig.durationInSeconds * compositionConfig.fps);

  const doorProgress = interpolate(frame, [DOOR_OPEN_START, DOOR_OPEN_END], [0, 1], {
    ...CLAMP,
    easing: EASINGS.easeInOut,
  });
  const leftDoorX = interpolate(doorProgress, [0, 1], [0, -100]);
  const rightDoorX = interpolate(doorProgress, [0, 1], [0, 100]);

  const nameOp = interpolate(frame, [DOOR_OPEN_END + 15, DOOR_OPEN_END + 29], [0, 1], { ...CLAMP, easing: EASINGS.easeOut });
  const nameY = interpolate(frame, [DOOR_OPEN_END + 15, DOOR_OPEN_END + 29], [16, 0], { ...CLAMP, easing: EASINGS.easeOut });
  const priceOp = interpolate(frame, [DOOR_OPEN_END + 29, DOOR_OPEN_END + 43], [0, 1], { ...CLAMP, easing: EASINGS.easeOut });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.d900 }}>
      <MusicBed trackId="SetReveal" />
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        <Img
          src={imageUrl}
          maxRetries={3}
          style={{ position: 'absolute', top: 0, left: pan.left, width: pan.width, height: pan.height, objectFit: 'cover' }}
        />
      </AbsoluteFill>

      {/* the two door panels, styled from brand tokens, sliding fully off-screen */}
      <AbsoluteFill
        style={{
          left: 0,
          width: '50%',
          transform: `translateX(${leftDoorX}%)`,
          background: COLORS.accent2,
          borderRight: `2px solid ${COLORS.d600}`,
          boxShadow: SHADOW.card,
        }}
      />
      <AbsoluteFill
        style={{
          left: '50%',
          width: '50%',
          transform: `translateX(${rightDoorX}%)`,
          background: COLORS.accent2,
          borderLeft: `2px solid ${COLORS.d600}`,
          boxShadow: SHADOW.card,
        }}
      />

      <AbsoluteFill
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 45%)' }}
      />

      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 64px', textAlign: 'center' }}>
        <div
          style={{
            opacity: nameOp,
            transform: `translateY(${nameY}px)`,
            fontFamily: FONT_DISPLAY,
            fontSize: 72,
            color: '#fff',
          }}
        >
          {setName}
        </div>
        <div
          style={{
            opacity: priceOp,
            fontFamily: FONT_BODY,
            fontWeight: 600,
            fontSize: 46,
            color: COLORS.accent,
            marginTop: 14,
          }}
        >
          {bundlePrice}
        </div>
        <div style={{ opacity: priceOp, fontFamily: FONT_DISPLAY, fontSize: 32, color: '#fff', marginTop: 26 }}>
          {BRAND.wordmark[0]}
          <span style={{ color: COLORS.accent }}>{BRAND.wordmark[1]}</span>
          {BRAND.wordmark[2]}
        </div>
      </AbsoluteFill>
      <BrandBadge width={1080} />
    </AbsoluteFill>
  );
};

export default SetReveal;
