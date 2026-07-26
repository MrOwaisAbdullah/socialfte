---
name: building-nextjs-apps
description: Build Next.js 16 applications with correct patterns and distinctive design. Use when creating pages, layouts, dynamic routes, upgrading from Next.js 15, or implementing proxy.ts. Covers breaking changes (async params/searchParams, Turbopack, cacheComponents) and frontend aesthetics. NOT when building non-React or backend-only applications.
---

# Next.js 16 Applications

Build Next.js 16 applications correctly with distinctive design.

## Required Clarifications

Before generating code, ask:
1.  **Routing**: "Using App Router (default) or Pages Router?" (Assume App Router if unspecified)
2.  **Styling**: "Tailwind CSS + shadcn/ui?" (Assume yes if unspecified)
3.  **Database**: "Which database/ORM?" (e.g., PostgreSQL + Drizzle/Prisma/SQLModel)

## Quick Reference

| Pattern | Reference |
|---------|-----------|
| **Breaking Changes** | [nextjs-16-patterns.md](references/nextjs-16-patterns.md) |
| **Core Patterns** | [nextjs-16-patterns.md](references/nextjs-16-patterns.md) (Layouts, Actions, APIs) |
| **Data Fetching** | [nextjs-16-patterns.md](references/nextjs-16-patterns.md) (Server/Client) |
| **Design & UI** | [frontend-design.md](references/frontend-design.md) (Shadcn, Theming) |
| **Dates & UTC** | [datetime-patterns.md](references/datetime-patterns.md) |

## Official Documentation

| Resource | URL | Use For |
|----------|-----|---------|
| Next.js Docs | https://nextjs.org/docs | Routing, Rendering, Caching |
| React Docs | https://react.dev | Server Components, Hooks |
| Shadcn/ui | https://ui.shadcn.com | Component references |

## Critical Breaking Changes (Summary)

**1. Async Params**: `params` and `searchParams` are now Promises.
   - **WRONG**: `const { id } = params`
   - **RIGHT**: `const { id } = await params`

**2. Client Components**: Use `use()` hook for promises.
   - **RIGHT**: `const { id } = use(params)`

See [references/nextjs-16-patterns.md](references/nextjs-16-patterns.md) for full examples.

---

## ⚠️ CRITICAL SSR Pitfalls (Read Before Coding!)

**If you're using Zustand with persist middleware, localStorage, or any browser APIs, you WILL encounter these errors:**

- ❌ "Maximum update depth exceeded"
- ❌ "The result of getServerSnapshot should be cached to avoid an infinite loop"
- ❌ "Rendered more hooks than during the previous render"

