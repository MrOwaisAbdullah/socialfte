import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion';
import { BRAND, COLORS, EASINGS, GRADIENT } from '../brand';
import { FONT_DISPLAY, FONT_BODY } from '../fonts';
import { CLAMP } from '../lib/kit';

// =============================================================================
// PriceReveal — builds anticipation on a hook line, then wipes in the price.
// Week 5, User Story 1. `hookText` is a prop (with a sensible default), not a
// hardcoded string — every post can supply its own hook.
// =============================================================================
export const compositionConfig = { id: 'PriceReveal', durationInSeconds: 5, fps: 30, width: 1080, height: 1920 };

type Props = {
  imageUrl: string;
  price: string;
  hookText?: string;
};

const PriceReveal: React.FC<Props> = ({ imageUrl, price, hookText = 'Ye kitne ka hoga?' }) => {
  const frame = useCurrentFrame();

  const hookOp = interpolate(frame, [0, 45], [0, 1], { ...CLAMP, easing: EASINGS.easeOut });
  const hookExitOp = interpolate(frame, [55, 65], [1, 0], { ...CLAMP, easing: EASINGS.easeIn });

  // Price wipes in at frame 60 via a growing bar behind the text.
  const barWidth = interpolate(frame, [60, 78], [0, 1], { ...CLAMP, easing: EASINGS.easeOut });
  const priceOp = interpolate(frame, [66, 80], [0, 1], { ...CLAMP, easing: EASINGS.easeOut });

  const brandOp = interpolate(frame, [90, 104], [0, 1], { ...CLAMP, easing: EASINGS.easeOut });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.d900 }}>
      <Img src={imageUrl} maxRetries={3} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.75) 100%)' }} />

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: '0 64px' }}>
        <div
          style={{
            position: 'absolute',
            opacity: hookOp * hookExitOp,
            fontFamily: FONT_DISPLAY,
            fontSize: 58,
            color: '#fff',
            textAlign: 'center',
          }}
        >
          {hookText}
        </div>

        <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              position: 'absolute',
              left: '50%',
              transform: `translateX(-50%) scaleX(${barWidth})`,
              transformOrigin: 'center',
              width: '90%',
              height: 160,
              borderRadius: 20,
              background: GRADIENT,
            }}
          />
          <div
            style={{
              position: 'relative',
              opacity: priceOp,
              fontFamily: FONT_DISPLAY,
              fontWeight: 700,
              fontSize: 88,
              color: '#fff',
              padding: '0 24px',
            }}
          >
            {price}
          </div>
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 100, opacity: brandOp }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 40, color: '#fff' }}>
          {BRAND.wordmark[0]}
          <span style={{ color: COLORS.accent }}>{BRAND.wordmark[1]}</span>
          {BRAND.wordmark[2]}
        </div>
        <div style={{ fontFamily: FONT_BODY, fontSize: 24, color: COLORS.d400, marginTop: 8 }}>{BRAND.signoff}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export default PriceReveal;
