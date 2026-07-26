# SEO Implementation Guide for Sanity + Next.js

## Dynamic Metadata Generation

### Basic Pattern

```typescript
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params

  const query = `*[_type == "post" && slug.current == "${slug}"]{
    title,
    summary,
    mainImage,
    seoTitle,
    seoDescription
  }[0]`

  const post = await client.fetch(query)

  return {
    title: post.seoTitle || post.title,
    description: post.seoDescription || post.summary,
    openGraph: {
      title: post.seoTitle || post.title,
      description: post.seoDescription || post.summary,
      url: `https://yourdomain.com/blog/${slug}`,
      images: [{
        url: urlFor(post.mainImage).width(1200).height(630).url(),
        width: 1200,
        height: 630,
        alt: post.title,
      }],
    },
    twitter: {
      card: "summary_large_image",
      title: post.seoTitle || post.title,
      description: post.seoDescription || post.summary,
      images: [urlFor(post.mainImage).url()],
    },
    alternates: {
      canonical: `/blog/${slug}`,
    },
  }
}
```

## SEO Fields for Schemas

### Blog Post Schema

```typescript
export const postType = defineType({
  name: "post",
  title: "Post",
  type: "document",
  fields: [
    defineField({ name: "title", type: "string" }),
    defineField({ name: "slug", type: "slug" }),
    // SEO Fields
    defineField({
      name: "seoTitle",
      title: "SEO Title",
      type: "string",
      description: "Custom title for search engines (60 chars max)",
      validation: (Rule) => Rule.max(60),
    }),
    defineField({
      name: "seoDescription",
      title: "SEO Description",
      type: "text",
      rows: 3,
      description: "Meta description for search results (160 chars max)",
      validation: (Rule) => Rule.max(160),
    }),
    defineField({
      name: "focusKeyword",
      title: "Focus Keyword",
      type: "string",
      description: "Primary keyword for SEO",
    }),
    defineField({
      name: "metaKeywords",
      title: "Meta Keywords",
      type: "array",
      of: [{ type: "string" }],
      description: "Additional keywords (comma-separated in meta tag)",
    }),
    defineField({
      name: "ogImage",
      title: "Open Graph Image",
      type: "image",
      description: "Override main image for social sharing",
      options: { hotspot: true },
    }),
    defineField({
      name: "noIndex",
      title: "No Index",
      type: "boolean",
      description: "Prevent search engines from indexing this page",
      initialValue: false,
    }),
    // ... other fields
  ],
})
```

## JSON-LD Structured Data

### Article Schema

```typescript
// Add to page component
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: post.title,
  description: post.summary,
  image: urlFor(post.mainImage).url(),
  author: {
    "@type": "Person",
    name: post.author.name,
  },
  datePublished: post.publishedAt,
  dateModified: post._updatedAt,
}

// Include in layout or page
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
/>
```

### Product Schema

```typescript
const productJsonLd = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: product.title,
  description: product.description,
  image: urlFor(product.mainImage).url(),
  offers: {
    "@type": "Offer",
    price: product.price,
    priceCurrency: "USD",
    availability: product.inStock
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock",
  },
}
```

### Breadcrumb Schema

```typescript
const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: "https://yourdomain.com",
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Blog",
      item: "https://yourdomain.com/blog",
    },
    {
      "@type": "ListItem",
      position: 3,
      name: post.title,
      item: `https://yourdomain.com/blog/${post.slug}`,
    },
  ],
}
```

## Sitemap Generation

### Dynamic Sitemap

```typescript
// app/sitemap.ts
import { MetadataRoute } from 'next'
import { client } from '@/sanity/lib/client'

