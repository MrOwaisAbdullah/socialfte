# Sanity CMS Caching Strategies for Next.js 15

Complete guide to implementing efficient caching with Sanity CMS and Next.js 15.

## Overview

Next.js 15 changed how fetch caching works. Understanding these changes is critical for:
- Minimizing Sanity API requests (staying within free plan limits)
- Fast page loads through proper caching
- Fresh content after Sanity Studio changes

---

## Key Changes: Next.js 14 vs 15

| Aspect | Next.js 14 | Next.js 15 |
|--------|-------------|-------------|
| **Default fetch caching** | Aggressive (cached) | Opt-out (no cache) |
| **Required action** | Nothing | Must set `cache: 'force-cache'` or `next: { revalidate }` |
| **useCdn recommendation** | false for ISR | true in production |
| **Cache invalidation** | Automatic | Explicit (tags or time-based) |

---

## Core Pattern: `sanityFetch` Helper

Centralized caching configuration for all Sanity queries.

```typescript
// sanity/lib/client.ts
export async function sanityFetch<constQueryString extends string>({
  query,
  params = {},
  revalidate = 3600, // Default: 1 hour for most content
  tags = [],
}: {
  query: constQueryString;
  params?: QueryParams;
  revalidate?: number | false;
  tags?: string[];
}) {
  const client = getClient();
  if (!client) {
    throw new Error("Sanity client is not configured");
  }

  // Next.js 15 cache configuration:
  // When tags are provided, use tag-based caching (revalidate: false)
  // Otherwise, use time-based revalidation
  const nextConfig: { revalidate?: number | false; tags?: string[] } = {
    tags,
  };
  if (tags.length) {
    nextConfig.revalidate = false; // Webhook will revalidate
  } else {
    nextConfig.revalidate = revalidate; // Time-based fallback
  }

  return client.fetch(query, params, {
    next: nextConfig,
  });
}
```

---

## Core Pattern: Cached Query Utilities

Use React `cache()` for automatic request deduplication.

```typescript
// sanity/lib/queries.ts
import { cache } from "react";
import { sanityFetch } from "./client";

// Memoized query - automatic deduplication
export const getPosts = cache(async (limit = 10) => {
  return sanityFetch({
    query: `*[_type == "post"] | order(publishedAt desc)[0...${limit}] {
      _id,
      title,
      "slug": slug.current,
      excerpt,
      mainImage { asset-> { _id, url }, alt },
      author-> { _id, name, "slug": slug.current },
      categories[]-> { _id, name, "slug": slug.current },
      publishedAt
    }`,
    revalidate: 3600, // 1 hour
    tags: ["posts"], // For webhook revalidation
  });
});

export const getPostBySlug = cache(async (slug: string) => {
  return sanityFetch({
    query: `*[_type == "post" && slug.current == $slug][0]{
      _id,
      title,
      "slug": slug.current,
      excerpt,
      content,
      mainImage { asset-> { _id, url }, alt },
      author-> { _id, name, bio, "slug": slug.current, image { asset-> { _id, url } } },
      categories[]-> { _id, name, "slug": slug.current },
      publishedAt,
      seoTitle,
      seoDescription
    }`,
    params: { slug },
    revalidate: 3600,
    tags: ["posts", `post:${slug}`], // Granular revalidation
  });
});
```

---

## Recommended Revalidation Times

| Content Type | Revalidate | Rationale |
|--------------|-----------|-----------|
| **Blog Posts** | 3600s (1 hour) | Content doesn't change often after publish |
| **Blog Detail** | 3600s (1 hour) | Same as listing |
| **Careers** | 1800s (30 min) | Job postings change moderately |
| **Team Members** | 3600s (1 hour) | Team changes infrequently |
| **Services** | 86400s (24 hours) | Rarely changes |
| **Testimonials** | 3600s (1 hour) | Occasionally updated |
| **Success Stories** | 3600s (1 hour) | Occasionally updated |
| **Site Settings** | 86400s (24 hours) | Very static |

---

## Client Configuration

Enable CDN in production for better performance.

