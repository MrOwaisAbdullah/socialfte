// Drop-in short-link service: schema + redirect route + management actions.
// Three files shown together; split into your project layout.

// ─────────────────────────────────────────────────────────────────────────────
// 1) Drizzle schema (lib/db/schema.ts)
// ─────────────────────────────────────────────────────────────────────────────
/*
export const shortLinks = pgTable('short_links', {
  id:             text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  code:           varchar('code', { length: 32 }).notNull().unique(),
  label:          text('label'),
  destinationUrl: text('destination_url').notNull(),
  utmSource:      varchar('utm_source', { length: 100 }),
  utmMedium:      varchar('utm_medium', { length: 100 }),
  utmCampaign:    varchar('utm_campaign', { length: 100 }),
  utmTerm:        varchar('utm_term', { length: 100 }),
  utmContent:     varchar('utm_content', { length: 100 }),
  clickCount:     integer('click_count').notNull().default(0),
  createdAt:      timestamptz('created_at').defaultNow().notNull(),
}, (t) => [index('short_links_code_idx').on(t.code)])
*/

// ─────────────────────────────────────────────────────────────────────────────
// 2) Redirect route — app/r/[code]/route.ts
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const [link] = await db.select().from(schema.shortLinks).where(eq(schema.shortLinks.code, code)).limit(1)

  // Unknown code → land somewhere sane, never a 404 dead-end.
  if (!link) return NextResponse.redirect(new URL('/', 'https://yourdomain.com'), { status: 302 })

  // Fire-and-forget click count — do NOT await; the redirect must be instant.
  void db.update(schema.shortLinks)
    .set({ clickCount: sql`${schema.shortLinks.clickCount} + 1` }) // atomic, no read-modify-write
    .where(eq(schema.shortLinks.code, code))

  const dest = new URL(link.destinationUrl)
  if (link.utmSource)   dest.searchParams.set('utm_source',   link.utmSource)
  if (link.utmMedium)   dest.searchParams.set('utm_medium',   link.utmMedium)
  if (link.utmCampaign) dest.searchParams.set('utm_campaign', link.utmCampaign)
  if (link.utmTerm)     dest.searchParams.set('utm_term',     link.utmTerm)
  if (link.utmContent)  dest.searchParams.set('utm_content',  link.utmContent)
  return NextResponse.redirect(dest.toString(), { status: 302 })
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) Management actions — lib/db/queries/links.ts  ('use server')
// ─────────────────────────────────────────────────────────────────────────────
/*
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { requirePlatformOwner } from '@/lib/auth/session'

const createSchema = z.object({
  label: z.string().max(120).optional(),
  destinationUrl: z.string().url().max(2000),
  code: z.string().regex(/^[a-z0-9_-]{2,32}$/).optional(),  // enforce charset to avoid route conflicts
  utmSource: z.string().max(100).optional(), // ...utmMedium/Campaign/Term/Content
})

export async function createShortLink(data: z.infer<typeof createSchema>) {
  await requirePlatformOwner()                              // gate management behind auth
  const parsed = createSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const code = parsed.data.code || randomUUID().slice(0, 8)
  const existing = await db.select({ id: schema.shortLinks.id })
    .from(schema.shortLinks).where(eq(schema.shortLinks.code, code)).limit(1)
  if (existing.length) return { error: 'Code already in use.' }
  const [row] = await db.insert(schema.shortLinks).values({ code, ...parsed.data }).returning()
  return { link: row }
}
*/
