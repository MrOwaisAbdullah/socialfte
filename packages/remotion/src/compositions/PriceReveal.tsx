import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion';
import { BRAND, COLORS, EASINGS, GRADIENT } from '../brand';
import { FONT_DISPLAY, FONT_BODY } from '../fonts';
import { BrandBadge, CLAMP, stripEmoji } from '../lib/kit';

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

  const hookOp = interpolate(frame, [0, 35], [0, 1], { ...CLAMP, easing: EASINGS.overshoot });
  const hookScale = interpolate(frame, [0, 35], [0.8, 1], { ...CLAMP, easing: EASINGS.overshoot });
  const hookExitOp = interpolate(frame, [50, 65], [1, 0], { ...CLAMP, easing: EASINGS.easeIn });

  // Enhanced price reveal with elastic animation
  const barWidth = interpolate(frame, [55, 75], [0, 1], { ...CLAMP, easing: EASINGS.overshoot });
  const priceScale = interpolate(frame, [70, 90], [0.5, 1], { ...CLAMP, easing: EASINGS.overshoot });
  const priceOp = interpolate(frame, [65, 85], [0, 1], { ...CLAMP, easing: EASINGS.overshoot });

  const brandOp = interpolate(frame, [85, 105], [0, 1], { ...CLAMP, easing: EASINGS.overshoot });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.d900 }}>
      <Img src={imageUrl} maxRetries={3} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />

      {/* Enhanced vignette overlay */}
      <AbsoluteFill
        style={{
          background: 'radial-gradient(circle at center, transparent 20%, rgba(0,0,0,0.6) 80%)',
        }}
      />

      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.85) 100%)' }} />

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: '0 64px' }}>
        <div
          style={{
            position: 'absolute',
            opacity: hookOp * hookExitOp,
            transform: `scale(${hookScale})`,
            fontFamily: FONT_DISPLAY,
            fontSize: 56,
            color: '#fff',
            textAlign: 'center',
            textShadow: '0 2px 8px rgba(0,0,0,0.7)',
            fontWeight: 600,
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
              width: '85%',
              height: 140,
              borderRadius: 24,
              background: GRADIENT,
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}
          />
          <div
            style={{
              position: 'relative',
              opacity: priceOp,
              transform: `scale(${priceScale})`,
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: 84,
              color: '#fff',
              padding: '0 20px',
              textShadow: '0 2px 6px rgba(0,0,0,0.5)',
              letterSpacing: -1,
            }}
          >
            {stripEmoji(price)}
          </div>
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 96, opacity: brandOp }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 38, color: '#fff', fontWeight: 700 }}>
          {BRAND.wordmark[0]}
          <span style={{ color: COLORS.accent }}>{BRAND.wordmark[1]}</span>
          {BRAND.wordmark[2]}
        </div>
        <div style={{ fontFamily: FONT_BODY, fontSize: 22, color: COLORS.d400, marginTop: 8, fontWeight: 500 }}>{BRAND.signoff}</div>
      </AbsoluteFill>
      <BrandBadge width={1080} />
    </AbsoluteFill>
  );
};

export default PriceReveal;
