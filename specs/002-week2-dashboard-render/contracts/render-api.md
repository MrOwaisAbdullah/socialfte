# Render API Contract (Story 5)

## `POST /api/internal/render`

**Runtime**: must declare `export const runtime = 'nodejs'` — Puppeteer cannot run
on the Edge runtime (research.md Decision 4).

### Auth

Header `X-Render-Secret` (or equivalent) must equal `process.env.RENDER_INTERNAL_SECRET`.
Checked **before** any Puppeteer work begins (FR-013). Mismatch → `401`, no
rendering, no storage write, no partial side effects.

### Request body (JSON)

```ts
type RenderRequest = {
  templateId: string;               // a templates.slug value — hero | price-card | ...
  props: Record<string, unknown>;   // content for that template — shape is template-specific, see template-props.md
  aspect?: 'square' | 'feed' | 'reel';  // default 'square' (1080x1080); 'feed' = 1080x1350 (4:5); 'reel' = 1080x1920 (9:16)
  brand: BrandTokens;               // see template-props.md — read from BRAND.md, never invented server-side
};
```

### Behavior

1. Verify the shared secret (see Auth above) — reject before doing anything else.
2. Validate `templateId` against the known template registry; reject unknown ids
   with a `400` and a clear message (FR-014) — do not attempt to render.
3. Validate `props` has the fields the named template requires; reject with a
   `400` naming the missing/invalid field(s) rather than rendering a broken image.
4. Resolve pixel dimensions from `aspect`:
   | `aspect` | Pixels |
   |---|---|
   | `square` (default) | 1080×1080 |
   | `feed` | 1080×1350 |
   | `reel` | 1080×1920 |
5. Launch Puppeteer with `executablePath: process.env.PUPPETEER_EXECUTABLE_PATH`
   (research.md Decision 5).
6. Navigate to `/render-preview?templateId=...&props=<url-encoded JSON>&aspect=...&brand=<url-encoded JSON>`
   at the resolved viewport size.
7. Screenshot the page (PNG, no navigation/chrome visible — that page has none by
   construction, see FR-015).
8. Upload the PNG via the R2 client (`uploadBuffer`, see `r2-client.md`) under key
   `renders/{uuid}.png` (fresh UUID per render).
9. Return `{ "url": "<R2_PUBLIC_URL>/renders/{uuid}.png" }`.

### Error responses

| Status | When |
|---|---|
| 401 | Missing/incorrect `RENDER_INTERNAL_SECRET` |
| 400 | Unknown `templateId`, or `props` missing a required field for that template |
| 500 | Puppeteer/render failure, or the R2 upload failed — must not still return a `url` |

## `GET /render-preview` (headless page, not part of the public API)

Reads `templateId`, `props` (JSON, URL-decoded), `aspect`, and `brand` (JSON,
URL-decoded) from `searchParams`. **Must be an `async` component that `await`s
`searchParams`** — it is a `Promise` in Next.js 15 (research.md Decision 4), not a
plain object.

Renders exactly the named template component with the given `props`/`brand`/
`aspect` and nothing else — no `<nav>`, no header/footer, no app chrome (FR-015).
This page is never linked to from the dashboard UI; it exists only for Puppeteer
to screenshot.
