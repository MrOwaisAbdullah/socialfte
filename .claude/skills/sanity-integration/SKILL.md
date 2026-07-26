---
name: sanity-integration
description: Build production Sanity CMS integrations with Next.js, SEO optimization, and MCP tools. This skill should be used when adding Sanity CMS for products, blogs, services, events, portfolios, or any content-managed features to websites. It handles schema design, API routes, SEO, image optimization, Live Content API, webhook-based revalidation, and reusable component patterns.
allowed-tools: Read, Write, Glob, Grep, Edit, mcp__context7__*, mcp__tavily__*
category: fullstack
version: 1.10.0
---

# Sanity CMS Integration

Build production-grade Sanity CMS integrations with Next.js, featuring SEO optimization, Next.js 15 ISR caching, React cache() memoization, webhook-based on-demand revalidation, and MCP-powered documentation lookup.

## Proficiency Progression Path

```
[A2] Setup → [A2] Images → [B1] Schema → [B1] Queries → [B1] API → [B1.5] Migration → [B2] ISR → [B2] SEO → [B2] Live
```

**Time Estimate**: 9-13 hours to complete all phases (A2→B2)

---

## Before Implementation

Gather context to ensure successful implementation:

| Source | Gather |
|--------|--------|
| **Codebase** | Existing Next.js version, current CMS (if any), routing patterns, styling approach |
| **Conversation** | Content types needed (blog, products, services, etc.), user's specific requirements |
| **Skill References** | Sanity patterns, schema templates, SEO best practices |
| **MCP Tools** | Use Context7 for latest Sanity/Next.js docs, Tavily for SEO/best practices research |

**STOP.** Before writing code, use MCP tools:
- **Context7 MCP**: `resolve-library-id` → `query-docs` for Sanity (`/sanity/sanity`), Next.js (`/vercel/next.js`)
- **Tavily MCP**: Search "Sanity CMS best practices 2025", "Next.js ISR caching patterns"

---

## Required Clarifications

Before implementation, clarify:

1. **Content Types**: What content types do you need? (blog, products, services, events, portfolio)
2. **Existing CMS**: Do you have an existing CMS to migrate from?
3. **Routing Approach**: App Router or Pages Router?

## Optional Clarifications

4. **Image Optimization**: Do you need responsive images with focal points?
5. **Live Content**: Will editors need preview/draft functionality?
6. **Localization**: Do you need multi-language support?

---

## Expected Outputs

After using this skill, you should have:

- [ ] Sanity project configured with environment variables
- [ ] Sanity Studio accessible at `/studio` route
- [ ] Content schemas defined in `sanity/schemaTypes/`
- [ ] Client utility in `sanity/lib/client.ts`
- [ ] Cached query utilities in `sanity/lib/queries.ts`
- [ ] Page components with ISR caching
- [ ] SEO metadata for dynamic routes
- [ ] Webhook endpoint for on-demand revalidation (if enabled)

---

## Phase 1: Sanity Setup & Configuration [A2]

**Prerequisites**: None | **Time**: 30 minutes | **Cognitive Load**: Low

### Success Criteria
- [ ] Dependencies installed without errors
- [ ] Environment variables configured
- [ ] Sanity Studio accessible at `/studio`

### Implementation Steps

1. **Install Dependencies**
   ```bash
   npm install next-sanity @sanity/image-url
   npm install -D sanity
   ```

2. **Create Sanity Project** (if new)
   ```bash
   npx sanity@latest init
   ```

3. **Configure Environment** (`sanity/env.ts`)
   ```typescript
   export const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || '';
   export const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production';
   export const apiVersion = '2024-01-01';
   ```

4. **Create Client** (`sanity/lib/client.ts`) - See `templates/api/route.ts` for pattern

### Templates
- `templates/api/route.ts` - API route pattern with ISR

---

## Phase 2: Image Optimization [A2]