**Solution**: Use local state with `useState` + `useEffect` pattern. See **[Critical SSR Pitfalls](references/nextjs-16-patterns.md#critical-ssr-pitfalls-)** section for complete patterns.

**Quick Fix Template**:
```typescript
"use client"
import { useState, useEffect } from "react"

export function SSRSafeComponent() {
  const [mounted, setMounted] = useState(false)
  const [value, setValue] = useState(defaultValue)

  useEffect(() => {
    setMounted(true)
    // Access browser APIs here only
    const stored = localStorage.getItem('key')
    if (stored) setValue(JSON.parse(stored))
  }, [])

  if (!mounted) return <Placeholder />  // SSR-safe
  return <RealComponent value={value} />
}
```

---

## Production Build Issues (Avoid These!)

### Issue 1: TypeScript Build Failures on Vercel

**Common Errors:**
```
Parameter 'task' implicitly has an 'any' type
Module not found: Can't resolve '@/lib/api'
Property 'X' does not exist on type 'Y'
```

**Solutions:**

1. **Run TypeScript locally before deploying:**
   ```bash
   npx tsc --noEmit
   ```

2. **Fix all implicit any types:**
   ```typescript
   // ❌ Wrong
   function processTask(task) { return task.id }

   // ✅ Correct
   function processTask(task: Task) { return task.id }
   ```

3. **Remove unused imports:**
   ```typescript
   // ❌ Wrong
   import { useState, useEffect, useMemo } from "react";

   // ✅ Correct
   import { useState, useEffect } from "react";
   ```

4. **Check files are tracked in git:**
   ```bash
   # Verify lib files exist in git
   git ls-files src/lib/

   # If empty, check .gitignore
   cat .gitignore | grep lib
   ```

### Issue 2: Monorepo Module Resolution

**Error:**
```
Import map: aliased to relative './src/lib/api' inside of [project]/teamflow-web/frontend
Module not found: Can't resolve '@/lib/api'
```

**Causes:**
1. `.gitignore` has `lib/` pattern that ignores all lib directories
2. Vercel root directory not set to `teamflow-web/frontend`
3. Root `package.json` with `install` script causing infinite loop

**Solutions:**

1. **Fix .gitignore:**
   ```gitignore
   # Python lib directories
   lib/
   lib64/

   # But keep specific package lib directories
   !teamflow_console/lib/
   !teamflow-web/frontend/src/lib/  # ADD THIS
   ```

2. **Force-add ignored files:**
   ```bash
   git add -f teamflow-web/frontend/src/lib/
   git commit -m "Add lib files to git"
   ```

3. **Remove root package.json install script:**
   ```json
   {
     "scripts": {
       "build": "cd frontend && npm run build",
       "vercel-build": "cd frontend && npm run build"
       // NO "install" script!
     }
   }
   ```

### Issue 3: Dynamic Component Rendering

**Error:**
```
Property 'statusIcon' does not exist on type 'JSX.IntrinsicElements'
```

**Cause:** JSX doesn't allow dynamic component tags like `<ComponentName />`.

**Solution:**
```typescript
// ❌ Wrong
const statusIcon = CheckCircle;
return <div><statusIcon className="w-4 h-4" /></div>;

// ✅ Correct - Use React.createElement
const statusIcon = CheckCircle;
return <div>{React.createElement(statusIcon, { className: "w-4 h-4" })}</div>;

// ✅ Or use uppercase (React convention)
const StatusIcon = CheckCircle;
return <div><StatusIcon className="w-4 h-4" /></div>;
```

### Issue 4: Enum Type Mismatches

**Error:**
```
Type 'string' is not assignable to type 'TaskStatus'
This comparison appears to be unintentional because the types 'TaskStatus' and '"ARCHIVED"' have no overlap
```

**Solution:**
```typescript
// ❌ Wrong
const getStatusStyle = (status: string) => {
  if (status === "archived") return "gray";
};

// ✅ Correct - Use enum type with Record
const getStatusStyle = (status: TaskStatus) => {
  const styles: Record<TaskStatus, string> = {
    [TaskStatus.TODO]: "blue",
    [TaskStatus.DOING]: "yellow",
    [TaskStatus.DONE]: "green",
    [TaskStatus.ARCHIVED]: "gray",  // Must include all values
  };
  return styles[status];
};
```

### Pre-Build Checklist

Before committing or deploying:

```bash
# 1. Run TypeScript compiler
npx tsc --noEmit

# 2. Fix any errors (no implicit any, unused imports, etc.)

# 3. Run linter
npm run lint

# 4. Test build locally
npm run build

# 5. Verify files are tracked
git ls-files src/lib/ | grep -v node_modules

# 6. Commit and push
git add .
git commit -m "Build passes locally"
git push
```

---

## Monorepo Deployment Patterns

### Vercel with Manual Root Directory

When deploying a Next.js app in a subdirectory (e.g., `teamflow-web/frontend`) to Vercel:

**1. Set Root Directory in Vercel Dashboard:**
- Go to Project Settings > General
- Set "Root Directory" to: `teamflow-web/frontend`

**2. Avoid root package.json conflicts:**
```json
// ❌ Wrong - Root package.json with workspace
{
  "workspaces": ["teamflow-web/frontend"],
  "scripts": {
    "install": "cd frontend && npm install"  // INFINITE LOOP!
  }
}

// ✅ Correct - No root package.json OR minimal without install
{
  "scripts": {
    "build": "cd frontend && npm run build"
  }
}
```

**3. Fix .gitignore at repository root:**
```gitignore
# Keep required lib directories
!teamflow-web/frontend/src/lib/
```

### Turbopack Considerations

Next.js 16 uses Turbopack by default in dev mode. For production:

1. **Turbopack is faster** but some plugins may not be compatible
2. **Module resolution** differs from webpack
3. **Path aliases** (`@/`) work same as webpack
4. **Cache behavior** is more aggressive

If build fails with Turbopack:
```json
// next.config.ts
const nextConfig: NextConfig = {
  // experimental: {
  //   turbo: undefined  // Disable Turbopack
  // }
};
```

---

## Environment Variables Best Practices

### Server vs Client Variables

```typescript
// ✅ Server-only (use in API routes, Server Components)
const dbUrl = process.env.DATABASE_URL;

// ✅ Client-accessible (use in Client Components)
const apiUrl = process.env.NEXT_PUBLIC_API_URL;

// ❌ Wrong - Server var in Client Component
const dbUrl = process.env.DATABASE_URL;  // Undefined on client!
```

### Validation

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  env: {
    // Validate required vars at build time
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "",
  },

  // Or use runtime validation
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};
```

---

## JSON-LD + RSC Payload: Duplicate Structured Data

**Symptom:** Google Search Console URL Inspection reports "2 FAQPage items" or "Duplicate field" on a page that only has one `<JsonLd>` component.

**Why it happens:**

Next.js App Router does two things for every page:
1. Renders the SSR HTML — your `<script type="application/ld+json">` appears here once.
2. Embeds an RSC payload — a `self.__next_f.push(...)` script containing serialized props for all client components. If you pass `post.faq` to a `'use client'` component, that FAQ data (including `@type`, `question`, `answer` strings) lands in the RSC payload too.

Google's structured data crawler parses ALL script content aggressively. It finds the schema data in both scripts and counts them as two separate structured data entities.

**The fix — single `@graph` block:**

```tsx
// ❌ DON'T — separate blocks + client component props = Google sees FAQPage twice
<JsonLd schema={articleSchema(...)} />
<JsonLd schema={breadcrumbSchema(...)} />
{post.faq && <JsonLd schema={faqSchema(post.faq)} />}
<BlogPostView post={post} />  {/* 'use client' — faq ends up in RSC payload */}