```typescript
// sanity/lib/client.ts
export function getClient(): SanityClient {
  if (_client) return _client;

  const client = createClient({
    projectId,
    dataset,
    apiVersion,
    useCdn: process.env.NODE_ENV === "production", // ✅ Enable CDN in production
    stega: {
      enabled: process.env.NODE_ENV === "development",
      studioUrl: "/studio",
    },
  });

  _client = client;
  return _client;
}
```

---

## Query Optimization Patterns

### Prevent Duplicate Requests

**Problem:** Same data fetched multiple times during render
```typescript
// ❌ BAD - Fetches multiple times
const post1 = await client.fetch(query1);
const post2 = await client.fetch(query1); // Duplicate!
```

**Solution:** Use React `cache()` wrapper
```typescript
// ✅ GOOD - Duplicates automatically memoized
export const getPost = cache(async (slug) => {
  return client.fetch(query);
});
```

### Prevent Over-Fetching

**Problem:** Fetching all fields when only need a few
```typescript
// ❌ BAD - Fetches entire document
*[_type == "post"] { ... }  // ALL fields
```

**Solution:** Project only needed fields
```typescript
// ✅ GOOD - Only fetch what's needed
*[_type == "post"]{
  _id,
  title,
  "slug": slug.current,
  excerpt
}
```

### Use Specific Filters

**Problem:** Fetching all documents then filtering in JS
```typescript
// ❌ BAD - Fetches all, filters later
const allPosts = await client.fetch(`*[_type == "post"]`);
const activePosts = allPosts.filter(p => p.isActive);
```

**Solution:** Filter in GROQ
```typescript
// ✅ GOOD - Database filters
const activePosts = await client.fetch(`*[_type == "post" && isActive == true]`);
```

---

## Page-Level Configuration

### Blog Listing Page

```typescript
// app/(marketing)/blog/page.tsx
import { getPosts } from "@/sanity/lib/queries";

export const revalidate = 3600; // 1 hour

export default async function BlogPage() {
  const posts = await getPosts(10);
  // Render posts...
}
```

### Blog Detail Page

```typescript
// app/(marketing)/blog/[slug]/page.tsx
import { getPostBySlug, getRelatedPosts } from "@/sanity/lib/queries";

export const revalidate = 3600; // 1 hour

export async function generateStaticParams() {
  const posts = await getAllPostSlugs();
  return posts.map((post) => ({ slug: post.slug }));
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  const related = await getRelatedPosts(post._id, 3);
  // Render post...
}
```

---

## Sanity Free Plan Usage

### Resource Limits

| Resource | Limit | Expected Usage (2-5k visits/month) | Buffer |
|-----------|-------|-----------------------------------|--------|
| API Requests | 200k/month | ~10k-30k | 85%+ remaining |
| CDN Requests | 1M/month | ~50k-150k | 85%+ remaining |
| Bandwidth | 20GB | ~5-10GB | 50%+ remaining |

### Usage Calculation

With proper caching:
- **Homepage**: 1 API request per 24 hours = ~30 requests/month
- **Blog listing**: 1 API request per hour = ~720 requests/month
- **Blog posts (10 posts)**: 10 requests per hour = ~7,200 requests/month
- **Careers**: 1 request per 30 minutes = ~1,440 requests/month

**Total**: ~10k requests/month (5% of free plan)

---

## Best Practices Summary

1. **Use CDN in production** - Set `useCdn: true` for better performance
2. **Time-based revalidation** - Default to 1 hour for most content
3. **Tag-based for immediate updates** - Use webhooks for critical content
4. **React `cache` for memoization** - Prevents duplicate requests in same render
5. **Direct client in server components** - Avoid API route overhead
6. **Optimize related posts queries** - Only fetch needed fields, not all posts
7. **Specific GROQ filters** - Let Sanity do the filtering, not JavaScript
8. **Project only needed fields** - Reduce data transfer and processing

---

## See Also

- `references/webhook-patterns.md` - Complete webhook setup for on-demand revalidation
- `references/troubleshooting.md` - Common caching issues and solutions
