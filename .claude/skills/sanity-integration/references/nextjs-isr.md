# Next.js ISR & Caching Strategies

## Understanding Caching in Next.js 15

### Cache Hierarchy

```
Browser → CDN (Vercel) → Next.js Server → Sanity API
```

### Cache Strategy Decision Tree

```
Content Type
├── Static (rarely changes)
│   └→ Use: generateStaticParams + dynamic = "force-static"
├── Semi-static (changes periodically)
│   └→ Use: revalidate = N (ISR)
├── Dynamic (changes frequently)
│   └→ Use: fetch with { next: { tags: [] } }
└── Real-time (user-specific)
    └→ Use: Client-side fetch or route handlers
```

## Static Generation (force-static)

**Use for:** Homepage, about pages, static content

```typescript
export const dynamic = "force-static"

export async function generateStaticParams() {
  const items = await client.fetch(`*[_type == "page"]{
    "slug": slug.current
  }`)

  return items.map((item: { slug: string }) => ({ slug: item.slug }))
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const page = await client.fetch(`*[_type == "page" && slug.current == "${slug}"]`)
  // ...
}
```

**Benefits:**
- Fastest performance (served from CDN)
- No database queries on requests
- Best for SEO

**When to use:**
- Content that rarely changes
- No personalization needed
- Build-time generation acceptable

## Incremental Static Regeneration (ISR)

**Use for:** Blog posts, products, services (changes periodically)

```typescript
// Revalidate every 60 seconds
export const revalidate = 60

export const dynamicParams = true

export async function generateStaticParams() {
  const posts = await client.fetch(`*[_type == "post"]{
    "slug": slug.current
  }`)

  return posts.map((post: { slug: string }) => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  // Metadata also benefits from ISR
  return {
    title: "...",
  }
}
```

**Benefits:**
- Fast (served from CDN)
- Updates automatically in background
- No full rebuild needed

**When to use:**
- Content updates periodically (not instantly)
- Multiple pages of same type
- Can accept slightly stale content

## On-Demand Revalidation (Tags)

**Use for:** E-commerce inventory, user dashboards, frequently changing content

```typescript
import { unstable_cacheLife } from 'next/cache'

export async function GET() {
  const products = await client.fetch(
    `*[_type == "product"]{
      title,
      slug,
      price,
      inStock
    }`,
    {
      next: {
        tags: ['products'],
        // OR
        revalidate: 60,
      }
    }
  )

  return Response.json(products)
}

// Server Action for revalidation
'use server'

import { revalidateTag } from 'next/cache'

export async function revalidateProduct(slug: string) {
  // Trigger revalidation
  revalidateTag(`product:${slug}`)
}
```

**Benefits:**
- Instant updates when content changes
- Control over cache invalidation
- Can use tags for granular invalidation

**When to use:**
- Content needs instant updates
- E-commerce inventory
- User-generated content

## Client-Side Fetching

**Use for:** Real-time data, user-specific content, frequent updates

```typescript
"use client"

import { useEffect, useState } from 'react'

export function UserProfile() {
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    async function fetchProfile() {
      const response = await fetch('/api/profile')
      const data = await response.json()
      setProfile(data)
    }

    fetchProfile()
  }, [])

  if (!profile) return <Skeleton />

  return <ProfileDisplay profile={profile} />
}
```

**When to use:**
- User-specific data
- Frequently changing content
- Requires authentication

## Cache Configuration

### Environment Variables

```bash
# .env.local
NEXT_PUBLIC_SANITY_PROJECT_ID=...
NEXT_PUBLIC_SANITY_DATASET=production
```

### Client Configuration

**v8+ Stega Configuration (Recommended):**
```typescript
// sanity/lib/client.ts
import { createClient } from 'next-sanity'

export const client = createClient({
  projectId,
  dataset,
  apiVersion: '2024-01-01',

  // CDN: Disable for ISR, enable for static content
  useCdn: false,

  // Stega: Visual editing with Sanity Studio (v8+)
  stega: {
    enabled: process.env.NODE_ENV === 'development',
    studioUrl: '/studio',
    // Optional: Filter sensitive fields from visual editing
    filter: (props) => {
      if (props.sourcePath.at(-1) === 'url') {
        return false
      }
      return props.filterDefault(props)
    },
  },
})
```

**Legacy Configuration:**
```typescript
export const client = createClient({
  projectId,
  dataset,
  apiVersion: '2024-01-01',
  useCdn: process.env.NODE_ENV === 'production',
  stega: process.env.NODE_ENV === 'development', // Simple boolean
})
```

