# Sanity Webhook Patterns

Complete webhook implementation for on-demand cache revalidation with Sanity CMS.

## ⚠️ CRITICAL: Use the Correct Package

**Common Pitfall:** Using `@sanity/webhook` instead of `next-sanity/webhook`

The correct package for Next.js App Router webhooks is **`next-sanity/webhook`**, NOT `@sanity/webhook`. This is a frequently made mistake that causes signature verification failures.

```typescript
// ✅ CORRECT - Use next-sanity/webhook
import { parseBody } from "next-sanity/webhook";

// ❌ WRONG - @sanity/webhook is for different use cases
import { isValidSignature } from "@sanity/webhook";
```

## ⚠️ CRITICAL: Next.js 16 — `revalidateTag` requires 2 arguments

**Breaking change in Next.js 16.** The `revalidateTag` signature changed to require a second `profile` argument:

```typescript
// Next.js ≤15 (1 argument — works fine)
revalidateTag(tag)

// Next.js 16 (2 arguments required — pass {} for immediate invalidation)
revalidateTag(tag, {})
```

The second argument is a `CacheLifeConfig` object (`{ stale?, revalidate?, expire? }`). Pass `{}` to use defaults, which means immediate on-demand invalidation — the correct behaviour for a Sanity webhook.

**TypeScript error you'll see if you miss this:**
```
Type error: Expected 2 arguments, but got 1.
  revalidateTag(tag)
```

### Official Implementation Pattern (Next.js 16)

```typescript
// app/api/revalidate/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { parseBody } from "next-sanity/webhook"; // ✅ Correct import

export async function POST(req: NextRequest) {
  const { isValidSignature, body } = await parseBody<{ _type?: string }>(
    req,
    process.env.SANITY_REVALIDATE_SECRET,
  );

  if (!isValidSignature) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const tag = body?._type;
  if (!tag) {
    return new NextResponse("Bad request", { status: 400 });
  }

  revalidateTag(tag, {}); // ✅ Pass {} as second arg for Next.js 16

  return NextResponse.json({ revalidated: true, type: tag, now: Date.now() });
}
```

## Overview

Webhooks enable **immediate** content updates when you publish in Sanity Studio, instead of waiting for time-based cache expiration (30min-24hr).

## How It Works

```
┌─────────────────┐
│ Sanity Studio   │
│ (Publish Post)  │
└────────┬────────┘
         │ Webhook POST
         ▼
┌─────────────────────────────┐
│ /api/revalidate             │
│ - Verify signature          │
│ - Extract _type, slug       │
│ - Call revalidateTag()      │
│ - Call revalidatePath()     │
└────────┬────────────────────┘
         │ Cache cleared
         ▼
┌─────────────────────────────┐
│ Next Visitor Gets           │
│ FRESH CONTENT               │
└─────────────────────────────┘
```

## Benefits

| Feature | Without Webhooks | With Webhooks |
|---------|-----------------|---------------|
| Blog update time | 1 hour | **Immediate** |
| Career update time | 30 min | **Immediate** |
| Service update time | 24 hours | **Immediate** |
| Fallback if webhook fails | N/A | Time-based still works |

---

## Complete Implementation

### 1. Webhook API Route

