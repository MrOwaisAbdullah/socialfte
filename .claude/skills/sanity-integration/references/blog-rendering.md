# Blog Rendering Patterns for Sanity + Next.js

Complete guide for rendering blog content from Sanity CMS with Next.js, including Portable Text components, code syntax highlighting, images, table of contents, FAQs, and more.

---

## ⚠️ Critical Pitfalls (Learn from Production Issues)

### 1. The `results[0]` Bug - #1 Cause of 404s

**Problem:** Blog detail pages return 404 even though content exists in Sanity.

**Root Cause:** When using `sanityFetch` with Next.js 15 ISR, the helper returns **data directly**, NOT an array. Using `results[0]` on an object always returns `undefined`.

```typescript
// ❌ WRONG - This causes 404s!
export const getPostBySlug = cache(async (slug: string) => {
  const results = await sanityFetch({ query, params });
  return results[0] || null; // ❌ sanityFetch returns object, not array!
});

// ✅ CORRECT - Direct return
export const getPostBySlug = cache(async (slug: string) => {
  const post = await sanityFetch({ query, params });
  return post || null; // ✅ Direct return
});
```

**For array-returning queries, add fallback:**
```typescript
// ✅ With array fallback
export const getPosts = cache(async (limit = 10) => {
  const posts = await sanityFetch({ query });
  return posts || []; // ✅ Prevents undefined errors
});
```

---

### 2. Missing `dynamicParams = true` for ISR

**Problem:** New blog posts added after build return 404.

**Root Cause:** Without `dynamicParams = true`, Next.js only serves pages that were generated at build time.

```typescript
// ✅ REQUIRED for ISR to generate new pages on-demand
export const dynamicParams = true; // Allows on-demand generation
export const revalidate = 3600; // Time-based fallback
```

---

### 3. CDN vs ISR Caching Conflict

**Problem:** Webhook fires successfully but content doesn't update immediately.

**Root Cause:** Sanity CDN serves stale content even after Next.js cache revalidation.

**Solution:** When using ISR with webhooks, **disable CDN** and let Next.js handle all caching:

```typescript
// sanity/lib/client.ts
export function getClient() {
  return createClient({
    projectId,
    dataset,
    apiVersion,
    useCdn: false, // ✅ Disable CDN when using ISR with webhooks
    // Let Next.js handle caching instead
  });
}
```

**When to enable CDN:**
- ❌ **With webhooks:** Never (causes stale content)
- ✅ **Time-based only:** Yes, in production (`useCdn: process.env.NODE_ENV === "production"`)

---

### 4. Missing Fields in Related Posts Query

**Problem:** Build fails with `Cannot read properties of undefined (reading '_id')` when rendering related posts.

**Root Cause:** `getRelatedPosts` query doesn't include all required fields for the component.

```typescript
// ❌ WRONG - Missing author field
const query = `
  *[_type == "post" && _id != $id] | order(publishedAt desc)[0...${limit}]{
    _id,
    title,
    "slug": slug.current,
    // ❌ Missing author!
  }
`;

// ✅ CORRECT - Includes author
const query = `
  *[_type == "post" && _id != $id] | order(publishedAt desc)[0...${limit}]{
    _id,
    title,
    "slug": slug.current,
    author-> { _id, name, "slug": slug.current }, // ✅ Include author
    excerpt,
    mainImage { asset-> { url } },
    publishedAt
  }
`;
```

**Also filter out undefined elements:**
```typescript
{relatedPosts.filter(Boolean).map((post) => (
  <RelatedPostCard key={post._id} post={post} />
))}
```

---

### 5. Wrong Webhook Package for Next.js

**Problem:** Webhook signature verification returns 401 even with correct secret.

**Root Cause:** Using `@sanity/webhook` instead of `next-sanity/webhook`.

```typescript
// ✅ CORRECT - For Next.js App Router
import { parseBody } from "next-sanity/webhook";

const { isValidSignature, body } = await parseBody<WebhookPayload>(
  req,
  WEBHOOK_SECRET
);

// ❌ WRONG - Wrong package
import { isValidSignature } from "@sanity/webhook";
```

---

## Quick Debug Checklist for Blog 404s

1. [ ] Query tested in Sanity Vision → Returns results?
2. [ ] `getPostBySlug` returns `post` directly (not `results[0]`)
3. [ ] `dynamicParams = true` is set on page component
4. [ ] `useCdn: false` when using webhooks
5. [ ] Related posts query includes all required fields
6. [ ] Using `next-sanity/webhook` `parseBody`, not `@sanity/webhook`

---

## Table of Contents

