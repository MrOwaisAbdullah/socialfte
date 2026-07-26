// Brand font system, loaded from Google Fonts (bundled by Remotion at render time).
// Nothing to install — swap a family here and every shot follows. `/brand-setup`
// rewrites this file alongside brand.ts and BRAND.md; keep all three in sync if you
// edit by hand. Families + weights verified against @remotion/google-fonts (all
// exist; Instrument Serif ships weight 400 only, which is exactly what BRAND.md
// asks for — "Regular, Italic", no numeric-weight request beyond that).
import { loadFont as loadDisplay } from '@remotion/google-fonts/InstrumentSerif';
import { loadFont as loadBody } from '@remotion/google-fonts/Archivo';
import { loadFont as loadSupport } from '@remotion/google-fonts/HankenGrotesk';
import { loadFont as loadMono } from '@remotion/google-fonts/SpaceMono';
import { loadFont as loadSerif } from '@remotion/google-fonts/Spectral';

export const FONT_DISPLAY = loadDisplay('normal', { weights: ['400'], subsets: ['latin'] }).fontFamily;
export const FONT_DISPLAY_ITALIC = loadDisplay('italic', { weights: ['400'], subsets: ['latin'] }).fontFamily;
export const FONT_BODY = loadBody('normal', { weights: ['400', '500', '600'], subsets: ['latin'] }).fontFamily;
// Supporting typeface (BRAND.md §4) — secondary copy, labels. New export; nothing
// existing imports it yet since compositions/ is currently empty.
export const FONT_SUPPORT = loadSupport('normal', { weights: ['400', '500'], subsets: ['latin'] }).fontFamily;
export const FONT_MONO = loadMono('normal', { weights: ['400'], subsets: ['latin'] }).fontFamily;
// serif for the Claude Code wordmark clone (close match to the app's serif) — not a brand font
export const FONT_SERIF = loadSerif('normal', { weights: ['500', '600'], subsets: ['latin'] }).fontFamily;