```typescript
// app/api/revalidate/route.ts
import { NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import crypto from "crypto";

const WEBHOOK_SECRET = process.env.SANITY_WEBHOOK_SECRET;

if (!WEBHOOK_SECRET && process.env.NODE_ENV === "production") {
  console.warn("⚠️ SANITY_WEBHOOK_SECRET not set - webhook will reject all requests");
}

/**
 * Verify webhook signature from Sanity
 *
 * Sanity sends signature in format: t=timestamp,v1=signature
 * Example: "t=1770567243957,v1=9q_uHIMotATZtUJ3KR_PgKY6LhGRHJkMFCxn--ZEtJ0"
 */
function verifySignature(body: string, signature: string): boolean {
  if (!WEBHOOK_SECRET) return false;

  try {
    // Parse Sanity's signature format: t=timestamp,v1=signature
    const parts = signature.split(",");
    let signatureValue = "";

    for (const part of parts) {
      if (part.startsWith("v1=")) {
        signatureValue = part.substring(3);
        break;
      }
    }

    if (!signatureValue) {
      console.error("Could not extract v1 signature from:", signature);
      return false;
    }

    // Compute HMAC signature using the same method as Sanity
    const hmac = crypto.createHmac("sha256", WEBHOOK_SECRET);
    hmac.update(body, "utf8");
    const digest = hmac.digest("base64");

    // Compare signatures directly
    return digest === signatureValue;
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
}

/**
 * Map Sanity document types to cache tags and paths
 */
function getRevalidationConfig(docType: string) {
  const configs: Record<string, { tags: string[]; pathPrefix?: string }> = {
    post: { tags: ["posts"], pathPrefix: "/blog" },
    career: { tags: ["careers"], pathPrefix: "/career" },
    teamMember: { tags: ["team"], pathPrefix: "/team" },
    service: { tags: ["services"], pathPrefix: "/services" },
    testimonial: { tags: ["testimonials"] },
    successStory: { tags: ["successStories"] },
  };

  return configs[docType];
}

/**
 * Process webhook payload and revalidate caches
 */
async function processWebhookPayload(payload: any) {
  const { _type, slug, operation } = payload;

  if (!_type) {
    return NextResponse.json(
      { error: "Bad Request", message: "Missing _type" },
      { status: 400 }
    );
  }

  const config = getRevalidationConfig(_type);
  if (!config) {
    return NextResponse.json({
      revalidated: false,
      message: `No revalidation configured for type: ${_type}`,
    });
  }

  // Revalidate cache tags
  for (const tag of config.tags) {
    revalidateTag(tag);
    console.log(`✅ Revalidated tag: ${tag}`);
  }

  // Revalidate specific path if slug is available
  if (config.pathPrefix && slug?.current) {
    const path = `${config.pathPrefix}/${slug.current}`;
    revalidatePath(path);
    console.log(`✅ Revalidated path: ${path}`);
  }

  // Revalidate listing page
  if (config.pathPrefix) {
    revalidatePath(config.pathPrefix);
    console.log(`✅ Revalidated path: ${config.pathPrefix}`);
  }

  console.log(`✅ Webhook: Revalidated ${_type} (${operation || "unknown"})`);

  return NextResponse.json({
    revalidated: true,
    type: _type,
    slug: slug?.current,
    operation,
    tags: config.tags,
  });
}

export async function POST(request: Request) {
  try {
    // Sanity sends signature as: sanity-webhook-signature
    // Format: t=timestamp,v1=signature
    const signature = request.headers.get("sanity-webhook-signature");
    if (!signature) {
      console.error("❌ Webhook: Missing signature header");
      return NextResponse.json(
        { error: "Unauthorized", message: "Missing signature" },
        { status: 401 }
      );
    }

    // Get raw body FIRST (can only read stream once)
    const rawBody = await request.text();
    if (!verifySignature(rawBody, signature)) {
      console.error("❌ Webhook: Invalid signature");
      return NextResponse.json(
        { error: "Unauthorized", message: "Invalid signature" },
        { status: 401 }
      );
    }

    console.log("✅ Webhook signature verified");

    const payload = JSON.parse(rawBody);
    return processWebhookPayload(payload);

  } catch (error) {
    console.error("❌ Webhook error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", message: String(error) },
      { status: 500 }
    );
  }
}

// GET handler for testing
export async function GET() {
  return NextResponse.json({
    webhook: "/api/revalidate",
    status: WEBHOOK_SECRET ? "configured" : "missing-secret",
    supportedTypes: ["post", "career", "teamMember", "service", "testimonial", "successStory"],
    environment: process.env.NODE_ENV,
  });
}
```

### 2. Update Queries to Use Tags

```typescript
// sanity/lib/queries.ts
import { cache } from "react";
import { sanityFetch } from "./client";

// Blog posts with tag-based revalidation
export const getPosts = cache(async (limit = 10) => {
  return sanityFetch({
    query: `*[_type == "post"] | order(publishedAt desc)[0...${limit}] { ... }`,
    revalidate: 3600, // 1 hour fallback
    tags: ["posts"], // Enable webhook revalidation
  });
});

export const getPostBySlug = cache(async (slug: string) => {
  return sanityFetch({
    query: `*[_type == "post" && slug.current == $slug][0]{ ... }`,
    params: { slug },
    revalidate: 3600,
    tags: ["posts", `post:${slug}`], // Multiple tags for granular control
  });
});
```

