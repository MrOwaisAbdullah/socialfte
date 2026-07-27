import type { Metadata } from 'next';
import { Instrument_Serif, Archivo } from 'next/font/google';
import './globals.css';

// Brand fonts (BRAND.md). Only the weights actually used — Instrument Serif
// ships regular only; Archivo's 400/500/600 covers body/label/emphasis.
const heading = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-heading',
});
const body = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
});

// Per-client display name (FR-016) — an unconfigured deployment still
// renders a sensible title instead of a hardcoded brand.
const brandName = process.env.BRAND_NAME;

export const metadata: Metadata = {
  title: brandName ? `SocialFTE — ${brandName}` : 'SocialFTE',
  description: brandName
    ? `Draft, review, and publish social content for ${brandName}.`
    : 'Draft, review, and publish social content.',
};

// Bare root layout — fonts, globals, nothing else. Route groups add their own
// chrome (headers, sidebars) via nested layouts. The /render-preview page
// inherits this bare layout so Puppeteer screenshots have no app chrome
// (FR-015).
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`}>
      <body className="min-h-dvh bg-light font-body text-dark antialiased">
        {children}
      </body>
    </html>
  );
}