**useCdn Guidelines:**
| Content Type | useCdn |
|-------------|---------|
| Static pages | `true` |
| ISR pages | `false` (may serve stale content) |
| Real-time | `false` |
| Preview mode | `false` |

## Advanced Patterns

### Route Segment Config

```typescript
// app/[content]/[slug]/page.tsx
export const revalidate = 300  // 5 minutes
export const dynamicParams = true
export const dynamic = "force-static"  // Build-time static for known paths

// Alternative: Mixed strategy
export const dynamic = "force-dynamic"  // Always server-render
```

### Fetch with Custom Cache

```typescript
const cachedFetch = unstable_cache(
  async (slug: string) => {
    return await client.fetch(
      `*[_type == "post" && slug.current == "${slug}"]{title, content}`
    )
  },
  {
    revalidate: 60,
    tags: [`post:${slug}`],
  }
)
```

### Parallel Fetching

```typescript
// Fetch in parallel for better performance
const [post, relatedPosts] = await Promise.all([
  client.fetch(`*[_type == "post" && slug.current == "${slug}"]`),
  client.fetch(`*[_type == "post" && _id != $currentId][0...3]`),
])
```

## Revalidation Strategies

### Time-Based Revalidation

```typescript
// Revalidate every N seconds
export const revalidate = 60  // 1 minute
```

### On-Demand Revalidation

```typescript
// Triggered by:
// 1. Webhook from Sanity
// 2. Server action
// 3. API route

'use server'

import { revalidatePath } from 'next/cache'

export async function revalidateContent() {
  revalidatePath('/blog')
  revalidatePath('/blog/[slug]')
}
```

### Tag-Based Revalidation

```typescript
'use server'

import { revalidateTag } from 'next/cache'

// Revalidate specific tag
export async function revalidatePost(slug: string) {
  revalidateTag(`post:${slug}`)
}

// Revalidate all posts
export async function revalidateAllPosts() {
  revalidateTag('posts')
}
```

## Webhook Integration

### Sanity GROQ Webhook

```typescript
// app/api/revalidate/route.ts
import { revalidateTag } from 'next/cache'
import { verifySignature } from '@/sanity/lib/webhook'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Verify webhook signature
    const isValid = await verifySignature(body)

    if (!isValid) {
      return Response.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // Extract info from webhook payload
    const { slug, _type } = body

    // Revalidate based on content type
    if (_type === 'post') {
      revalidateTag(`post:${slug}`)
      revalidateTag('posts')
    }

    return Response.json({ revalidated: true })
  } catch (error) {
    console.error('Revalidation error:', error)
    return Response.json({ error: 'Revalidation failed' }, { status: 500 })
  }
}
```

### Webhook Signature Verification

```typescript
// sanity/lib/webhook.ts
import { isValidSignature, getSignature } from '@sanity/webhook'

const secret = process.env.SANITY_WEBHOOK_SECRET as string

export async function verifySignature(body: any) {
  const signature = getSignature(body, secret)
  const header = request.headers.get('x-sanity-webhook-signature')

  if (!header) return false

  return isValidSignature(header, signature, secret)
}
```

## Best Practices

### DO's

1. **Use ISR for semi-static content** - Blog posts, products, services
2. **Use force-static for static content** - About pages, homepage
3. **Always project specific fields** - Never fetch entire documents
4. **Set appropriate revalidate times** - Balance freshness vs performance
5. **Use tags for on-demand updates** - E-commerce, user dashboards
6. **Cache at API route level** - Add Cache-Control headers
7. **Revalidate selectively** - Only invalidate what changed

### DON'Ts

1. **Don't useCdn: true with ISR** - May serve stale content
2. **Don't fetch all fields** - Always use GROQ projections
3. **Don't revalidate too frequently** - Causes unnecessary API calls
4. **Don't use fetch in Server Components without proper caching**
5. **Don't forget to await params** - Next.js 15 requires it

## Performance Metrics

| Strategy | TTFB (Time to First Byte) | Updates |
|----------|----------------------------|---------|
| **force-static** | Fastest | Build-time only |
| **ISR (revalidate)** | Fast | Periodic background updates |
| **On-demand (tags)** | Fast | Instant on-demand |
| **Client fetch** | Slower | Real-time |

## Monitoring

### Cache Hit Rate Monitoring