---

## Sanity Webhook Configuration

### Step 1: Generate Secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Step 2: Add Environment Variable

```bash
# .env.local
SANITY_WEBHOOK_SECRET=your-generated-secret-here

# Netlify/Vercel
# Add to environment variables
```

### Step 3: Configure Webhook in Sanity

Go to [sanity.io/manage](https://sanity.io/manage) → your project → **API → Webhooks** → **+ New webhook**

| Field | Value |
|-------|-------|
| **Name** | Next.js Cache Revalidation |
| **URL** | `https://yourdomain.com/api/revalidate` |
| **Dataset** | `production` |
| **Trigger on** | ✅ Create, ✅ Update, ✅ Delete |
| **Filter** | *Leave empty* (triggers on all types) |
| **Projection** | `{ _id, _type, "slug": slug.current }` |
| **HTTP Method** | `POST` |
| **Secret** | Paste your `SANITY_WEBHOOK_SECRET` |
| **API Version** | `v2024-01-01` |
| **Drafts** | ❌ OFF (don't trigger on drafts) |
| **Versions** | ❌ OFF (not needed) |
| **HTTP Headers** | *Leave empty* |

**Note:** HTTP headers field is optional and not needed for basic webhooks. Only add if your endpoint requires additional authentication like `Authorization: Bearer <token>`.

---

## Supported Document Types

| Document Type | Cache Tags | Paths Revalidated |
|--------------|-----------|-------------------|
| `post` | `posts`, `post:{slug}` | `/blog`, `/blog/{slug}` |
| `career` | `careers`, `career:{slug}` | `/career`, `/career/{slug}` |
| `teamMember` | `team` | `/team` |
| `service` | `services` | `/services` |
| `testimonial` | `testimonials` | (Homepage only) |
| `successStory` | `successStories` | (Homepage only) |

---

## Testing

### 1. Test Endpoint
```bash
curl https://yourdomain.com/api/revalidate
```

Expected response:
```json
{
  "webhook": "/api/revalidate",
  "status": "configured",
  "supportedTypes": ["post", "career", "teamMember", "service", "testimonial", "successStory"]
}
```

### 2. Test Webhook

1. Publish content in Sanity Studio
2. Check server logs for: `✅ Webhook: Revalidated post (update)`
3. Visit the page - content should be updated immediately

---

## Troubleshooting

### Webhook returns 401 Unauthorized

**Cause:** Signature verification failed

**Solutions:**
1. Check `SANITY_WEBHOOK_SECRET` matches in both Sanity and Netlify
2. Verify secret has no extra spaces or line breaks
3. Regenerate secret and update both Sanity and Netlify
4. Make sure webhook header is `sanity-webhook-signature` (not `x-sanity-webhook-signature`)

### Content not updating after webhook

**Cause:** Path or tag mismatch

**Solutions:**
1. Check server logs for revalidation messages
2. Verify cache tag matches query tags
3. Try hard refresh (Ctrl+Shift+R) to clear browser cache

### Sanity webhook logs show 404

**Cause:** URL is wrong or site isn't deployed

**Solutions:**
1. Verify webhook URL is correct
2. Check Netlify deploy status
3. Ensure `revalidate/route.ts` exists in `app/api/`

---

## Security Best Practices

1. **Always use HTTPS** for webhook URLs
2. **Keep secrets secure** - never commit to git
3. **Rotate secrets periodically** (e.g., every 90 days)
4. **Monitor webhook logs** for suspicious activity
5. **Rate limit webhooks** if receiving excessive requests

---

## Headers Sanity Sends

Sanity automatically includes these headers with every webhook:

| Header | Purpose |
|--------|---------|
| `sanity-webhook-signature` | HMAC signature for verification (when secret is set) |
| `webhook-id` | Unique identifier for deduplication |
| `Sanity-Project-Id` | Your Sanity project ID |
| `Sanity-Dataset` | Dataset name |
| `Sanity-Operation` | create/update/delete |
| `Sanity-Document-Id` | The ID of the document |
| `Content-Type` | application/json |
| `User-Agent` | Sanity.io webhook delivery |

**Note:** The signature header is `sanity-webhook-signature` (NOT `x-sanity-webhook-signature`).
