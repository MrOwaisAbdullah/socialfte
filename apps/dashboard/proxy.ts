import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session';

// Single-user session gate (FR-008). Named `proxy` (not `middleware`) per
// Next.js 16's rename — the `edge` runtime is not supported here, but this
// gate doesn't need it (plain cookie read + HMAC verify). Excludes:
// - /login: where the operator enters SESSION_SECRET
// - /api/internal/*: authenticated separately via RENDER_INTERNAL_SECRET (Story 5)
// - /api/webhooks/*: authenticated separately via provider signature (e.g. Discord's
//   Ed25519 header) — these are server-to-server callbacks with no session cookie;
//   without this exclusion the gate redirected every interaction to /login instead
//   of returning the JSON Discord expects, silently breaking the whole approval flow
// - /render-preview: headless, navigated to by Puppeteer server-side, never by
//   a logged-in browser session — it must stay reachable without a cookie
// - /api/render-complete: the render-video.yml GitHub Actions callback (the
//   worker has no public port, so this dashboard route proxies the callback
//   through) — authenticated via x-render-secret, same reasoning as
//   api/webhooks above; a GitHub-hosted runner has no session cookie either
export function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (verifySessionToken(token)) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: [
    '/((?!login|api/internal|api/webhooks|api/render-complete|render-preview|api/jobs|_next/static|_next/image|favicon.ico).*)',
  ],
};