```typescript
export async function GET() {
  const posts = await client.fetch(query, {
    cache: 'force-cache',  // Force cache
    next: { revalidate: 60 },
  })

  return Response.json(posts, {
    headers: {
      'x-cache': 'HIT',
    },
  })
}
```

### Cache Header Patterns

```typescript
// Static content (1 day)
'Cache-Control': 'public, max-age=86400, stale-while-revalidate=86400'

// ISR (1 minute, 5 minutes stale)
'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'

// On-demand (cache until revalidation)
'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=3600'
```

## Troubleshooting

### Content Not Updating

1. **Check revalidate value** - Too high means long refresh time
2. **Check CDN settings** - May be caching at edge
3. **Check browser cache** - May need hard refresh
4. **Check tags** - Not matching between fetch and revalidation
5. **Check webhooks** - Sanity webhooks not firing?

### Slow Performance

1. **Reduce query size** - Use GROQ projections
2. **Increase revalidate time** - Reduce server load
3. **Enable CDN** - Set useCdn: true (when not using ISR)
4. **Parallel fetch** - Use Promise.all() for independent queries
5. **Check Sanity query performance** - Use Sanity's query logs

### Build Size Issues

1. **Don't fetch unused fields** - Projections reduce data transfer
2. **Use dynamic imports** - For client-side heavy components
3. **Avoid huge image payloads** - Use image optimization

## Live Content API (Real-Time Updates)

**New in next-sanity v8+**: The Live Content API provides real-time content updates without webhooks or manual revalidation. Content updates automatically trigger revalidation via server-sent events.

### Setup Live Content API

```typescript
// sanity/lib/live.ts
import { createClient } from 'next-sanity'
import { defineLive } from 'next-sanity/live'

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
  useCdn: false, // Required for live content
  apiVersion: '2025-01-01',
  stega: {
    enabled: process.env.NODE_ENV === 'development',
    studioUrl: '/studio',
  },
})

// Requires SANITY_API_READ_TOKEN with Viewer rights
const token = process.env.SANITY_API_READ_TOKEN
if (!token) {
  throw new Error('Missing SANITY_API_READ_TOKEN')
}

export const { sanityFetch, SanityLive } = defineLive({
  client,
  serverToken: token,
  browserToken: token,
})
```

### Using sanityFetch in Components

```typescript
// app/blog/[slug]/page.tsx
import { sanityFetch, SanityLive } from '@/sanity/lib/live'
import { PortableText } from '@portabletext/react'

export const revalidate = 60

export async function generateStaticParams() {
  const { data: posts } = await sanityFetch({
    query: `*[_type == "post"]{ "slug": slug.current }`,
    perspective: 'published',
  })

  return posts.map((post: any) => ({ slug: post.slug }))
}

export default async function BlogPost({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const { data: post } = await sanityFetch({
    query: `*[_type == "post" && slug.current == $slug][0]{
      title,
      content,
      publishedAt
    }`,
    params: { slug },
    perspective: 'published',
  })

  return (
    <article>
      <h1>{post.title}</h1>
      <PortableText value={post.content} />
      <SanityLive /> {/* Enables real-time updates */}
    </article>
  )
}
```

### Live Content API Benefits

| Feature | Description |
|---------|-------------|
| **Real-time updates** | Content changes appear instantly without refresh |
| **No webhooks needed** | Eliminates webhook signature verification complexity |
| **Automatic revalidation** | Next.js cache invalidates automatically |
| **Draft mode support** | Preview unpublished content with `perspective: 'previewDrafts'` |
| **Server-sent events** | Efficient push-based updates (no polling) |

### Environment Variables Required

```bash
# .env.local
NEXT_PUBLIC_SANITY_PROJECT_ID=your_project_id
NEXT_PUBLIC_SANITY_DATASET=production
SANITY_API_READ_TOKEN=your_token_with_viewer_rights
```

### Perspective Modes

```typescript
// Published content only (production)
sanityFetch({ perspective: 'published', query: '...' })

// Include drafts (preview mode)
sanityFetch({ perspective: 'previewDrafts', query: '...' })

// Raw drafts only (editing)
sanityFetch({ perspective: 'raw', query: '...' })
```

### When to Use Live Content API vs ISR

| Scenario | Recommended Approach |
|----------|---------------------|
| **Content editors need instant updates** | Live Content API |
| **Simpler setup, no tokens** | Traditional ISR |
| **Preview unpublished content** | Live Content API with `previewDrafts` |
| **High-traffic production** | ISR with CDN + webhook revalidation |
| **Real-time collaboration** | Live Content API |
