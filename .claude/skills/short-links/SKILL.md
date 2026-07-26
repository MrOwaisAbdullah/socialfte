---
name: short-links
description: |
  Build a self-hosted short-link / redirect service in Next.js: a code-based redirect
  route, code generation, UTM parameter injection, and fire-and-forget click tracking.
  This skill should be used when implementing branded short URLs, campaign tracking links,
  /r/[code] redirects, or any code-to-destination redirect with analytics.
---

# Short Links + Redirect Service

A `/r/{code}` route that looks up a destination, appends UTM params, counts the click without
slowing the redirect, and 302s the visitor onward.

## Before Implementation

| Source | Gather |
|--------|--------|
| Codebase | `short_links` table, `app/r/[code]/route.ts`, the create/list/delete queries, who can manage links |
| Conversation | Branded vs random codes? UTM needed? Who manages links (owner-only)? Custom-domain redirects? |

## Clarifications

**Required:**
1. Branded codes (user-chosen) allowed, or random only?
2. Who manages links — platform owner only, or any authenticated user?

**Optional (infer if unstated):**
3. UTM injection needed (default yes)?
4. Redirect status — 302 (temporary, default) or 301 (permanent, cached by browsers)?

If unanswered, default to: both branded + random codes, owner-only management, UTM on, 302 redirects.

## Documentation & sources

| Resource | URL | Use for |
|----------|-----|---------|
| Next.js Route Handlers | https://nextjs.org/docs/app/building-your-application/routing/route-handlers | `app/r/[code]/route.ts` |
| Next.js redirects | https://nextjs.org/docs/app/api-reference/functions/next-response#redirect | `NextResponse.redirect` |
| UTM parameters | https://support.google.com/analytics/answer/10917952 | utm_* conventions |

## Schema (`short_links`)

```
id, code (unique, indexed), label (nullable), destination_url,
utm_source, utm_medium, utm_campaign, utm_term, utm_content (all nullable),
click_count int default 0, created_at
```

## The redirect route (`app/r/[code]/route.ts`)

```ts
export async function GET(_req, { params }) {
  const { code } = await params
  const [link] = await db.select().from(schema.shortLinks).where(eq(schema.shortLinks.code, code)).limit(1)
  if (!link) return NextResponse.redirect(new URL('/', 'https://yourdomain.com'), { status: 302 })

  // Count the click WITHOUT awaiting — never make the visitor wait on analytics.
  void db.update(schema.shortLinks)
    .set({ clickCount: sql`${schema.shortLinks.clickCount} + 1` })
    .where(eq(schema.shortLinks.code, code))

  const dest = new URL(link.destinationUrl)
  for (const [k, v] of [['utm_source', link.utmSource], ['utm_medium', link.utmMedium],
       ['utm_campaign', link.utmCampaign], ['utm_term', link.utmTerm], ['utm_content', link.utmContent]] as const) {
    if (v) dest.searchParams.set(k, v)
  }
  return NextResponse.redirect(dest.toString(), { status: 302 })
}
```

Key points:
- **Don't `await` the click increment** — fire-and-forget so the redirect is instant.
- **Unknown code → redirect home (302)**, not a 404 page; a dead link should still land somewhere sane.
- Use `sql\`click_count + 1\`` (atomic increment), not read-modify-write.

## Create / manage (server actions)

- Validate with Zod: `destinationUrl` (url, max length), optional `code` (`^[a-z0-9_-]{2,32}$`), optional UTM fields.
- Generate a code when none given: `randomUUID().slice(0, 8)`.
- Check uniqueness before insert; return a friendly error on collision.
- **Guard management actions** (create/list/delete) behind an owner/admin check — short links are a marketing-ops tool, not public.

## Anti-patterns

- ❌ Awaiting the click count → adds DB latency to every redirect.
- ❌ 404 on unknown code → dead-ends the visitor; redirect home instead.
- ❌ Read-modify-write on `click_count` → race conditions; use SQL atomic increment.
- ❌ Accepting arbitrary code strings → enforce a charset/length regex (avoids route conflicts, injection-y codes).
- ❌ Open create endpoint → spam/abuse; require auth.
- ❌ Redirecting to an unvalidated `destination_url` → validate as a URL on create.

## Validation
- A known code 302s to the destination with UTM params appended.
- An unknown code redirects home.
- Click count increments and the redirect is not blocked by it.
- Code collisions are rejected with a clear message.
