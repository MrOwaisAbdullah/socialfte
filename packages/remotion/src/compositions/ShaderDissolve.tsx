import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion';
import { COLORS, EASINGS } from '../brand';
import { FONT_DISPLAY, FONT_BODY } from '../fonts';
import { BrandBadge, CLAMP, stripEmoji, MusicBed } from '../lib/kit';

// =============================================================================
// ShaderDissolve — cross-fades between multiple angles of the same product,
// each transition using an SVG feTurbulence/feDisplacementMap filter (a
// "melt apart, then resolve" distortion) plus a diagonal edge-glow sweep and
// a grayscale-to-color reveal on the incoming image, instead of a plain
// opacity crossfade.
// Duration: 10s | 1080x1080 | 30fps
// =============================================================================
export const compositionConfig = {
  id: 'ShaderDissolve',
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
  headline: string;
  subline?: string;
};

const TRANSITION_FRAMES = 24;

const ShaderDissolve: React.FC<Props> = ({
  imageUrl,
  secondaryImage,
  thirdImage,
  fourthImage,
  headline,
  subline,
}) => {
  const frame = useCurrentFrame();
  const images = [imageUrl, secondaryImage, thirdImage, fourthImage].filter(
    (url): url is string => Boolean(url)
  );
  const totalFrames = compositionConfig.durationInSeconds * compositionConfig.fps;
  const segmentLength = totalFrames / images.length;

  const headlineOp = interpolate(frame, [10, 30], [0, 1], { ...CLAMP, easing: EASINGS.easeOut });
  const headlineY = interpolate(frame, [10, 30], [24, 0], { ...CLAMP, easing: EASINGS.easeOut });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.d900 }}>
      <MusicBed trackId="ShaderDissolve" />

      {images.map((url, index) => {
        const segmentStart = index * segmentLength;
        const nextSegmentStart = (index + 1) * segmentLength;
        // This image is "incoming" during the transition window at the start
        // of its own segment (skipped for the very first image, which is
        // just visible from frame 0) and "outgoing" during the transition
        // window at the end of its segment (skipped for the last image).
        const isFirst = index === 0;
        const isLast = index === images.length - 1;

        const incomingProgress = isFirst
          ? 1
          : interpolate(frame, [segmentStart, segmentStart + TRANSITION_FRAMES], [0, 1], {
              ...CLAMP,
              easing: EASINGS.easeInOut,
            });
        const outgoingProgress = isLast
          ? 1
          : interpolate(
              frame,
              [nextSegmentStart - TRANSITION_FRAMES, nextSegmentStart],
              [1, 0],
              { ...CLAMP, easing: EASINGS.easeInOut }
            );

        // Visible (nonzero opacity) from the start of its own incoming
        // transition through the end of its own outgoing transition.
        const opacity = Math.min(incomingProgress, outgoingProgress);
        if (opacity <= 0) return null;

        // Distortion peaks at the very start of the incoming transition and
        // resolves to a clean image by the time it finishes — the "melt
        // apart, then resolve" read, driven by feDisplacementMap's scale.
        const displacementScale = isFirst ? 0 : (1 - incomingProgress) * 70;
        const grayscale = isFirst ? 0 : 1 - incomingProgress;
        const filterId = `dissolve-${index}`;

        return (
          <AbsoluteFill key={url + index} style={{ opacity }}>
            <svg width="0" height="0" style={{ position: 'absolute' }}>
              <defs>
                <filter id={filterId}>
                  <feTurbulence type="fractalNoise" baseFrequency="0.012 0.018" numOctaves={2} seed={index + 1} result="noise" />
                  <feDisplacementMap in="SourceGraphic" in2="noise" scale={displacementScale} xChannelSelector="R" yChannelSelector="G" />
                </filter>
              </defs>
            </svg>
            <AbsoluteFill style={{ filter: `url(#${filterId}) grayscale(${grayscale})` }}>
              <Img src={url} maxRetries={3} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </AbsoluteFill>
            {/* Diagonal edge-glow sweep during the incoming transition */}
            {!isFirst && incomingProgress < 1 && (
              <AbsoluteFill
                style={{
                  mixBlendMode: 'screen',
                  background: `linear-gradient(115deg, transparent 0%, transparent 42%, rgba(255,255,255,0.55) 50%, transparent 58%, transparent 100%)`,
                  transform: `translateX(${interpolate(incomingProgress, [0, 1], [-140, 140])}%)`,
                }}
              />
            )}
          </AbsoluteFill>
        );
      })}

      {/* Vignette + gradient scrim for text legibility */}
      <AbsoluteFill
        style={{
          background: 'linear-gradient(to top, rgba(14,14,14,0.75) 0%, transparent 40%)',
        }}
      />

      <AbsoluteFill style={{ justifyContent: 'flex-end', padding: 64 }}>
        <div style={{ opacity: headlineOp, transform: `translateY(${headlineY}px)` }}>
          <h1
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 64,
              fontWeight: 800,
              color: COLORS.paper,
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            {stripEmoji(headline)}
          </h1>
          {subline && (
            <p style={{ fontFamily: FONT_BODY, fontSize: 26, color: COLORS.d300, marginTop: 12 }}>
              {stripEmoji(subline)}
            </p>
          )}
        </div>
      </AbsoluteFill>

      <BrandBadge width={1080} />
    </AbsoluteFill>
  );
};

export default ShaderDissolve;
