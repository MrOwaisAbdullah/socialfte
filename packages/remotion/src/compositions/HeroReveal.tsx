import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion';
import { BRAND, COLORS, EASINGS } from '../brand';
import { FONT_DISPLAY, FONT_BODY } from '../fonts';
import { BrandBadge, CLAMP, stripEmoji, MusicBed } from '../lib/kit';

// =============================================================================
// HeroReveal — a still room render turned into motion: slow Ken Burns zoom,
// headline + subline fade in, brand mark closes it out. Week 5, User Story 1.
// Every color/font comes from brand.ts/fonts.ts — nothing hardcoded here.
//
//   cd packages/remotion && npx remotion still src/index.ts HeroReveal out/hero.png --frame=60 \
//     --props='{"imageUrl":"https://picsum.photos/1080/1920","headline":"Solid Sheesham Dining Set","subline":"PKR 245,000"}'
// =============================================================================
export const compositionConfig = { id: 'HeroReveal', durationInSeconds: 10, fps: 30, width: 1080, height: 1920 };

const ZOOM_DURATION_FRAMES = 150; // 5s @ 30fps, per the kickoff's spec

type Props = {
  imageUrl: string;
  headline: string;
  subline?: string;
};

const HeroReveal: React.FC<Props> = ({ imageUrl, headline, subline }) => {
  const frame = useCurrentFrame();

  // Enhanced Ken Burns with subtle pan for more dynamic feel
  const scale = interpolate(frame, [0, ZOOM_DURATION_FRAMES], [1.0, 1.15], {
    ...CLAMP,
    easing: EASINGS.easeInOut,
  });

  const panX = interpolate(frame, [0, ZOOM_DURATION_FRAMES], [-20, 20], {
    ...CLAMP,
    easing: EASINGS.easeInOut,
  });

  const headlineOp = interpolate(frame, [20, 40], [0, 1], { ...CLAMP, easing: EASINGS.overshoot });
  const headlineY = interpolate(frame, [20, 40], [20, 0], { ...CLAMP, easing: EASINGS.overshoot });
  const headlineScale = interpolate(frame, [20, 30], [0.9, 1], { ...CLAMP, easing: EASINGS.overshoot });

  const sublineOp = interpolate(frame, [35, 55], [0, 1], { ...CLAMP, easing: EASINGS.overshoot });
  const sublineY = interpolate(frame, [35, 55], [20, 0], { ...CLAMP, easing: EASINGS.overshoot });

  const brandOp = interpolate(frame, [80, 100], [0, 1], { ...CLAMP, easing: EASINGS.overshoot });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.d900 }}>
      <MusicBed trackId="HeroReveal" />
      <AbsoluteFill style={{ transform: `scale(${scale}) translateX(${panX}px)` }}>
        <Img
          src={imageUrl}
          maxRetries={3}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </AbsoluteFill>

      {/* Enhanced vignette for better text legibility */}
      <AbsoluteFill
        style={{
          background: 'radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.4) 70%, rgba(0,0,0,0.85) 100%)',
        }}
      />

      {/* Premium gradient overlay */}
      <AbsoluteFill
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.3) 40%, transparent 65%)',
        }}
      />

      <AbsoluteFill style={{ justifyContent: 'center', padding: '0 64px' }}>
        <div
          style={{
            opacity: headlineOp,
            transform: `translateY(${headlineY}px) scale(${headlineScale})`,
            fontFamily: FONT_DISPLAY,
            fontSize: 84,
            lineHeight: 1.1,
            color: '#fff',
            textShadow: '0 2px 8px rgba(0,0,0,0.5)',
            fontWeight: 700,
          }}
        >
          {stripEmoji(headline)}
        </div>
        {subline && (
          <div
            style={{
              opacity: sublineOp,
              transform: `translateY(${sublineY}px)`,
              fontFamily: FONT_BODY,
              fontWeight: 700,
              fontSize: 48,
              color: COLORS.accent,
              marginTop: 16,
              textShadow: '0 2px 6px rgba(0,0,0,0.6)',
              letterSpacing: 0.5,
            }}
          >
            {stripEmoji(subline)}
          </div>
        )}
      </AbsoluteFill>

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-start', paddingTop: 72, opacity: brandOp }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 36, color: '#fff', letterSpacing: -0.3, fontWeight: 700 }}>
          {BRAND.wordmark[0]}
          <span style={{ color: COLORS.accent }}>{BRAND.wordmark[1]}</span>
          {BRAND.wordmark[2]}
        </div>
      </AbsoluteFill>
      <BrandBadge width={1080} />
    </AbsoluteFill>
  );
};

export default HeroReveal;
