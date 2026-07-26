# Sanity Integration Reference Documentation

This directory contains detailed reference materials for Sanity CMS integration with Next.js.

## Overview

The main skill file (`SKILL.md`) provides a quick start guide and phase summaries. These reference files contain in-depth implementation details, patterns, and troubleshooting information.

## Reference Files

| File | Contents | Use When |
|------|----------|----------|
| **webhook-patterns.md** | Complete webhook implementation with signature verification, tag-based revalidation, and Sanity configuration | Setting up on-demand cache invalidation |
| **caching-strategies.md** | Next.js 15 caching patterns, `sanityFetch` helper, cached queries, revalidation times | Optimizing API requests and cache configuration |
| **troubleshooting.md** | Common issues, debug protocol, solutions by category | Something isn't working as expected |
| **schema-patterns.md** | Sanity schema design patterns and best practices | Designing content schemas |
| **groq-cheatsheet.md** | GROQ query syntax and examples | Writing complex queries |
| **nextjs-isr.md** | Incremental Static Regeneration patterns | Implementing ISR with Sanity |
| **blog-rendering.md** | Blog-specific rendering patterns | Building blog functionality |
| **seo-guide.md** | SEO optimization for Sanity content | Optimizing for search engines |

## Quick Navigation

### For First-Time Setup
1. Start with main `SKILL.md` → Phase 1: Sanity Setup
2. Reference `schema-patterns.md` when designing your content types

### For Caching & Performance
1. Read `caching-strategies.md` for Next.js 15 caching overview
2. Implement `sanityFetch` helper pattern
3. Add webhook-based revalidation (see `webhook-patterns.md`)

### For Debugging Issues
1. Check `troubleshooting.md` → Quick Debug Checklist
2. Use 5-Step Debugging Protocol
3. Find your specific issue in Common Issues section

### For Webhook Setup
1. Complete webhook implementation in `webhook-patterns.md`
2. Follow Sanity configuration steps
3. Test and verify using troubleshooting guide

## Key Patterns

### sanityFetch Helper
All queries should use the centralized `sanityFetch` helper:
```typescript
import { sanityFetch } from "@/sanity/lib/client";

const posts = await sanityFetch({
  query: `*[_type == "post"]`,
  revalidate: 3600,
  tags: ["posts"],
});
```

### Cached Query Utilities
Use React `cache()` for automatic deduplication:
```typescript
import { cache } from "react";

export const getPosts = cache(async () => {
  return sanityFetch({ query: `*[_type == "post"]` });
});
```

### Webhook Signature Format
Sanity uses format: `t=timestamp,v1=signature`
```typescript
const signature = request.headers.get("sanity-webhook-signature");
// Parse: "t=1770567243957,v1=9q_uHIM..."
```

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.8.1 | Feb 2025 | Fixed webhook signature verification format |
| 1.8.0 | Feb 2025 | Added complete webhook documentation |
| 1.7.0 | Feb 2025 | Added Next.js 15 caching best practices |

## Contributing

When updating these references:
1. Keep code examples up-to-date with latest Next.js/Sanity versions
2. Include both common and edge cases
3. Add troubleshooting sections for new patterns
4. Update this README if adding new reference files
