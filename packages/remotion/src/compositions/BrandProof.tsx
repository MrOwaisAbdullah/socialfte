import React from 'react';
import { useCurrentFrame, interpolate, AbsoluteFill } from 'remotion';
import { BRAND, COLORS, EASINGS, GRADIENT, RADIUS, SHADOW } from '../brand';
import { FONT_DISPLAY, FONT_DISPLAY_ITALIC, FONT_BODY, FONT_SUPPORT, FONT_MONO } from '../fonts';
import { BrandBadge, BrandBg, useRise, CLAMP } from '../lib/kit';

// =============================================================================
// BrandProof — NOT a video beat. A utility shot that renders the CURRENT brand
// back at you: wordmark, palette, type, depth, gradient, and the entrance easing.
// `/brand-setup` renders this as the last step so you SEE your brand before you
// build a video in it. Every value here is read from brand.ts / fonts.ts — this
// shot hardcodes nothing, so what you see is genuinely what your shots will use.
//
// Recreated for SocialFTE's 9:16 target (the original 16:9 version was removed in
// the Week 1 harvest along with the rest of src/shots/ — see docs/repo-harvest.md).
//
//   cd packages/remotion && npx remotion still src/index.ts BrandProof out/brand.png --frame=95
// =============================================================================
export const compositionConfig = { id: 'BrandProof', durationInSeconds: 8, fps: 30, width: 1080, height: 1920 };

// Every role in brand.ts, in the order BRAND.md §4 documents them.
const SWATCHES: readonly [string, string][] = [
  ['accent', COLORS.accent],
  ['accent2', COLORS.accent2],
  ['signal', COLORS.signal],
  ['warn', COLORS.warn],
  ['danger', COLORS.danger],
  ['ink', COLORS.ink],
  ['muted', COLORS.muted],
  ['line', COLORS.line],
];

const Swatch: React.FC<{ name: string; hex: string; i: number }> = ({ name, hex, i }) => {
  const frame = useCurrentFrame();
  const start = 30 + i * 3; // brand stagger: 3-4 frames between items
  const op = interpolate(frame, [start, start + 14], [0, 1], { ...CLAMP, easing: EASINGS.easeOut });
  const y = interpolate(frame, [start, start + 14], [16, 0], { ...CLAMP, easing: EASINGS.easeOut });
  return (
    <div style={{ opacity: op, transform: `translateY(${y}px)`, textAlign: 'center', width: 200 }}>
      <div style={{ width: '100%', height: 110, borderRadius: RADIUS.panel, background: hex, border: `1px solid ${COLORS.line}`, boxShadow: SHADOW.soft }} />
      <div style={{ fontFamily: FONT_BODY, fontSize: 22, color: COLORS.ink, marginTop: 10 }}>{name}</div>
      <div style={{ fontFamily: FONT_MONO, fontSize: 17, color: COLORS.muted }}>{hex}</div>
    </div>
  );
};

const BrandProof: React.FC = () => {
  const frame = useCurrentFrame();
  const rise = useRise();
  const barX = interpolate(frame, [16, 40], [0, 1], { ...CLAMP, easing: EASINGS.easeOut });

  return (
    <AbsoluteFill style={{ fontFamily: FONT_BODY }}>
      <BrandBg glow={COLORS.accent} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: '96px 56px', overflow: 'hidden' }}>

        {/* ---- the wordmark: middle part carries the accent ---- */}
        <div style={{ ...rise(2, 20), fontFamily: FONT_DISPLAY, fontSize: 82, letterSpacing: -1, color: COLORS.ink, textAlign: 'center' }}>
          {BRAND.wordmark[0]}
          <span style={{ color: COLORS.accent }}>{BRAND.wordmark[1]}</span>
          {BRAND.wordmark[2]}
        </div>
        <div style={{ ...rise(10, 16), fontFamily: FONT_DISPLAY_ITALIC, fontSize: 30, color: COLORS.accent2, marginTop: 6, textAlign: 'center' }}>
          {BRAND.signoff}
        </div>

        {/* ---- the signature gradient ---- */}
        <div style={{ width: 340, height: 8, borderRadius: RADIUS.pill, background: GRADIENT, marginTop: 26, transform: `scaleX(${barX})` }} />

        <div style={{ ...rise(20, 14), fontFamily: FONT_MONO, fontSize: 17, letterSpacing: 2, color: COLORS.muted, marginTop: 22, textAlign: 'center' }}>
          BRAND&nbsp;PROOF&nbsp;·&nbsp;brand.ts&nbsp;+&nbsp;fonts.ts
        </div>

        {/* ---- palette: 4x2 grid (8 roles) ---- */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 18, marginTop: 44, maxWidth: 940 }}>
          {SWATCHES.map(([name, hex], i) => <Swatch key={name} name={name} hex={hex} i={i} />)}
        </div>

        {/* ---- the 4-font system, on a card so depth + radius show too ---- */}
        <div style={{
          ...rise(64, 22),
          marginTop: 44, width: '100%', maxWidth: 940,
          background: COLORS.cream, border: `1px solid ${COLORS.line}`,
          borderRadius: RADIUS.card, boxShadow: SHADOW.card, padding: '30px 38px',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
            <span style={{ fontFamily: FONT_MONO, fontSize: 15, color: COLORS.muted, width: 96 }}>display</span>
            <span style={{ fontFamily: FONT_DISPLAY, fontSize: 40, color: COLORS.ink }}>Headlines land here</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
            <span style={{ fontFamily: FONT_MONO, fontSize: 15, color: COLORS.muted, width: 96 }}>body</span>
            <span style={{ fontFamily: FONT_BODY, fontSize: 26, color: COLORS.ink }}>Body copy and captions.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
            <span style={{ fontFamily: FONT_MONO, fontSize: 15, color: COLORS.muted, width: 96 }}>support</span>
            <span style={{ fontFamily: FONT_SUPPORT, fontSize: 26, color: COLORS.ink }}>Secondary copy and labels.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
            <span style={{ fontFamily: FONT_MONO, fontSize: 15, color: COLORS.muted, width: 96 }}>mono</span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 24, color: COLORS.ink }}>Rs 190,000 · Tier 1</span>
          </div>
        </div>

        {/* ---- ink-on-accent legibility: how gold is actually used (a highlight
             BOX behind dark text, never small foreground text on paper) ---- */}
        <div style={{ ...rise(76, 16), marginTop: 30, textAlign: 'center' }}>
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 32, color: COLORS.ink, background: COLORS.accent, padding: '2px 12px', borderRadius: 6 }}>
            a key word
          </span>
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 32, color: COLORS.ink }}> in your accent — is it legible?</span>
        </div>

      </AbsoluteFill>
      <BrandBadge width={1080} />
    </AbsoluteFill>
  );
};
export default BrandProof;
