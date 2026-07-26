import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session';

// Single-user session gate (FR-008). Named `proxy` (not `middleware`) per
// Next.js 16's rename — the `edge` runtime is not supported here, but this
// gate doesn't need it (plain cookie read + HMAC verify). Excludes:
// - /login: where the operator enters SESSION_SECRET
// - /api/internal/*: authenticated separately via RENDER_INTERNAL_SECRET (Story 5)
// - /render-preview: headless, navigated to by Puppeteer server-side, never by
//   a logged-in browser session — it must stay reachable without a cookie
export function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (verifySessionToken(token)) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: ['/((?!login|api/internal|render-preview|_next/static|_next/image|favicon.ico).*)'],
};