// ✅ DO — one @graph block, one <script> tag, no duplicate
<JsonLd schema={blogPostSchema({ ...post, faq: post.faq })} />
<BlogPostView post={post} />
```

Where `blogPostSchema()` returns:
```json
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Article", ... },
    { "@type": "BreadcrumbList", ... },
    { "@type": "FAQPage", "mainEntity": [...] }
  ]
}
```

**Rule:** Any schema type whose data also exists in a client component's props must be merged into a single `@graph` block — never emitted as a standalone `<script type="application/ld+json">` tag.

---

## Next.js DevTools MCP

Use the next-devtools-mcp server for runtime diagnostics and development automation.

### Setup

```bash
claude mcp add next-devtools npx next-devtools-mcp @latest
```

### Key Tools

- `upgrade_nextjs_16`: Automated upgrade with codemods
- `enable_cache_components`: Configure Cache Components for Next.js 16
- `nextjs_docs`: Search official documentation

### Next.js 16 MCP Endpoint

Next.js 16+ exposes a built-in MCP endpoint at `http://localhost:3000/_next/mcp`.

---

## Verification

Run: `python3 scripts/verify.py`

Expected: `✓ building-nextjs-apps skill ready`

## Related Skills

- **frontend-designer** - Use for animation choreography and "Black Shirt" design aesthetic.
- **gemini-frontend-assistant** - Use for generating components from screenshots or descriptions.
- **theme-factory** - Use for generating professional color palettes and themes.
- **styling-with-shadcn** - UI components for Next.js apps
- **fetching-library-docs** - Latest Next.js docs: `--library-id /vercel/next.js --topic routing`
- **configuring-better-auth** - OAuth/SSO for Next.js apps
