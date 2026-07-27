import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion';
import { BRAND, COLORS, EASINGS } from '../brand';
import { FONT_DISPLAY, FONT_BODY } from '../fonts';
import { CLAMP } from '../lib/kit';

// =============================================================================
// HeroReveal — a still room render turned into motion: slow Ken Burns zoom,
// headline + subline fade in, brand mark closes it out. Week 5, User Story 1.
// Every color/font comes from brand.ts/fonts.ts — nothing hardcoded here.
//
//   cd packages/remotion && npx remotion still src/index.ts HeroReveal out/hero.png --frame=60 \
//     --props='{"imageUrl":"https://picsum.photos/1080/1920","headline":"Solid Sheesham Dining Set","subline":"PKR 245,000"}'
// =============================================================================
export const compositionConfig = { id: 'HeroReveal', durationInSeconds: 5, fps: 30, width: 1080, height: 1920 };

const ZOOM_DURATION_FRAMES = 150; // 5s @ 30fps, per the kickoff's spec

type Props = {
  imageUrl: string;
  headline: string;
  subline?: string;
};

const HeroReveal: React.FC<Props> = ({ imageUrl, headline, subline }) => {
  const frame = useCurrentFrame();

  // Ken Burns: slow zoom 0.95 -> 1.05 across the whole composition duration.
  const scale = interpolate(frame, [0, ZOOM_DURATION_FRAMES], [0.95, 1.05], {
    ...CLAMP,
    easing: EASINGS.easeInOut,
  });

  const headlineOp = interpolate(frame, [30, 44], [0, 1], { ...CLAMP, easing: EASINGS.easeOut });
  const headlineY = interpolate(frame, [30, 44], [16, 0], { ...CLAMP, easing: EASINGS.easeOut });
  const sublineOp = interpolate(frame, [44, 58], [0, 1], { ...CLAMP, easing: EASINGS.easeOut });
  const sublineY = interpolate(frame, [44, 58], [16, 0], { ...CLAMP, easing: EASINGS.easeOut });
  const brandOp = interpolate(frame, [90, 104], [0, 1], { ...CLAMP, easing: EASINGS.easeOut });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.d900 }}>
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <Img
          src={imageUrl}
          maxRetries={3}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </AbsoluteFill>

      {/* bottom scrim so text stays legible over any room render */}
      <AbsoluteFill
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.15) 45%, transparent 70%)' }}
      />

      <AbsoluteFill style={{ justifyContent: 'flex-end', padding: '0 72px 140px' }}>
        <div
          style={{
            opacity: headlineOp,
            transform: `translateY(${headlineY}px)`,
            fontFamily: FONT_DISPLAY,
            fontSize: 72,
            lineHeight: 1.05,
            color: '#fff',
          }}
        >
          {headline}
        </div>
        {subline && (
          <div
            style={{
              opacity: sublineOp,
              transform: `translateY(${sublineY}px)`,
              fontFamily: FONT_BODY,
              fontWeight: 600,
              fontSize: 44,
              color: COLORS.accent,
              marginTop: 18,
            }}
          >
            {subline}
          </div>
        )}
      </AbsoluteFill>

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-start', paddingTop: 80, opacity: brandOp }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 40, color: '#fff', letterSpacing: -0.5 }}>
          {BRAND.wordmark[0]}
          <span style={{ color: COLORS.accent }}>{BRAND.wordmark[1]}</span>
          {BRAND.wordmark[2]}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export default HeroReveal;