1. [Portable Text Setup](#portable-text-setup)
2. [Basic Portable Text Components](#basic-portable-text-components)
3. [Code Block Syntax Highlighting](#code-block-syntax-highlighting)
4. [Image Rendering](#image-rendering)
5. [Table of Contents](#table-of-contents)
6. [FAQ Accordion](#faq-accordion)
7. [Related Posts](#related-posts)
8. [Like/Dislike Functionality](#likedislike-functionality)
9. [Breadcrumbs](#breadcrumbs)
10. [Full Blog Page Template](#full-blog-page-template)

---

## Portable Text Setup

### Installation

```bash
npm install @portabletext/react @portabletext/types
```

### TypeScript Types

```typescript
// types/portabletext.ts
import {
  PortableTextBlock,
  PortableTextMarkDefinition,
  PortableTextSpan,
} from "@portabletext/types";
import { ReactNode } from "react";

export interface PortableTextComponentProps<T = PortableTextBlock> {
  value: T;
  children: ReactNode;
  isInline?: boolean;
  renderNode?: (node: T) => ReactNode;
}

export type CustomBlockComponentProps = PortableTextComponentProps<
  PortableTextBlock<PortableTextMarkDefinition, PortableTextSpan>
>;
```

---

## Basic Portable Text Components

### Custom Portable Text Components

```typescript
// components/CustomComponent.tsx
import { PortableTextComponents } from "@portabletext/react";
import { ReactNode } from "react";
import Image from "next/image";
import { urlFor } from "@/sanity/lib/image";
import { ExternalLink } from "lucide-react";
import Link from "next/link";

export const CustomComponent: PortableTextComponents = {
  // === Block Styles ===
  block: {
    h1: (props: { children?: ReactNode }) => {
      const extractText = (content: ReactNode | undefined): string => {
        if (Array.isArray(content) && content[0]) {
          if (typeof content[0] === "string") return content[0];
          if (typeof content[0] === "object" && "props" in content[0]) {
            return String(
              (content[0] as { props?: { children?: ReactNode } }).props
                ?.children || ""
            );
          }
        }
        return "";
      };
      const text = extractText(props.children);
      const id = text
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^\w-]+/g, "");
      return (
        <h1
          id={id}
          className="text-2xl sm:text-3xl md:text-4xl font-bold mt-6 mb-4 text-foreground font-heading"
        >
          {props.children}
        </h1>
      );
    },
    h2: (props: { children?: ReactNode }) => {
      const extractText = (content: ReactNode | undefined): string => {
        if (Array.isArray(content) && content[0]) {
          if (typeof content[0] === "string") return content[0];
          if (typeof content[0] === "object" && "props" in content[0]) {
            return String(
              (content[0] as { props?: { children?: ReactNode } }).props
                ?.children || ""
            );
          }
        }
        return "";
      };
      const text = extractText(props.children);
      const id = text
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^\w-]+/g, "");
      return (
        <h2
          id={id}
          className="text-xl sm:text-2xl md:text-3xl font-bold mt-10 mb-3 text-foreground font-heading"
        >
          {props.children}
        </h2>
      );
    },
    h3: (props: { children?: ReactNode }) => {
      const text = extractText(props.children);
      const id = text.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]+/g, "");
      return (
        <h3
          id={id}
          className="text-lg sm:text-xl md:text-2xl font-semibold mt-8 mb-2 text-foreground font-heading"
        >
          {props.children}
        </h3>
      );
    },
    h4: (props: { children?: ReactNode }) => {
      const text = extractText(props.children);
      const id = text.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]+/g, "");
      return (
        <h4
          id={id}
          className="text-base sm:text-lg md:text-xl font-medium mt-6 mb-1 text-foreground font-heading"
        >
          {props.children}
        </h4>
      );
    },
    h5: (props: { children?: ReactNode }) => {
      const text = extractText(props.children);
      const id = text.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]+/g, "");
      return (
        <h5
          id={id}
          className="text-base sm:text-lg font-medium mt-5 mb-1 text-foreground font-heading"
        >
          {props.children}
        </h5>
      );
    },
    h6: (props: { children?: ReactNode }) => {
      const text = extractText(props.children);
      const id = text.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]+/g, "");
      return (
        <h6
          id={id}
          className="text-sm sm:text-base font-medium mt-4 mb-1 text-foreground font-heading"
        >
          {props.children}
        </h6>
      );
    },
    blockquote: ({ children }: { children?: ReactNode }) => (
      <blockquote className="border-l-4 border-gray-300 pl-4 italic my-4">
        {children}
      </blockquote>
    ),
    normal: ({ children }: { children?: ReactNode }) => (
      <p className="text-base lg:text-lg leading-7 mb-6 text-foreground">{children}</p>
    ),
  },

  // === Lists ===
  list: {
    bullet: ({ children }: { children?: ReactNode }) => (
      <ul className="list-disc text-base ml-6 mb-8 space-y-2 text-foreground marker:text-primary">
        {children}
      </ul>
    ),
    number: ({ children }: { children?: ReactNode }) => (
      <ol className="list-decimal text-base ml-6 mb-8 space-y-2 text-foreground marker:text-primary">
        {children}
      </ol>
    ),
  },
  listItem: {
    bullet: ({ children }: { children?: ReactNode }) => (
      <li className="pl-2 leading-relaxed text-foreground">{children}</li>
    ),
    number: ({ children }: { children?: ReactNode }) => (
      <li className="pl-2 leading-relaxed text-foreground">{children}</li>
    ),
  },

  // === Marks (Inline Formatting) ===
  marks: {
    bold: ({ children }: { children?: ReactNode }) => (
      <strong className="font-semibold text-foreground">{children}</strong>
    ),
    italic: ({ children }: { children?: ReactNode }) => (
      <em className="italic text-foreground">{children}</em>
    ),
    underline: ({ children }: { children?: ReactNode }) => (
      <span className="underline text-foreground">{children}</span>
    ),
    link: ({
      value,
      children,
    }: {
      value?: { href?: string };
      children?: ReactNode;
    }) => {
      const href = value?.href || "";
      const isExternal =
        href.startsWith("http") && !href.includes("yourdomain.com");

      if (isExternal) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text2 underline hover:text-primary inline-flex items-center"
          >
            {children}
            <ExternalLink className="w-4 h-4 ml-1" />
          </a>
        );
      }

      return (
        <Link href={href} className="text-text2 underline hover:text-primary">
          {children}
        </Link>
      );
    },
    strong: ({ children }: { children?: ReactNode }) => (
      <strong className="font-bold text-foreground">{children}</strong>
    ),
    em: ({ children }: { children?: ReactNode }) => (
      <em className="italic text-foreground">{children}</em>
    ),
    code: ({ children }: { children?: ReactNode }) => (
      <code className="bg-gray-800 text-sm p-1 rounded-md text-gray-200 font-mono">
        {children}
      </code>
    ),
    "strike-through": ({ children }: { children?: ReactNode }) => (
      <span className="line-through text-foreground">{children}</span>
    ),
    highlight: ({ children }: { children?: ReactNode }) => (
      <span className="bg-yellow-100 dark:bg-yellow-900 text-foreground px-1 rounded">
        {children}
      </span>
    ),
  },

  // === Custom Block Types ===
  types: {
    image: ({
      value,
    }: {
      value: { asset?: { _ref?: string }; alt?: string };
    }) => {
      if (!value?.asset?._ref) {
        return null;
      }
      return (
        <div className="relative w-full aspect-[16/9] my-8">
          <Image
            src={urlFor(value).url()}
            alt={value.alt || "Blog post image"}
            className="rounded-lg object-cover"
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 70vw"
            priority={false}
          />
        </div>
      );
    },
    codeBlock: ({ value }: { value: { language?: string; code?: string } }) => (
      <CodeBlock language={value.language} code={value.code || ""} />
    ),
  },
};
```

---

## Code Block Syntax Highlighting

### Option 1: Using @sanity/code-input (Recommended)

The official Sanity package for code input with built-in syntax highlighting.

```bash
npm install @sanity/code-input
```

**Add to Sanity Config:**

```typescript
// sanity.config.ts
import { codeInput } from "@sanity/code-input";

const config = defineConfig({
  // ...
  plugins: [codeInput()],
});
```

**Update Block Content Schema:**

```typescript
// sanity/schemaTypes/blockContentType.ts
import { defineType, defineArrayMember } from "sanity";

export const blockContentType = defineType({
  title: "Block Content",
  name: "blockContent",
  type: "array",
  of: [
    defineArrayMember({
      type: "block",
      // ... other block styles
    }),
    // Code input from @sanity/code-input plugin
    defineArrayMember({
      type: "code",
      options: { language: "javascript" },
    }),
  ],
});
```

### Option 2: Custom Code Block with react-syntax-highlighter

### Code Block Component

```typescript
// components/CodeBlock.tsx
"use client";

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

interface CodeBlockProps {
  language?: string;
  code: string;
}

export default function CodeBlock({ language = "javascript", code }: CodeBlockProps) {
  return (
    <div className="my-8 rounded-lg overflow-hidden">
      <div className="bg-gray-800 px-4 py-2 text-sm text-gray-400 flex items-center justify-between">
        <span className="font-mono">{language || "text"}</span>
        <button
          onClick={() => navigator.clipboard.writeText(code)}
          className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded transition-colors"
        >
          Copy
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={vscDarkPlus}
        customStyle={{
          margin: 0,
          borderRadius: "0 0 0.5rem 0.5rem",
          fontSize: "0.875rem",
        }}
        showLineNumbers
        wrapLines
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
```

### Sanity Schema for Code Blocks

Add to your `blockContentType.ts`:

```typescript
// sanity/schemaTypes/blockContentType.ts
import { defineType, defineArrayMember } from "sanity";
import { CodeIcon } from "@sanity/icons";

export const blockContentType = defineType({
  title: "Block Content",
  name: "blockContent",
  type: "array",
  of: [
    // ... existing block types
    defineArrayMember({
      type: "object",
      name: "codeBlock",
      title: "Code Block",
      icon: CodeIcon,
      fields: [
        {
          name: "language",
          type: "string",
          title: "Language",
          options: {
            list: [
              { title: "JavaScript", value: "javascript" },
              { title: "TypeScript", value: "typescript" },
              { title: "Python", value: "python" },
              { title: "HTML", value: "html" },
              { title: "CSS", value: "css" },
              { title: "Bash", value: "bash" },
              { title: "SQL", value: "sql" },
              { title: "JSON", value: "json" },
            ],
          },
          initialValue: "javascript",
        },
        {
          name: "code",
          type: "text",
          title: "Code",
          validation: (Rule) => Rule.required(),
        },
      ],
      preview: {
        select: {
          code: "code",
          language: "language",
        },
        prepare({ code, language }) {
          return {
            title: `${language || "Code"} Block`,
            subtitle: code?.substring(0, 50) + "...",
          };
        },
      },
    }),
  ],
});
```

---

## Image Rendering

### Basic Image Component

```typescript
// components/SanityImage.tsx
"use client";

import Image from "next/image";
import { urlFor } from "@/sanity/lib/image";

interface SanityImageProps {
  value: {
    asset?: { _ref?: string };
    alt?: string;
    caption?: string;
  };
  priority?: boolean;
}

export default function SanityImage({ value, priority = false }: SanityImageProps) {
  if (!value?.asset?._ref) return null;

  return (
    <figure className="my-8">
      <div className="relative w-full aspect-[16/9]">
        <Image
          src={urlFor(value).url()}
          alt={value.alt || ""}
          className="rounded-lg object-cover"
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 70vw"
          priority={priority}
        />
      </div>
      {value.caption && (
        <figcaption className="text-center text-sm text-muted-foreground mt-2">
          {value.caption}
        </figcaption>
      )}
    </figure>
  );
}
```

### Image with Zoom/Lightbox

```typescript
// components/ZoomableImage.tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { urlFor } from "@/sanity/lib/image";
import { X } from "lucide-react";

interface ZoomableImageProps {
  value: {
    asset?: { _ref?: string };
    alt?: string };
  };
}

export default function ZoomableImage({ value }: ZoomableImageProps) {
  const [isZoomed, setIsZoomed] = useState(false);

  if (!value?.asset?._ref) return null;

  return (
    <>
      <figure
        className="my-8 cursor-pointer"
        onClick={() => setIsZoomed(true)}
      >
        <div className="relative w-full aspect-[16/9]">
          <Image
            src={urlFor(value).url()}
            alt={value.alt || ""}
            className="rounded-lg object-cover hover:scale-[1.02] transition-transform"
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 70vw"
          />
        </div>
      </figure>

      {isZoomed && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setIsZoomed(false)}
        >
          <button
            className="absolute top-4 right-4 text-white hover:text-gray-300"
            onClick={() => setIsZoomed(false)}
          >
            <X size={32} />
          </button>
          <div className="relative max-w-5xl max-h-[90vh] w-full">
            <Image
              src={urlFor(value).url()}
              alt={value.alt || ""}
              className="object-contain"
              width={1200}
              height={800}
            />
          </div>
        </div>
      )}
    </>
  );
}
```

---

## Table of Contents

### Table of Contents Component

```typescript
// components/TableOfContents.tsx
"use client";

import React, { useEffect, useState } from "react";
import { PortableTextBlock } from "@portabletext/types";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

interface TOCItem {
  id: string;
  text: string;
  level: number;
  items?: TOCItem[];
}

interface TableOfContentsProps {
  content: PortableTextBlock[];
}

function buildTOCTree(items: TOCItem[]): TOCItem[] {
  const root: TOCItem[] = [];
  const stack: TOCItem[] = [];

  items.forEach((item) => {
    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(item);
    } else {
      const parent = stack[stack.length - 1];
      if (!parent.items) parent.items = [];
      parent.items.push(item);
    }
    stack.push(item);
  });

  return root;
}

function extractText(children: unknown): string {
  if (Array.isArray(children) && children[0]) {
    if (typeof children[0] === "string") {
      return children[0];
    }
    if (typeof children[0] === "object" && "props" in children[0]) {
      return (
        (children[0] as { props: { children?: string } }).props.children || ""
      );
    }
  }
  return "";
}

export function TableOfContents({ content }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>("");
  const [headings, setHeadings] = useState<TOCItem[]>([]);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [tocTree, setTocTree] = useState<TOCItem[]>([]);

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Extract headings from the portable text content
  useEffect(() => {
    const items: TOCItem[] = [];
    const numberedSections: { [key: number]: number } = {};
    const hasNumberedHeadings = content.some((block) => {
      if (block.style?.startsWith("h") && block.children?.[0]) {
        const text =
          extractText(block.children) || block.children[0].text || "";
        return /^\s*\d+(\.\d+)*\.*\s*/.test(text);
      }
      return false;
    });

    content.forEach((block) => {
      if (block.style?.startsWith("h") && block.children?.[0]) {
        const level = parseInt(block.style[1]) || 1;
        Object.keys(numberedSections).forEach((key) => {
          if (parseInt(key) > level) {
            delete numberedSections[parseInt(key)];
          }
        });
        numberedSections[level] = (numberedSections[level] || 0) + 1;
        const text =
          extractText(block.children) || block.children[0].text || "";
        if (text) {
          const id = text
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^\w-]+/g, "");
          let displayText = text;
          if (!hasNumberedHeadings) {
            const prefix = Object.entries(numberedSections)
              .sort(([a], [b]) => parseInt(a) - parseInt(b))
              .map(([, num]) => num)
              .join(".");
            displayText = `${prefix}. ${text}`;
          }
          items.push({ id, text: displayText, level });
        }
      }
    });
    setHeadings(items);
    setTocTree(buildTOCTree(items));
  }, [content]);

  // Handle scroll and intersection observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "-20% 0px -35% 0px" }
    );

    headings.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) {
        observer.observe(element);
      }
    });

    return () => observer.disconnect();
  }, [headings]);

  const handleClick = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const yOffset = -100;
      const y =
        element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  if (headings.length === 0) return null;

  const renderTOCItem = (item: TOCItem) => {
    const { id, text, level, items } = item;
    const hasChildren = items && items.length > 0;
    const isExpanded = expandedItems.has(id);

    let headingClass = "";
    if (level === 1) {
      headingClass = "font-semibold text-base md:text-lg text-foreground";
    } else if (level === 2) {
      headingClass = "font-semibold text-sm md:text-base text-foreground/90";
    } else {
      headingClass = "font-medium text-xs sm:text-sm text-foreground/60";
    }

    return (
      <li key={id} className="list-none">
        <div
          className={cn(
            "flex items-center gap-2 py-1 cursor-pointer hover:text-primary transition-colors duration-200",
            headingClass,
            activeId === id ? "text-primary font-bold" : ""
          )}
          style={{ paddingLeft: `${(level - 1) * 0.8}rem` }}
        >
          {hasChildren ? (
            <ChevronRight
              className={cn(
                "h-4 w-4 transition-transform flex-shrink-0",
                isExpanded && "transform rotate-90"
              )}
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(id);
              }}
            />
          ) : (
            <span style={{ width: 16, display: "inline-block" }} />
          )}
          <span onClick={() => handleClick(id)}>{text}</span>
        </div>
        {hasChildren && isExpanded && (
          <ul className="mt-1">{items.map((child) => renderTOCItem(child))}</ul>
        )}
      </li>
    );
  };

  return (
    <nav>
      <div className="bg-toc-background backdrop-blur-sm border border-border rounded-lg p-3 sm:p-5">
        <h2 className="text-md sm:text-lg font-semibold mb-4 text-foreground">
          Table of Contents
        </h2>
        <ul className="space-y-1">
          {tocTree.map((item) => renderTOCItem(item))}
        </ul>
      </div>
    </nav>
  );
}
```

---

## FAQ Accordion

### FAQ Component with shadcn/ui Accordion

```typescript
// components/Faq.tsx
"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface Faq {
  question: string;
  answer: string;
}

interface FaqProps {
  faqs: Faq[];
}

export default function FaqSection({ faqs }: FaqProps) {
  if (!faqs || faqs.length === 0) {
    return null;
  }

  return (
    <div className="my-8 sm:my-12">
      <div className="text-center mb-6 sm:mb-8">
        <h3 className="text-accent font-semibold text-base sm:text-lg mb-1 sm:mb-2">FAQ</h3>
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground">
          Frequently Asked Questions
        </h2>
      </div>
      <Accordion type="single" collapsible className="w-full space-y-3 sm:space-y-4">
        {faqs.map((faq, index) => (
          <AccordionItem
            value={`item-${index}`}
            key={index}
            className="border border-border rounded-lg bg-background/80 backdrop-blur-sm"
          >
            <AccordionTrigger className="p-3 sm:p-4 text-base sm:text-lg font-semibold text-left hover:text-primary transition-colors duration-300 hover:no-underline">
              {faq.question}
            </AccordionTrigger>
            <AccordionContent className="p-3 sm:p-4 pt-0 text-sm sm:text-base text-muted-foreground font-poppins">
              {faq.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
```

### JSON-LD FAQ Schema

```typescript
// components/JsonLdFaq.tsx
import { Faq } from "@/types/post";

export const JsonLdFaq = ({ faqs }: { faqs: Faq[] }) => {
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
    />
  );
};
```

---

## Related Posts

### Related Posts Component

```typescript
// components/RelatedPosts.tsx
"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { client } from "@/sanity/lib/client";
import { urlFor } from "@/sanity/lib/image";

interface RelatedPost {
  _id: string;
  title: string;
  slug: { current: string };
  mainImage: {
    _type: string;
    asset: { _ref: string; _type: string };
    alt?: string;
  };
  summary: string;
}

interface RelatedPostsProps {
  currentSlug: string;
  limit?: number;
}

async function fetchRelatedPosts(
  currentSlug: string,
  limit = 3
): Promise<RelatedPost[]> {
  const query = `*[_type == "post" && slug.current != $slug] | order(_createdAt desc)[0...$limit]{
    _id,
    title,
    slug,
    mainImage,
    summary
  }`;
  return await client.fetch(query, { slug: currentSlug, limit });
}

const RelatedPosts = ({ currentSlug, limit = 3 }: RelatedPostsProps) => {
  const [posts, setPosts] = useState<RelatedPost[]>([]);

  useEffect(() => {
    fetchRelatedPosts(currentSlug, limit).then(setPosts);
  }, [currentSlug, limit]);

  if (!posts.length) return null;

  return (
    <>
      <h2 className="text-xl lg:text-3xl text-center font-semibold mb-4 text-foreground">
        Related Posts
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-4 sm:px-6 md:px-8 lg:px-10">
        {posts.map((post) => (
          <Link
            key={post._id}
            href={`/blog/${post.slug.current}`}
            className="block border border-border rounded-lg overflow-hidden hover:shadow-lg transition-shadow bg-background"
          >
            <div className="relative aspect-[16/9] w-full h-40 overflow-hidden">
              <Image
                src={urlFor(post.mainImage).url()}
                alt={post.mainImage.alt || post.title}
                fill
                className="object-cover"
              />
            </div>
            <div className="p-4">
              <h3 className="font-bold text-base mb-2 text-foreground line-clamp-2">
                {post.title}
              </h3>
              <p className="text-sm text-muted-foreground line-clamp-3">
                {post.summary}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
};

export default RelatedPosts;
```

---

## Like/Dislike Functionality

### Like/Dislike Buttons Component

```typescript
// components/LikeDislikeButtons.tsx
"use client";

import { motion } from "framer-motion";
import { ThumbsUp, ThumbsDown } from "lucide-react";

interface LikeDislikeButtonsProps {
  handleVote: (action: "like" | "dislike") => void;
  userVote: "like" | "dislike" | null;
  showAnimation: "like" | "dislike" | null;
  likes?: number;
  dislikes?: number;
  ctaText?: string;
}

export default function LikeDislikeButtons({
  handleVote,
  userVote,
  showAnimation,
  likes = 0,
  dislikes = 0,
  ctaText,
}: LikeDislikeButtonsProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      {ctaText && (
        <p className="text-sm text-muted-foreground text-center">
          {ctaText}
        </p>
      )}
      <div className="flex items-center gap-4">
        {/* Like Button */}
        <motion.button
          onClick={() => handleVote("like")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            userVote === "like"
              ? "bg-green-500 text-white"
              : "bg-gray-200 dark:bg-gray-800 text-foreground hover:bg-gray-300 dark:hover:bg-gray-700"
          }`}
          whileTap={{ scale: 0.95 }}
        >
          <ThumbsUp size={18} />
          <span>{likes}</span>
          {showAnimation === "like" && (
            <motion.span
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: 1, y: -20 }}
              exit={{ opacity: 0 }}
              className="absolute text-green-500 text-2xl"
            >
              +1
            </motion.span>
          )}
        </motion.button>

        {/* Dislike Button */}
        <motion.button
          onClick={() => handleVote("dislike")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            userVote === "dislike"
              ? "bg-red-500 text-white"
              : "bg-gray-200 dark:bg-gray-800 text-foreground hover:bg-gray-300 dark:hover:bg-gray-700"
          }`}
          whileTap={{ scale: 0.95 }}
        >
          <ThumbsDown size={18} />
          <span>{dislikes}</span>
          {showAnimation === "dislike" && (
            <motion.span
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: 1, y: -20 }}
              exit={{ opacity: 0 }}
              className="absolute text-red-500 text-2xl"
            >
              +1
            </motion.span>
          )}
        </motion.button>
      </div>
    </div>
  );
}
```

### API Route for Like/Dislike

```typescript
// app/api/like/route.ts
import { NextRequest, NextResponse } from "next/server";
import { client } from "@/sanity/lib/client";

export async function POST(request: NextRequest) {
  try {
    const { slug, action } = await request.json();

    if (!slug || !action) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Fetch current post
    const post = await client.fetch(
      `*[_type == "post" && slug.current == $slug]{ _id, likes, dislikes }[0]`,
      { slug }
    );

    if (!post) {
      return NextResponse.json(
        { error: "Post not found" },
        { status: 404 }
      );
    }

    let newLikes = post.likes || 0;
    let newDislikes = post.dislikes || 0;

    // Update counts based on action
    if (action === "like") newLikes++;
    else if (action === "dislike") newDislikes++;
    else if (action === "unlike") newLikes--;
    else if (action === "undislike") newDislikes--;

    // Update in Sanity
    await client
      .patch(post._id)
      .set({ likes: newLikes, dislikes: newDislikes })
      .commit();

    return NextResponse.json({
      likes: newLikes,
      dislikes: newDislikes,
    });
  } catch (error) {
    console.error("Error updating like/dislike:", error);
    return NextResponse.json(
      { error: "Failed to update vote" },
      { status: 500 }
    );
  }
}
```

---

## Breadcrumbs

### Breadcrumbs Component

```typescript
// components/ui/Breadcrumbs.tsx
"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface BreadcrumbItem {
  label: string;
  href: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export default function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("flex items-center space-x-1 text-sm", className)}
    >
      {items.map((item, index) => (
        <div key={item.href} className="flex items-center">
          {index > 0 && (
            <ChevronRight className="h-4 w-4 text-muted-foreground mx-1" />
          )}
          {index === items.length - 1 ? (
            <span className="font-medium text-foreground">{item.label}</span>
          ) : (
            <Link
              href={item.href}
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              {item.label}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
}
```

---

## Full Blog Page Template

### Blog Page Client Component

```typescript
// app/blog/[slug]/BlogPageClient.tsx
"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { urlFor } from "@/sanity/lib/image";
import { PortableText } from "@portabletext/react";
import { CustomComponent } from "@/components/CustomComponent";
import { TableOfContents } from "@/components/TableOfContents";
import RelatedPosts from "@/components/RelatedPosts";
import { useEffect, useState } from "react";
import LikeDislikeButtons from "@/components/ui/LikeDislikeButtons";
import { Calendar, User } from "lucide-react";
import { Post } from "@/types/post";
import FaqSection from "@/components/Faq";
import { JsonLdFaq } from "@/components/JsonLdFaq";
import JsonLdBlog from "@/components/JsonLdBlog";
import Breadcrumbs from "@/components/ui/Breadcrumbs";

export default function BlogPageClient({
  blog,
  slug,
}: {
  blog: Post;
  slug: string;
}) {
  const [likes, setLikes] = useState(blog?.likes || 0);
  const [dislikes, setDislikes] = useState(blog?.dislikes || 0);
  const [userVote, setUserVote] = useState<"like" | "dislike" | null>(null);
  const [showAnimation, setShowAnimation] = useState<"like" | "dislike" | null>(
    null
  );

  useEffect(() => {
    const vote = localStorage.getItem(`vote_${slug}`);
    if (vote) {
      setUserVote(vote as "like" | "dislike");
    }
  }, [slug]);

  const handleVote = async (action: "like" | "dislike") => {
    const newAction = userVote === action ? `un${action}` : action;

    setUserVote(userVote === action ? null : action);
    if (userVote === action) {
      localStorage.removeItem(`vote_${slug}`);
    } else {
      localStorage.setItem(`vote_${slug}`, action);
    }
    if (userVote !== action) {
      setShowAnimation(action);
      setTimeout(() => setShowAnimation(null), 1000);
    }

    const newLikes = newAction === "like" ? likes + 1 : newAction === "unlike" ? likes - 1 : likes;
    const newDislikes = newAction === "dislike" ? dislikes + 1 : newAction === "undislike" ? dislikes - 1 : dislikes;

    setLikes(newLikes);
    setDislikes(newDislikes);

    try {
      const response = await fetch("/api/like", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ slug, action: newAction }),
      });

      if (response.ok) {
        const data = await response.json();
        setLikes(data.likes);
        setDislikes(data.dislikes);
      } else {
        // Revert optimistic update on failure
        setUserVote(null);
        localStorage.removeItem(`vote_${slug}`);
        setLikes(action === "like" ? likes : likes);
        setDislikes(action === "dislike" ? dislikes : dislikes);
      }
    } catch (error) {
      console.error("Error submitting vote:", error);
      // Revert optimistic update on failure
      setUserVote(null);
      localStorage.removeItem(`vote_${slug}`);
      setLikes(action === "like" ? likes : likes);
      setDislikes(action === "dislike" ? dislikes : dislikes);
    }
  };

  if (!blog) {
    return (
      <motion.article
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="relative -top-[90px] flex flex-col min-h-[60vh] items-center justify-center mb-20"
      >
        <div className="flex flex-col items-center justify-center gap-4 p-10">
          <h1 className="text-3xl lg:text-5xl font-bold text-center text-red-500">
            Blog Post Not Found
          </h1>
          <p className="text-lg text-center text-gray-400 max-w-xl">
            Sorry, the blog post you are looking for does not exist or has been
            removed.
          </p>
        </div>
      </motion.article>
    );
  }

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Blog", href: "/blog" },
    { label: blog.title, href: `/blog/${slug}` },
  ];

  return (
    <motion.article
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: "easeOut" }}
      className="relative -top-[120px] flex flex-col min-h-screen mb-20"
    >
      <JsonLdBlog blog={blog} slug={slug} />
      {blog.faqs && blog.faqs.length > 0 && <JsonLdFaq faqs={blog.faqs} />}

      {/* Hero Image Section */}
      <motion.div
        className="relative border-b-4 border-border"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, delay: 0.1 }}
      >
        <div className="absolute top-0 left-0 right-0 h-[30%] bg-gradient-to-b from-black/90 to-transparent" />
        <Image
          className="flex h-[450px] 2xl:h-[750px] w-screen object-cover items-center justify-center"
          src={urlFor(blog.mainImage).url() as string}
          alt={blog.title}
          width={1000}
          height={800}
          priority
        />
        <div className="absolute bottom-0 left-0 right-0 h-[15%] bg-gradient-to-t from-black/40 to-transparent" />
      </motion.div>

      {/* Content Section */}
      <div className="max-w-[1480px] 2xl:max-w-[1360px] xl:max-w-[1160px] mx-auto px-4 sm:px-6 -mt-32 sm:-mt-20">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="bg-blog backdrop-blur-sm rounded-2xl shadow-2xl px-2 py-4 sm:p-4 md:p-8 lg:p-10"
        >
          {/* Header */}
          <header className="mb-8">
            <div className="flex justify-center items-center mb-4 lg:mb-8">
              <Breadcrumbs items={breadcrumbItems} />
            </div>
            <div className="flex flex-wrap gap-2 mb-4 items-center justify-center">
              {!blog.categories || blog.categories.length === 0 ? (
                <span className="bg-gray-500/70 text-white text-xs px-2 py-1 rounded-full">
                  Uncategorized
                </span>
              ) : (
                blog.categories.map(
                  (category: { title: string }, i: React.Key) => (
                    <span
                      key={i}
                      className="bg-[#db4a4a]/70 text-white text-xs px-2 py-1 rounded-full"
                    >
                      {category.title}
                    </span>
                  )
                )
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-center text-heading mb-4">
              {blog.title}
            </h1>
            <div className="flex justify-center items-center space-x-6 text-sm text-muted-foreground">
              <div className="flex items-center space-x-2">
                <User className="h-4 w-4" />
                <span>{blog.author?.name || "Admin"}</span>
              </div>
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4" />
                <span>
                  {new Date(blog._createdAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              </div>
            </div>
            <LikeDislikeButtons
              handleVote={handleVote}
              userVote={userVote}
              showAnimation={showAnimation}
              likes={likes}
              dislikes={dislikes}
            />
          </header>

          {/* Main Content Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 lg:gap-10">
            {/* Table of Contents (Mobile) */}
            <aside className="lg:hidden mb-8">
              <TableOfContents content={blog.content} />
            </aside>

            {/* Table of Contents (Desktop - Sticky) */}
            <aside className="hidden lg:block lg:col-span-4">
              <div className="sticky top-24">
                <TableOfContents content={blog.content} />
              </div>
            </aside>

            {/* Article Body */}
            <div className="lg:col-span-8 px-2">
              <div className="prose prose-lg dark:prose-invert max-w-none prose-headings:font-semibold prose-a:text-primary hover:prose-a:text-primary/80 prose-blockquote:border-l-primary">
                <PortableText
                  value={blog.content}
                  components={CustomComponent}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-center mt-10 lg:mt-16">
            <LikeDislikeButtons
              handleVote={handleVote}
              userVote={userVote}
              showAnimation={showAnimation}
              likes={likes}
              dislikes={dislikes}
              ctaText="Did you find this article helpful?"
            />
          </div>

          {/* FAQ Section */}
          {blog.faqs && blog.faqs.length > 0 && (
            <motion.div
              className="mt-12 lg:mt-16"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.6 }}
            >
              <FaqSection faqs={blog.faqs} />
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* Related Posts Section */}
      <motion.div
        className="max-w-7xl mx-auto mt-14 px-4 sm:px-6 lg:px-8 w-full"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.8 }}
      >
        <RelatedPosts currentSlug={slug} limit={3} />
      </motion.div>
    </motion.article>
  );
}
```

---

## Reading Time Calculation

### Reading Time Utility

```typescript
// lib/readingTime.ts

interface ReadingTimeOptions {
  wordsPerMinute?: number;
  imagesWordCount?: number;
}

export function calculateReadingTime(
  content: any[],
  options: ReadingTimeOptions = {}
) {
  const {
    wordsPerMinute = 200,
    imagesWordCount = 12, // Count each image as 12 words
  } = options;

  let wordCount = 0;
  let imageCount = 0;

  function extractTextFromNode(node: any): string {
    if (typeof node === "string") {
      return node;
    }
    if (Array.isArray(node)) {
      return node.map(extractTextFromNode).join(" ");
    }
    if (node?.text) {
      return node.text;
    }
    if (node?.children) {
      return extractTextFromNode(node.children);
    }
    return "";
  }

  content.forEach((block) => {
    if (block._type === "image" || block._type === "codeBlock") {
      if (block._type === "image") imageCount++;
      // Code blocks are counted separately below
    } else if (block.children) {
      const text = extractTextFromNode(block.children);
      wordCount += text.trim().split(/\s+/).filter(Boolean).length;
    }
  });

  // Add code blocks word count
  content.forEach((block) => {
    if (block._type === "codeBlock" && block.code) {
      wordCount += block.code.trim().split(/\s+/).filter(Boolean).length;
    }
  });

  // Account for images
  wordCount += imageCount * imagesWordCount;

  const minutes = Math.ceil(wordCount / wordsPerMinute);

  return {
    wordCount,
    imageCount,
    minutes,
    text: minutes === 1 ? "1 min read" : `${minutes} min read`,
  };
}
```

---

## Share Buttons

### Share Buttons Component

```typescript
// components/ShareButtons.tsx
"use client";

import { Facebook, Twitter, Linkedin, Link2 } from "lucide-react";
import { toast } from "sonner";

interface ShareButtonsProps {
  url: string;
  title: string;
}

export default function ShareButtons({ url, title }: ShareButtonsProps) {
  const shareLinks = {
    twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard!");
  };

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground">Share:</span>
      <a
        href={shareLinks.twitter}
        target="_blank"
        rel="noopener noreferrer"
        className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        aria-label="Share on Twitter"
      >
        <Twitter size={18} />
      </a>
      <a
        href={shareLinks.facebook}
        target="_blank"
        rel="noopener noreferrer"
        className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        aria-label="Share on Facebook"
      >
        <Facebook size={18} />
      </a>
      <a
        href={shareLinks.linkedin}
        target="_blank"
        rel="noopener noreferrer"
        className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        aria-label="Share on LinkedIn"
      >
        <Linkedin size={18} />
      </a>
      <button
        onClick={handleCopyLink}
        className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        aria-label="Copy link"
      >
        <Link2 size={18} />
      </button>
    </div>
  );
}
```

---

## Portable Text Render Context

### Render Function Helper

```typescript
// components/PortableTextRenderer.tsx
"use client";

import { PortableText, PortableTextComponents } from "@portabletext/react";
import { CustomComponent } from "./CustomComponent";

interface PortableTextRendererProps {
  value: any[];
  components?: PortableTextComponents;
  className?: string;
}

export default function PortableTextRenderer({
  value,
  components = CustomComponent,
  className,
}: PortableTextRendererProps) {
  return (
    <div className={className}>
      <PortableText value={value} components={components} />
    </div>
  );
}
```

---

## Best Practices

### Performance Tips

1. **Lazy Load Images**: Use Next.js `Image` component with `priority={false}` for below-fold images
2. **Code Splitting**: Use dynamic imports for heavy components like syntax highlighter
3. **ISR Revalidation**: Set appropriate `revalidate` time based on content update frequency
4. **GROQ Projections**: Always project specific fields, never fetch entire documents

### Accessibility

1. **Alt Text**: Always require alt text for images
2. **Heading IDs**: Generate unique IDs for headings for anchor links
3. **Skip Links**: Add skip-to-content links for keyboard navigation
4. **ARIA Labels**: Add proper ARIA labels for interactive elements

### SEO

1. **Meta Tags**: Use `generateMetadata` for dynamic metadata
2. **JSON-LD**: Add structured data for articles and FAQs
3. **Sitemap**: Include blog posts in dynamic sitemap
4. **Canonical URLs**: Set proper canonical URLs to avoid duplicate content