export default async function sitemap(): MetadataRoute {
  const baseUrl = 'https://yourdomain.com'

  // Fetch all content
  const posts = await client.fetch(`*[_type == "post"]{ "slug": slug.current, _updatedAt }`)
  const pages = await client.fetch(`*[_type == "page"]{ "slug": slug.current, _updatedAt }`)
  const products = await client.fetch(`*[_type == "product"]{ "slug": slug.current, _updatedAt }`)

  const routes = [
    '', // Homepage
    ...posts.map((post: any) => ({
      url: `${baseUrl}/blog/${post.slug}`,
      lastModified: new Date(post._updatedAt),
    })),
    ...pages.map((page: any) => ({
      url: `${baseUrl}/${page.slug}`,
      lastModified: new Date(page._updatedAt),
    })),
    ...products.map((product: any) => ({
      url: `${baseUrl}/products/${product.slug}`,
      lastModified: new Date(product._updatedAt),
    })),
  ]

  return routes
}
```

### robots.txt Pattern

```typescript
// app/robots.ts
import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/studio/', '/api/'],
    },
    sitemap: 'https://yourdomain.com/sitemap.xml',
  }
}
```

## Canonical URLs

### Prevent Duplicate Content

```typescript
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  return {
    alternates: {
      canonical: `/blog/${slug}`,
      // Handle variations
      languages: {
        'en-US': `/en-US/blog/${slug}`,
        'es': `/es/blog/${slug}`,
      },
    },
  }
}
```

## Image SEO

### Optimize Social Sharing Images

```typescript
// Add to Sanity image schema
defineField({
  name: "ogImage",
  title: "Social Image",
  type: "image",
  options: { hotspot: true },
  fields: [
    defineField({ name: "alt", type: "string" }),
    defineField({
      name: "width",
      type: "number",
      initialValue: 1200,
    }),
    defineField({
      name: "height",
      type: "number",
      initialValue: 630,
    }),
  ],
  validation: (Rule) => Rule.required(),
})

// Use in metadata
images: [{
  url: urlFor(post.ogImage || post.mainImage)
    .width(1200)
    .height(630)
    .fit('crop')
    .url(),
  width: 1200,
  height: 630,
  alt: post.title,
}]
```

## Performance SEO

### Image Optimization with Next.js Image

```typescript
import Image from 'next/image'

<Image
  src={urlFor(post.mainImage).url()}
  alt={post.mainImage.alt || post.title}
  width={800}
  height={450}
  priority={false}
  placeholder="blur"
  blurDataURL={urlFor(post.mainImage)
    .width(20)
    .height(20)
    .blur(10)
    .url()}
/>
```

### Preload Critical Images

```typescript
// Add to layout head
export async function generateMetadata({ params }) {
  const post = await getPost(params)

  return {
    other: {
      images: {
        rel: 'preload',
        url: urlFor(post.mainImage).width(800).height(450).url(),
        fetchPriority: 'high',
      },
    },
  }
}
```

## Caching Strategy

### API Route Caching

```typescript
// ISR for semi-static content
export const revalidate = 3600 // Revalidate every hour

export async function GET() {
  const posts = await client.fetch(query)

  return NextResponse.json(posts, {
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
    },
  })
}
```

### Tag-Based Revalidation

```typescript
// Server Action for revalidation
'use server'

import { revalidateTag } from 'next/cache'
import { client } from '@/sanity/lib/client'

export async function revalidatePost(slug: string) {
  try {
    await client.fetch(`*[_type == "post" && slug.current == "${slug}"]`, {
      cache: 'no-store',
      next: { tags: [`post:${slug}`] },
    })
    revalidateTag(`post:${slug}`)
    return { success: true }
  } catch (error) {
    return { success: false, error }
  }
}
```

## Open Graph Patterns

### Article Type

```typescript
openGraph: {
  type: 'article',
  title: post.title,
  description: post.summary,
  url: `${baseUrl}/blog/${post.slug}`,
  images: [{
    url: urlFor(post.mainImage).url(),
    width: 1200,
    height: 630,
    alt: post.title,
  }],
  publishedTime: post.publishedAt,
  modifiedTime: post._updatedAt,
  authors: [post.author.name],
  section: post.categories[0]?.title,
  tags: post.categories.map(c => c.title),
}
```

### Product Type

```typescript
openGraph: {
  type: 'website',
  title: product.title,
  description: product.description,
  url: `${baseUrl}/products/${product.slug}`,
  images: [{
    url: urlFor(product.mainImage).url(),
    width: 1200,
    height: 630,
    alt: product.title,
  }],
}
```

## Twitter Cards

```typescript
twitter: {
  card: 'summary_large_image',
  title: post.title,
  description: post.summary,
  images: [urlFor(post.mainImage).url()],
  creator: '@yourhandle',
}
```

## SEO Checklist

| Item | Description |
|------|-------------|
| **Title Tags** | Unique, descriptive, 60 chars max |
| **Meta Descriptions** | Compelling, 160 chars max, include keywords |
| **Alt Text** | All images have descriptive alt text |
| **Canonical URLs** | Set to prevent duplicate content |
| **Structured Data** | JSON-LD for rich snippets |
| **Sitemap** | Auto-generated from Sanity content |
| **Robots.txt** | Block studio, API routes |
| **OG Images** | 1200x630 for social sharing |
| **Performance** | Image optimization, caching strategy |
| **Mobile** | Responsive design, viewport meta tag |
| **SSL** | HTTPS enabled |
| **Core Web Vitals** | LCP, FID, CLS optimized |
