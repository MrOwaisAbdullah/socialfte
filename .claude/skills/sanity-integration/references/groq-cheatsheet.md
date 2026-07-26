# GROQ Query Patterns & Examples

## Basic Queries

### Fetch All Documents

```groq
*[_type == "post"]
```

### Fetch Specific Fields (Projection)

```groq
*[_type == "post"]{
  title,
  slug,
  summary
}
```

### Fetch Single Document by Slug

```groq
*[_type == "post" && slug.current == "my-post"]{
  title,
  content
}
```

### Limit Results

```groq
*[_type == "post"] | order(_createdAt desc)[0...10]
```

## Ordering

### Order by Date (Newest First)

```groq
*[_type == "post"] | order(_createdAt desc)
```

### Order by Date (Oldest First)

```groq
*[_type == "post"] | order(_createdAt asc)
```

### Order by Custom Field

```groq
*[_type == "product"] | order(price asc)
```

### Multiple Sort Criteria

```groq
*[_type == "post"] | order(publishedAt desc, title asc)
```

## Filtering

### Filter by Field Value

```groq
*[_type == "post" && status == "published"]
```

### Multiple Conditions

```groq
*[_type == "post" && status == "published" && featured == true]
```

### Range Filtering

```groq
*[_type == "product" && price >= 0 && price <= 100]
```

### Filter by Reference

```groq
*[_type == "post" && author->_id == "author-id"]
```

### Filter by Array Contains

```groq
*[_type == "post" && "design" in categories[]->title]
```

### Complex Array Filter

```groq
*[_type == "post" && categories[]->title match "design*"]
```

## Dereferencing (Fetching Related Data)

### Fetch Reference Fields

```groq
*[_type == "post"]{
  title,
  author->{name, slug}
}
```

### Fetch Array of References

```groq
*[_type == "post"]{
  title,
  categories[]->{title, slug}
}
```

### Nested References

```groq
*[_type == "post"]{
  title,
  author->{
    name,
    bio,
    avatar->{url, alt}
  }
}
```

### Conditional Reference

```groq
*[_type == "post"]{
  title,
  "author": author->{name},
  // Only include author if published
  // coalesce([]) removes null if author is missing
}
```

## Advanced Projections

### Computed Fields

```groq
*[_type == "post"]{
  title,
  "slug": slug.current,
  "url": "/blog/" + slug.current,
  "wordCount": length(pt::text(body))
}
```

### Array Operations

```groq
*[_type == "post"]{
  title,
  "categoryCount": count(categories),
  "firstCategory": categories[0]->title
}
```

### Subsets

```groq
*[_type == "post"]{
  title,
  "firstThreeCategories": categories[0...3]->title
}
```

### Slice with Spread

```groq
*[_type == "post"]{
  title,
  "imageSubset": mainImage{
    "url": url,
    "metadata": {...}
  }
}
```

## Search & Text Queries

### Full-Text Search

```groq
*[_type == "post" && title match "sanity*"]
```

### Case-Insensitive Search

```groq
*[_type == "post" && lower(title) match lower("keyword")]
```

### Regex Pattern

```groq
*[_type == "post" && title match "^How to.*"]
```

### Portable Text Search

```groq
*[_type == "post" && pt::text(body) match "keyword"]
```

## Joins & Relationships

### Reverse Reference (Backlinks)

```groq
*[_type == "author" && _id == "author-id"]{
  name,
  "posts": *[_type == "post" && author._ref == ^._id]{
    title,
    slug
  }
}
```

### Multiple Post Types

```groq
*[_type in ["post", "page", "product"]]
```

### Join with Filtering

```groq
*[_type == "category" && title == "Design"]{
  title,
  "posts": *[_type == "post" && references(^._id)]{
    title,
    publishedAt
  }
}
```

## Date & Time Queries

### Before/After Date

```groq
*[_type == "event" && startDate > now()]
*[_type == "post" && publishedAt < "2024-01-01"]
```

### Date Range

```groq
*[_type == "event" && startDate >= "2024-01-01" && startDate <= "2024-12-31"]
```

### Relative Dates

```groq
*[_type == "post" && dateTime(now()) > dateTime(publishedAt) + 30*24*60*60]
// Posts older than 30 days
```

## Image Queries

### Fetch Image Metadata

```groq
*[_type == "post"]{
  title,
  mainImage{
    asset->{url},
    altText,
    hotspot{x, y}
  }
}
```

### Image with Dimensions

```groq
*[_type == "post"]{
  mainImage{
    "url": asset->url,
    "width": asset->metadata.dimensions.width,
    "height": asset->metadata.dimensions.height
  }
}
```

## Pagination Patterns

### Offset & Limit

```groq
*[_type == "post"] | order(_createdAt desc)[10...20]
// Skip 10, fetch next 10
```

### Cursor-based (for infinite scroll)

```groq
*[_type == "post" && _createdAt > $lastDate] | order(_createdAt asc)[0...20]
```

## Performance Optimization

### Use Projections (Always!)

❌ Bad - Fetches all data:
```groq
*[_type == "post"]
```

✅ Good - Only fetch needed fields:
```groq
*[_type == "post"]{
  title,
  slug,
  summary
}
```

### Avoid Deep Nesting When Possible

❌ Bad - Fetches entire reference:
```groq
*[_type == "post"]{author->}
```

