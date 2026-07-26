/**
 * Portable Text Components Template
 *
 * Complete template for rendering Portable Text content from Sanity CMS.
 * Includes headings, paragraphs, lists, blockquotes, links, images, and code blocks.
 *
 * USAGE:
 * 1. Install dependencies: npm install @portabletext/react @portabletext/types
 * 2. Copy this file to your components directory
 * 3. Import and use: <PortableText value={content} components={CustomComponent} />
 *
 * REQUIRES:
 * - @sanity/image-url for image URL generation
 * - react-syntax-highlighter for code highlighting (optional)
 * - lucide-react for icons
 */

import { PortableTextComponents } from "@portabletext/react";
import { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { urlFor } from "@/sanity/lib/image";
import { ExternalLink } from "lucide-react";

// Helper function to extract plain text from React nodes
function extractText(content: ReactNode | undefined): string {
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
}

// Helper to generate slug from heading text
function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "");
}

// Create heading with ID for anchor links
function createHeading(level: number, extraClasses = "") {
  return ({ children }: { children?: ReactNode }) => {
    const text = extractText(children);
    const id = generateSlug(text);
    const baseClasses = "text-foreground font-heading scroll-mt-24";

    const levelClasses = {
      1: "text-2xl sm:text-3xl md:text-4xl font-bold mt-6 mb-4",
      2: "text-xl sm:text-2xl md:text-3xl font-bold mt-10 mb-3",
      3: "text-lg sm:text-xl md:text-2xl font-semibold mt-8 mb-2",
      4: "text-base sm:text-lg md:text-xl font-medium mt-6 mb-1",
      5: "text-base sm:text-lg font-medium mt-5 mb-1",
      6: "text-sm sm:text-base font-medium mt-4 mb-1",
    };

    const HeadingTag = `h${level}` as keyof JSX.IntrinsicElements;

    return (
      <HeadingTag
        id={id}
        className={`${baseClasses} ${levelClasses[level as keyof typeof levelClasses]} ${extraClasses}`}
      >
        {children}
      </HeadingTag>
    );
  };
}

// ============================================================================
// MAIN EXPORT - Complete Portable Text Components Configuration
// ============================================================================