**Prerequisites**: Phase 1 | **Time**: 30 minutes | **Cognitive Load**: Low

### Success Criteria
- [ ] Images display correctly with next/image
- [ ] Fallback placeholder in place for missing images
- [ ] Hotspots configured for manual cropping

### Key Implementation
```typescript
import { createImageUrlBuilder } from '@sanity/image-url';

const builder = createImageUrlBuilder({ projectId, dataset });
urlFor(source: any) => builder.image(source).url();
```

### Templates
- `templates/components/portable-text-components.tsx` - Image rendering

---

## Phase 3: Schema Design [B1]

**Prerequisites**: Phase 1 | **Time**: 1-2 hours | **Cognitive Load**: Medium

### Success Criteria
- [ ] Schema types defined in `sanity/schemaTypes/`
- - [ ] Proper references (author, categories)
- [ ] Preview configured
- [ ] Field validation rules

### Schema Templates
- `templates/schemas/postType.ts` - Blog post schema
- `templates/schemas/productType.ts` - Product schema
- `templates/schemas/serviceType.ts` - Service schema

### Reference
- `references/schema-patterns.md` - Complete schema design guide

---

## Phase 4: Query Patterns [B1]

**Prerequisites**: Phase 3 | **Time**: 1 hour | **Cognitive Load**: Medium

### Success Criteria
- [ ] Client configured with proper dataset
- [ ] Query utilities return typed data
- [ ] Error handling in place

### Key Pattern: Client Setup
```typescript
// sanity/lib/client.ts
export function getClient(): SanityClient {
  if (!projectId) throw new Error("Sanity client not configured");

  return createClient({
    projectId,
    dataset,
    apiVersion,
    useCdn: process.env.NODE_ENV === "production", // ✅ CDN in production
  });
}
```

### Reference
- `references/groq-cheatsheet.md` - GROQ query reference

---

## Phase 5: API Routes & ISR [B1]

**Prerequisites**: Phase 4 | **Time**: 1-2 hours | **Cognitive Load**: Medium

### Success Criteria
- [ ] API routes return Sanity data with ISR
- [ ] Revalidation times set appropriately
- [ ] Cache headers configured

### ISR Configuration
```typescript
export const revalidate = 3600; // 1 hour for most content
```

### Templates
- `templates/api/route.ts` - API route with ISR pattern

---

## Phase 6: Server Components & Pages [B1.5]

**Prerequisites**: Phase 5 | **Time**: 1-2 hours | **Cognitive Load**: Medium

### Success Criteria
- [ ] Server components fetch data directly from Sanity
- [ ] generateStaticParams for dynamic routes
- [ ] Error handling with notFound()

### Page Pattern
```typescript
// app/(marketing)/blog/page.tsx
import { getPosts } from "@/sanity/lib/queries";

export const revalidate = 3600;

export default async function BlogPage() {
  const posts = await getPosts(10);
  return <BlogList posts={posts} />;
}
```

### Templates
- `templates/pages/dynamic-route-page.tsx` - Dynamic route pattern

---

## Phase 7: Migration [B1.5]

**Prerequisites**: Existing codebase | **Time**: Variable | **Cognitive Load**: Medium

### Success Criteria
- [ ] Existing API routes migrated to direct fetch
- [ ] Client components converted to server components
- [ ] Old query patterns updated

### Reference
- `references/caching-strategies.md` - Next.js 15 migration guide

---

## Phase 8: Advanced Caching [B2]

**Prerequisites**: Phase 6 | **Time**: 2 hours | **Cognitive Load**: High

### Success Criteria
- [ ] `sanityFetch` helper implemented
- [ ] React `cache()` wrapping query utilities
- [ ] CDN enabled in production
- [ ] Webhook-based revalidation configured

### Core Patterns

**See:** `references/caching-strategies.md` for complete implementation

