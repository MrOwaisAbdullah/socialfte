import React from 'react';
import { AbsoluteFill, Img, interpolate, random, spring, useCurrentFrame } from 'remotion';
import { COLORS, EASINGS, RADIUS, SHADOW } from '../brand';
import { FONT_DISPLAY, FONT_BODY } from '../fonts';
import { BrandBadge, CLAMP, stripEmoji, MusicBed } from '../lib/kit';

// =============================================================================
// CardConverge — up to 5 product photos scatter off-canvas at random
// (seeded, so it's identical on every render) positions and rotations, then
// spring into a tidy overlapping row. Built for "set breakdown" posts —
// several pieces of the same set converging into one shot reads as "here's
// the full set" the way a single static image with only one asset can't.
// Duration: 10s | 1080x1080 | 30fps
// =============================================================================
export const compositionConfig = {
  id: 'CardConverge',
  durationInSeconds: 10,
  fps: 30,
  width: 1080,
  height: 1080,
};

type Props = {
  imageUrl: string;
  secondaryImage?: string;
  thirdImage?: string;
  fourthImage?: string;
  fifthImage?: string;
  setName: string;
  bundlePrice?: string;
};

const CARD_SIZE = 320;
// Each card starts its convergence spring this many frames after the last —
// a visible "cascade" rather than every card snapping in at once.
const STAGGER_FRAMES = 8;

const CardConverge: React.FC<Props> = ({
  imageUrl,
  secondaryImage,
  thirdImage,
  fourthImage,
  fifthImage,
  setName,
  bundlePrice,
}) => {
  const frame = useCurrentFrame();
  const images = [imageUrl, secondaryImage, thirdImage, fourthImage, fifthImage].filter(
    (url): url is string => Boolean(url)
  );
  const count = images.length;

  // Final layout: an overlapping horizontal row, centered, each card
  // slightly offset vertically for a fanned-out "hand of cards" read.
  const finalPositions = images.map((_, i) => {
    const spread = Math.min(count - 1, 4);
    const step = spread > 0 ? CARD_SIZE * 0.62 : 0;
    const x = (i - (count - 1) / 2) * step;
    const y = (i % 2 === 0 ? -1 : 1) * 18;
    return { x, y };
  });

  const headlineDelay = 40 + count * STAGGER_FRAMES;
  const headlineOp = interpolate(frame, [headlineDelay, headlineDelay + 20], [0, 1], {
    ...CLAMP,
    easing: EASINGS.easeOut,
  });
  const headlineY = interpolate(frame, [headlineDelay, headlineDelay + 20], [24, 0], {
    ...CLAMP,
    easing: EASINGS.easeOut,
  });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.paper }}>
      <MusicBed trackId="CardConverge" />

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        {images.map((url, i) => {
          const seedBase = `card-converge-${i}`;
          // Seeded, not Math.random() — must be identical every render.
          const startX = (random(`${seedBase}-x`) - 0.5) * 2200;
          const startY = (random(`${seedBase}-y`) - 0.5) * 2200;
          const startRotation = (random(`${seedBase}-r`) - 0.5) * 140;

          const enterFrame = i * STAGGER_FRAMES;
          const progress = spring({
            frame: frame - enterFrame,
            fps: 30,
            config: { damping: 16, stiffness: 90, mass: 0.9 },
          });

          const { x: finalX, y: finalY } = finalPositions[i];
          const x = interpolate(progress, [0, 1], [startX, finalX]);
          const y = interpolate(progress, [0, 1], [startY, finalY]);
          const rotation = interpolate(progress, [0, 1], [startRotation, (i % 2 === 0 ? -1 : 1) * 4]);
          const scale = interpolate(progress, [0, 1], [0.4, 1]);
          const opacity = interpolate(frame - enterFrame, [0, 8], [0, 1], CLAMP);

          return (
            <div
              key={url + i}
              style={{
                position: 'absolute',
                width: CARD_SIZE,
                height: CARD_SIZE,
                transform: `translate(${x}px, ${y}px) rotate(${rotation}deg) scale(${scale})`,
                opacity,
                zIndex: i,
                borderRadius: RADIUS.popup,
                overflow: 'hidden',
                boxShadow: SHADOW.card,
                border: `4px solid ${COLORS.paper}`,
                background: COLORS.cream,
              }}
            >
              <Img src={url} maxRetries={3} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          );
        })}
      </AbsoluteFill>

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', padding: 64 }}>
        <div style={{ opacity: headlineOp, transform: `translateY(${headlineY}px)`, textAlign: 'center' }}>
          <h1
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 56,
              fontWeight: 800,
              color: COLORS.forest,
              margin: 0,
            }}
          >
            {stripEmoji(setName)}
          </h1>
          {bundlePrice && (
            <p style={{ fontFamily: FONT_BODY, fontSize: 32, fontWeight: 700, color: COLORS.accent, marginTop: 8 }}>
              {stripEmoji(bundlePrice)}
            </p>
          )}
        </div>
      </AbsoluteFill>

      <BrandBadge width={1080} />
    </AbsoluteFill>
  );
};

export default CardConverge;
