import { randomUUID } from 'crypto';
import puppeteer from 'puppeteer';
import { NextRequest, NextResponse } from 'next/server';
import { TEMPLATE_REGISTRY, validateTemplateProps } from '@/components/templates/registry';
import { resolveAspect, type Aspect } from '@/components/templates/aspect';
import { uploadBuffer, getPublicUrl } from '@/lib/r2';

// Puppeteer needs the Node.js runtime — the Edge runtime cannot launch a
// browser (research.md Decision 4).
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  // 1. Auth — checked before any other work (FR-013).
  const secret = request.headers.get('x-render-secret');
  if (!secret || secret !== process.env.RENDER_INTERNAL_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { templateId, props, aspect, brand } = body as {
    templateId?: string;
    props?: Record<string, unknown>;
    aspect?: Aspect;
    brand?: unknown;
  };

  // 2. Validate templateId + props (FR-014) — reject before rendering.
  if (!templateId || !TEMPLATE_REGISTRY[templateId]) {
    return NextResponse.json({ error: `unknown templateId: ${templateId}` }, { status: 400 });
  }
  const missing = validateTemplateProps(templateId, props ?? {});
  if (missing.length > 0) {
    return NextResponse.json({ error: `missing required props: ${missing.join(', ')}` }, { status: 400 });
  }
  if (!brand) {
    return NextResponse.json({ error: 'missing brand' }, { status: 400 });
  }

  const { width, height } = resolveAspect(aspect);
  const previewUrl = new URL('/render-preview', request.url);
  previewUrl.searchParams.set('templateId', templateId);
  previewUrl.searchParams.set('props', JSON.stringify(props));
  previewUrl.searchParams.set('aspect', aspect ?? 'square');
  previewUrl.searchParams.set('brand', JSON.stringify(brand));

  // 3. Render — adapted from carousel-routine reference scripts (research.md
  // Decision 9). Launch args: --no-sandbox/--disable-setuid-sandbox for
  // container/root; --disable-web-security for cross-origin asset images;
  // --font-render-hinting=none for consistent glyph rendering;
  // --disable-gpu for headless stability. Font-ready wait prevents the
  // system-font fallback bug. Explicit clip prevents viewport-only captures.
  // In Docker, PUPPETEER_EXECUTABLE_PATH is set via docker-compose env to
  // /usr/bin/chromium (apt-installed). Locally, Puppeteer uses its own
  // bundled Chromium — no env var needed in .env.local.
  const browser = await puppeteer.launch({
    headless: 'shell',
    // userDataDir + --disable-crash-reporter: the container's non-root user
    // (useradd --system, no real home dir) has nowhere for Chrome's crashpad
    // handler to write its crash database — confirmed live: "Failed to
    // launch the browser process... chrome_crashpad_handler: --database is
    // required". --disable-crash-reporter skips that subprocess outright;
    // userDataDir (backed by infra/Dockerfile.dashboard's writable
    // /tmp/.puppeteer-profile) covers whatever else needs a writable
    // profile dir. Puppeteer's own troubleshooting docs cover this exact
    // restricted-container failure mode.
    userDataDir: '/tmp/.puppeteer-profile',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--font-render-hinting=none',
      '--disable-gpu',
      '--disable-crash-reporter',
    ],
    protocolTimeout: 180_000,
  });
  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60_000);
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    const response = await page.goto(previewUrl.toString(), { waitUntil: 'networkidle0' });
    // page.goto() only rejects for network-level failures (DNS, connection
    // refused, timeout) — a transient non-2xx from /render-preview itself
    // (a cold-start hiccup, a DB blip) still "succeeds" as a navigation,
    // and Chrome swaps in its own "This page couldn't load" interstitial
    // in place of the real template. Confirmed live: a real published
    // post's render_url was literally a screenshot of that Chrome error
    // page, uploaded to R2 and reported as a successful render, because
    // nothing here checked the navigation's actual status before
    // screenshotting whatever was on screen.
    if (!response || !response.ok()) {
      throw new Error(
        `render-preview returned ${response ? response.status() : 'no response'} for templateId=${templateId}`
      );
    }
    // Wait for all <img> elements to fully load AND verify they actually
    // loaded successfully (not just complete=true). R2 images may be slow,
    // and networkidle0 doesn't guarantee they painted. A failure here used
    // to only log to the browser's own console (invisible outside
    // Puppeteer) and the render proceeded anyway, capturing a broken image
    // icon in place of the real product photo — now it fails the render
    // instead, same as the page-level check above.
    const failedImages = await page.evaluate(() =>
      Promise.all(
        Array.from(document.querySelectorAll('img')).map(
          (img) =>
            new Promise<string | null>((resolve) => {
              if (img.complete) {
                // naturalWidth=0 means the image failed to load (404, CORS, etc.)
                resolve(img.naturalWidth === 0 ? img.src : null);
                return;
              }
              img.onload = () => resolve(null);
              img.onerror = () => resolve(img.src);
            }),
        ),
      ).then((results) => results.filter((src): src is string => src !== null))
    );
    if (failedImages.length > 0) {
      throw new Error(`Image(s) failed to load during render: ${failedImages.join(', ')}`);
    }
    await page.evaluate(() => document.fonts.ready);
    const screenshot = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width, height },
    });

    // 4. Store + return.
    const key = `renders/${randomUUID()}.png`;
    await uploadBuffer(key, Buffer.from(screenshot), 'image/png');
    return NextResponse.json({ url: getPublicUrl(key) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'render failed' },
      { status: 502 }
    );
  } finally {
    await browser.close();
  }
}