export const CustomComponent: PortableTextComponents = {
  // ===========================================================================
  // BLOCK STYLES (Headings, Paragraphs, Blockquotes)
  // ===========================================================================
  block: {
    // Headings H1-H6 with auto-generated IDs for TOC linking
    h1: createHeading(1),
    h2: createHeading(2),
    h3: createHeading(3),
    h4: createHeading(4),
    h5: createHeading(5),
    h6: createHeading(6),

    // Blockquote
    blockquote: ({ children }: { children?: ReactNode }) => (
      <blockquote className="border-l-4 border-primary/50 pl-4 italic my-6 text-muted-foreground bg-muted/30 py-2 rounded-r">
        {children}
      </blockquote>
    ),

    // Normal paragraph
    normal: ({ children }: { children?: ReactNode }) => (
      <p className="text-base lg:text-lg leading-7 mb-6 text-foreground">
        {children}
      </p>
    ),
  },

  // ===========================================================================
  // LISTS (Bullet and Numbered)
  // ===========================================================================
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

  // ===========================================================================
  // LIST ITEMS
  // ===========================================================================
  listItem: {
    bullet: ({ children }: { children?: ReactNode }) => (
      <li className="pl-2 leading-relaxed text-foreground">{children}</li>
    ),
    number: ({ children }: { children?: ReactNode }) => (
      <li className="pl-2 leading-relaxed text-foreground">{children}</li>
    ),
  },

  // ===========================================================================
  // MARKS (Inline Formatting)
  // ===========================================================================
  marks: {
    // Bold text
    bold: ({ children }: { children?: ReactNode }) => (
      <strong className="font-semibold text-foreground">{children}</strong>
    ),

    // Italic text
    italic: ({ children }: { children?: ReactNode }) => (
      <em className="italic text-foreground">{children}</em>
    ),

    // Underlined text
    underline: ({ children }: { children?: ReactNode }) => (
      <span className="underline text-foreground">{children}</span>
    ),

    // Strong (alternative to bold)
    strong: ({ children }: { children?: ReactNode }) => (
      <strong className="font-bold text-foreground">{children}</strong>
    ),

    // Emphasis (alternative to italic)
    em: ({ children }: { children?: ReactNode }) => (
      <em className="italic text-foreground">{children}</em>
    ),

    // Inline code
    code: ({ children }: { children?: ReactNode }) => (
      <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-accent border border-border">
        {children}
      </code>
    ),

    // Strikethrough text
    "strike-through": ({ children }: { children?: ReactNode }) => (
      <span className="line-through text-muted-foreground">{children}</span>
    ),

    // Highlighted text
    highlight: ({ children }: { children?: ReactNode }) => (
      <span className="bg-yellow-200 dark:bg-yellow-900/50 text-foreground px-1 rounded">
        {children}
      </span>
    ),

    // Link annotation
    link: ({
      value,
      children,
    }: {
      value?: { href?: string };
      children?: ReactNode;
    }) => {
      const href = value?.href || "";
      // Check if external link
      const isExternal =
        href.startsWith("http") &&
        !href.includes(window.location.hostname);

      if (isExternal) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:text-primary/80 inline-flex items-center gap-1 transition-colors"
          >
            {children}
            <ExternalLink className="w-3 h-3" />
          </a>
        );
      }

      return (
        <Link
          href={href}
          className="text-primary underline hover:text-primary/80 transition-colors"
        >
          {children}
        </Link>
      );
    },
  },

  // ===========================================================================
  // CUSTOM BLOCK TYPES (Images, Code Blocks, etc.)
  // ===========================================================================
  types: {
    // Image block with Next.js optimization
    image: ({
      value,
    }: {
      value?: {
        asset?: { _ref?: string };
        alt?: string;
        caption?: string;
      };
    }) => {
      if (!value?.asset?._ref) return null;

      return (
        <figure className="my-8">
          <div className="relative w-full aspect-[16/9] rounded-lg overflow-hidden">
            <Image
              src={urlFor(value).url()}
              alt={value.alt || "Blog image"}
              className="object-cover"
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 70vw"
              priority={false}
            />
          </div>
          {value.caption && (
            <figcaption className="text-center text-sm text-muted-foreground mt-2 italic">
              {value.caption}
            </figcaption>
          )}
        </figure>
      );
    },

    // Code block with syntax highlighting
    codeBlock: ({ value }: { value?: { language?: string; code?: string } }) => {
      if (!value?.code) return null;

      // Lazy load syntax highlighter for performance
      const CodeBlock = lazyLoadCodeBlock();

      return <CodeBlock language={value.language || "text"} code={value.code} />;
    },

    // Callout box
    callout: ({ value }: { value?: { content?: any[]; type?: "info" | "warning" | "success" | "error" } }) => {
      if (!value?.content) return null;

      const typeStyles = {
        info: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
        warning: "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800",
        success: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800",
        error: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
      };

      const typeIcons = {
        info: "ℹ️",
        warning: "⚠️",
        success: "✅",
        error: "❌",
      };

      return (
        <div className={`p-4 rounded-lg border my-6 ${typeStyles[value.type || "info"]}`}>
          <span className="mr-2" role="img" aria-label="callout icon">
            {typeIcons[value.type || "info"]}
          </span>
          <PortableText value={value.content} components={MinimalComponents} />
        </div>
      );
    },

    // Video embed (YouTube, Vimeo)
    video: ({ value }: { value?: { url?: string; caption?: string } }) => {
      if (!value?.url) return null;

      // Extract video ID from YouTube URL
      const youtubeMatch = value.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
      if (youtubeMatch) {
        return (
          <figure className="my-8">
            <div className="relative w-full aspect-video rounded-lg overflow-hidden">
              <iframe
                src={`https://www.youtube.com/embed/${youtubeMatch[1]}`}
                title="YouTube video player"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
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

      // Extract video ID from Vimeo URL
      const vimeoMatch = value.url.match(/vimeo\.com\/(\d+)/);
      if (vimeoMatch) {
        return (
          <figure className="my-8">
            <div className="relative w-full aspect-video rounded-lg overflow-hidden">
              <iframe
                src={`https://player.vimeo.com/video/${vimeoMatch[1]}`}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
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

      return null;
    },

    // Tweet embed
    tweet: ({ value }: { value?: { url?: string } }) => {
      if (!value?.url) return null;

      const tweetId = value.url.match(/status\/(\d+)/)?.[1];
      if (!tweetId) return null;

      return (
        <div className="my-8 flex justify-center">
          <blockquote className="twitter-tweet" data-theme="dark">
            <a href={value.url}>Loading Tweet...</a>
          </blockquote>
          <script
            async
            src="https://platform.twitter.com/widgets.js"
            charSet="utf-8"
          />
        </div>
      );
    },
  },
};

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

// Minimal components for nested Portable Text rendering
const MinimalComponents: PortableTextComponents = {
  block: {
    normal: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  },
  marks: {
    link: ({ value, children }: { value?: { href?: string }; children?: ReactNode }) => (
      <a href={value?.href}>{children}</a>
    ),
  },
};

// Lazy load syntax highlighter to reduce initial bundle size
function lazyLoadCodeBlock() {
  const CodeBlock = ({ language, code }: { language: string; code: string }) => {
    const [SyntaxHighlighter, setSyntaxHighlighter] = useState<any>(null);

    useEffect(() => {
      import("react-syntax-highlighter").then((mod) => {
        import("react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus").then(
          (styleMod) => {
            setSyntaxHighlighter({
              default: mod.Prism,
              style: styleMod.default,
            });
          }
        );
      });
    }, []);

    if (!SyntaxHighlighter) {
      return (
        <pre className="bg-gray-900 p-4 rounded-lg overflow-x-auto">
          <code className="text-sm text-gray-300">{code}</code>
        </pre>
      );
    }

    return (
      <div className="my-8 rounded-lg overflow-hidden">
        <div className="bg-gray-800 px-4 py-2 text-sm text-gray-400 flex items-center justify-between">
          <span className="font-mono">{language}</span>
          <button
            onClick={() => navigator.clipboard.writeText(code)}
            className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded transition-colors"
          >
            Copy
          </button>
        </div>
        <SyntaxHighlighter.default
          language={language}
          style={SyntaxHighlighter.style}
          customStyle={{
            margin: 0,
            borderRadius: "0 0 0.5rem 0.5rem",
            fontSize: "0.875rem",
          }}
          showLineNumbers
          wrapLines
        >
          {code}
        </SyntaxHighlighter.default>
      </div>
    );
  };

  // This is a placeholder - in actual usage, properly import and use useState
  return CodeBlock as any;
}

// ============================================================================
// USAGE EXAMPLE
// ============================================================================

/**
 * HOW TO USE:
 *
 * import { PortableText } from "@portabletext/react";
 * import { CustomComponent } from "@/components/PortableTextComponents";
 *
 * function BlogPost({ content }) {
 *   return (
 *     <article>
 *       <PortableText value={content} components={CustomComponent} />
 *     </article>
 *   );
 * }
 */