✅ Good - Fetch specific fields:
```groq
*[_type == "post"]{author->{name, slug}}
```

### Use `select` for First Match

```groq
*[_type == "post" && slug.current == $slug]{title}[0]
```

### Use `defined()` for Non-Null

```groq
*[_type == "post" && defined(publishedAt)]
```

## Common Query Patterns by Content Type

### Blog Listing Page

```groq
*[_type == "post" && status == "published"] | order(publishedAt desc){
  title,
  "slug": slug.current,
  summary,
  mainImage{
    asset->{url},
    alt
  },
  publishedAt,
  author->{name},
  categories[]->{title, "slug": slug.current}
}
```

### Single Blog Post

```groq
*[_type == "post" && slug.current == $slug]{
  title,
  slug,
  summary,
  mainImage{
    asset->{url},
    alt,
    hotspot{x, y}
  },
  content,
  publishedAt,
  author->{name, "slug": slug.current, bio},
  categories[]->{title, "slug": slug.current},
  seoTitle,
  seoDescription,
  openGraphImage
}[0]
```

### Product Listing with Filters

```groq
*[_type == "product" && inStock == true]{
  title,
  "slug": slug.current,
  price,
  compareAtPrice,
  mainImage{
    asset->{url},
    alt
  },
  categories[]->{title},
  brand->{name}
} | order(price asc)
```

### Related Posts

```groq
*[_type == "post" && _id != $currentId && count(categories[]->title) > 0]{
  title,
  "slug": slug.current,
  summary,
  mainImage{
    asset->{url}
  },
  categories[]->{title}
}[0...3]
```

### Search Posts

```groq
*[_type == "post" && (title match $query + "*" || pt::text(body) match $query)]{
  title,
  "slug": slug.current,
  summary,
  _score
} | order(score desc)
```

### Archive by Year/Month

```groq
*[_type == "post" && publishedAt >= "2024-01-01" && publishedAt <= "2024-12-31"] | order(publishedAt desc)
```

### Featured Posts

```groq
*[_type == "post" && featured == true && status == "published"] | order(featuredAt desc){
  title,
  "slug": slug.current,
  summary,
  mainImage{
    asset->{url}
  }
}
```

## API Route Query Patterns

### Blog List API

```groq
*[_type == "post"] | order(_createdAt desc){
  title,
  "slug": slug.current,
  summary,
  mainImage{asset->{url}, alt},
  _createdAt,
  author->{name},
  categories[]->{title}
}
```

### Single Post with Content

```groq
*[_type == "post" && slug.current == "${slug}"]{
  title,
  slug,
  summary,
  mainImage,
  content,
  faqs,
  author->{name, bio, "slug": slug.current},
  categories[]->{title, "slug": slug.current},
  likes,
  dislikes,
  _createdAt,
  _updatedAt
}[0]
```

### Sitemap Generation

```groq
*[_type in ["post", "page", "product"]]{
  "slug": slug.current,
  _updatedAt
}
```

## GROQ Operators Reference

| Operator | Description | Example |
|----------|-------------|---------|
| `==` | Equality | `status == "published"` |
| `!=` | Inequality | `status != "draft"` |
| `match` | Pattern match | `title match "sanity*"` |
| `in` | Array contains | `"design" in tags` |
| `&&` | Logical AND | `featured && published` |
| `\|\|` | Logical OR | `type == "post" \|\| type == "page"` |
| `!` | Negation | `!defined(startDate)` |
| `>=`, `<=` | Comparison | `price >= 100` |
| `defined()` | Value exists | `defined(author)` |
| `pt::text()` | Extract plain text | `pt::text(body)` |
| `length()` | Array/string length | `length(tags)` |
| `count()` | Count array items | `count(categories)` |
| `now()` | Current datetime | `publishedAt < now()` |
| `dateTime()` | Parse datetime | `dateTime(publishedAt)` |
| `coalesce()` | Fallback value | `coalesce(title, "Untitled")` |

## Client-Side Fetch Patterns

### Using next-sanity Client

```typescript
import { client } from "@/sanity/lib/client"

// Simple fetch
const posts = await client.fetch('*[_type == "post"]')

// With parameters
const post = await client.fetch(
  `*[_type == "post" && slug.current == $slug]`,
  { slug: "my-post" }
)
```

### With TypeScript Types

```typescript
interface Post {
  title: string
  slug: { current: string }
  summary: string
}

const posts = await client.fetch<Post[]>('*[_type == "post"]')
```

### Using Fetch with Tags (Revalidation)

```typescript
const posts = await client.fetch('*[_type == "post"]', {
  next: { tags: ["posts"] }
})
```

## Performance Best Practices

1. **Always project specific fields** - Never fetch `*[_type == "post"]` without projection
2. **Use `select` and `[0]` for single documents** - More efficient than `fetch()` on array
3. **Filter in GROQ, not JavaScript** - Reduces data transfer
4. **Avoid deep dereferencing when not needed** - Use simple reference projections
5. **Order by indexed fields** - `_createdAt`, `_id` are indexed
6. **Use `useCdn: true` for public content** - Edge caching
7. **Disable CDN for ISR** - `useCdn: false` when using revalidation
8. **Limit results in queries** - Use `[0...N]` instead of fetching all
