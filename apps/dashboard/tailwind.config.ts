import type { Config } from 'tailwindcss';

// Brand tokens from /BRAND.md §4 — do not hand-pick colors/fonts elsewhere in
// the app; extend this file if a new brand-driven utility is needed so the
// dashboard shell and BRAND.md never drift (mirrors packages/remotion/src/brand.ts's
// role for the Remotion side).
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#1B4332', // forest green
        accent: '#C9A227', // warm gold
        light: '#F5F0E8', // cream
        dark: '#1A1A1A', // deep charcoal
        muted: '#6b6b6b', // darkened from BRAND.md's #9E9E9E for legibility — see BRAND.md's contrast note
        offer: '#d62828', // crimson offer/promo red — from shadi offer popup
        'surface-peach': '#f0e6d2', // warm peach-cream — from shadi offer popup
        'surface-forest': '#1a3d2e', // deep forest green card — from shadi offer popup
      },
      fontFamily: {
        heading: ['var(--font-heading)', 'Georgia', 'serif'], // Instrument Serif
        body: ['var(--font-body)', 'Helvetica', 'Arial', 'sans-serif'], // Archivo
      },
      borderRadius: {
        popup: '12px', // from shadi offer popup
      },
    },
  },
  plugins: [],
};

export default config;