```typescript
// sanity/lib/client.ts
export async function sanityFetch({ query, revalidate = 3600, tags = [] }) {
  const client = getClient();
  return client.fetch(query, {}, {
    next: { revalidate: tags.length ? false : revalidate, tags },
  });
}

// sanity/lib/queries.ts
import { cache } from "react";
export const getPosts = cache(async () => sanityFetch({ query: "...", tags: ["posts"] }));
```

### Webhook Setup
**See:** `references/webhook-patterns.md` for complete webhook implementation

---

## Phase 9: SEO Optimization [B2]

**Prerequisites**: Phase 8 | **Time**: 2 hours | **Cognitive Load**: High

### Success Criteria
- [ ] Dynamic metadata for each page type
- [ ] Open Graph images configured
- [ ] Structured data (JSON-LD)
- [ ] sitemap.xml generated

### Reference
- `references/seo-guide.md` - Complete SEO guide

### Critical: JSON-LD + Next.js RSC Payload = Duplicate FAQPage

**Never render multiple separate `<script type="application/ld+json">` blocks on a Sanity blog post page in Next.js App Router.**

**Why it happens:**

When a Sanity blog post has FAQ data, the page renders:
1. An explicit `<script type="application/ld+json">{ "@type": "FAQPage", ... }</script>` via a server component
2. A Next.js RSC payload chunk (`self.__next_f.push(...)`) that includes the same `post.faq` data as serialized props passed to the client component (`BlogPostView`)

Google's structured data crawler scans ALL script content aggressively — it finds `@type: FAQPage` in BOTH scripts and reports **2 FAQPage items** with a "Duplicate field" critical error, making your rich results ineligible.

**The pattern that causes the bug:**
```tsx
// ❌ DON'T — 3 separate <script> blocks + RSC payload = Google sees FAQPage twice
<JsonLd schema={articleSchema(...)} />
<JsonLd schema={breadcrumbSchema(...)} />
{post.faq && <JsonLd schema={faqSchema(post.faq)} />}
<BlogPostView post={post} />  {/* 'use client' — post.faq ends up in RSC payload */}
```

**The fix — single `@graph` block:**
```tsx
// ✅ DO — one <script> block, Google finds exactly one FAQPage
<JsonLd schema={blogPostSchema({
  title: post.title,
  slug: post.slug,
  datePublished: post.publishedAt,
  faq: post.faq,   // included in @graph only, not as a separate block
})} />
<BlogPostView post={post} />
```

Where `blogPostSchema()` emits a single `{ "@context": "...", "@graph": [Article, BreadcrumbList, FAQPage] }` object. The RSC payload still contains `post.faq` data, but now there's no standalone `FAQPage` script for Google to combine it with.

**Rule:** Any schema type that also exists in client component props must be merged into a single `@graph` block, not emitted as a standalone `<script>` tag.

---

## Phase 10: Live Content API [B2]

**Prerequisites**: Phase 9 | **Time**: 1 hour | **Cognitive Load**: Medium

### Success Criteria
- [ ] Live mode configured in client
- [ ] Visual editing enabled
- [ ] Draft content preview working

### Configuration
```typescript
stega: {
  enabled: process.env.NODE_ENV === "development",
  studioUrl: "/studio",
  filter: (props) => {
    if (props.sourcePath.at(-1) === "url") return false;
    return props.filterDefault(props);
  },
}
```

---

## Troubleshooting

**See:** `references/troubleshooting.md` for complete debugging guide

### Quick Debug Checklist

1. [ ] Data visible in Sanity Studio?
2. [ ] API endpoint returns correct data?
3. [ ] Browser console shows fetch success?
4. [ ] `.next` cache cleared recently?
5. [ ] Environment variables loaded correctly?
6. [ ] Client configured with correct dataset?
7. [ ] Query uses proper projections?
8. [ ] Components use optional chaining for optional fields?

### Common Issues

| Issue | Solution |
|-------|----------|
| Content not updating | Check `useCdn: true` and revalidation time |
| Images not loading | Verify `asset->` dereference in projection |
| Build fails with image error | Add `unoptimized` prop to Image component |
| TypeScript errors | Use optional chaining `?.` for nullable fields |
| `@sanity/image-url` deprecation warning | Use named export `createImageUrlBuilder` instead of default import (see below) |

### Fix: `@sanity/image-url` Default Export Deprecation

The default export of `@sanity/image-url` is deprecated. Use the named export `createImageUrlBuilder` instead:

```typescript
// ❌ OLD — triggers deprecation warning
import ImageUrlBuilder from '@sanity/image-url'
const builder = ImageUrlBuilder({ projectId, dataset })

// ✅ NEW — no warning
import { createImageUrlBuilder } from '@sanity/image-url'
const builder = createImageUrlBuilder({ projectId, dataset })
```

Update all files that import from `@sanity/image-url` to use the named export.

---

## Reference Documentation

| File | Contents |
|------|----------|
| `references/README.md` | Index of all reference files |
| `references/webhook-patterns.md` | Complete webhook implementation |
| `references/caching-strategies.md` | Next.js 15 caching patterns |
| `references/troubleshooting.md` | Common issues and solutions |
| `references/schema-patterns.md` | Schema design patterns |
| `references/groq-cheatsheet.md` | GROQ query reference |
| `references/nextjs-isr.md` | ISR implementation patterns |
| `references/blog-rendering.md` | Blog-specific patterns |
| `references/seo-guide.md` | SEO optimization guide |

---

## Templates

| File | Purpose |
|------|---------|
| `templates/schemas/` | Schema type definitions |
| `templates/pages/` | Page component patterns |
| `templates/api/` | API route patterns |
| `templates/components/` | React component patterns |

---

## What's New (v1.10.0)

### Critical Production Issues Documentation

Added **"Critical Pitfalls"** sections documenting real production issues and their solutions:

- **`blog-rendering.md`**: Added 5 critical pitfalls section at top of file
  - The `results[0]` bug (#1 cause of 404s)
  - Missing `dynamicParams = true` for ISR
  - CDN vs ISR caching conflict
  - Missing fields in related posts query
  - Wrong webhook package for Next.js

- **`troubleshooting.md`**: Added critical issue sections
  - The `results[0]` bug explanation with code examples
  - "Cannot read properties of undefined" build error fix
  - CDN vs ISR caching configuration

- **`webhook-patterns.md`**: Added warning about correct package
  - Must use `next-sanity/webhook` not `@sanity/webhook`
  - Official implementation pattern with `parseBody`

These issues were encountered and resolved in production - documented to prevent recurrence.

### Previous Versions
- **v1.9.0**: Major refactoring - moved 2000+ lines to reference files
- **v1.8.1**: Fixed webhook signature verification format
- **v1.8.0**: Added complete webhook documentation

### Major Refactoring: Skill Structure Optimization

Reduced SKILL.md from 2618 lines to ~400 lines by moving detailed content to reference files:

- **NEW: `references/webhook-patterns.md`** - Complete webhook implementation
- **NEW: `references/caching-strategies.md`** - Next.js 15 caching patterns
- **NEW: `references/troubleshooting.md`** - Common issues and solutions
- **NEW: `references/README.md`** - Index of all references
- **NEW: Required/Optional Clarifications** section
- **NEW: Expected Outputs** checklist
- **UPDATED: Description** to third-person style ("This skill should be used when...")
- **REMOVED: 2000+ lines** of inline content (moved to references)

**Benefits:**
- Main skill file is now scannable and concise
- Detailed content is organized by topic
- Easier to maintain and update
- Better compliance with skill standards

### Previous Versions
- **v1.8.1**: Fixed webhook signature verification to match Sanity's actual format
- **v1.8.0**: Added complete webhook documentation and on-demand revalidation
- **v1.7.0**: Added Next.js 15 caching best practices with React cache()
