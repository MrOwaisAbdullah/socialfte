/**
 * Code Block Component Template
 *
 * Renders code blocks with syntax highlighting from Sanity CMS.
 * Supports both custom code blocks and @sanity/code-input plugin.
 *
 * INSTALLATION OPTIONS:
 *
 * Option 1 (Recommended): Use @sanity/code-input plugin
 * - npm install @sanity/code-input
 * - Add to sanity.config.ts: plugins: [codeInput()]
 * - Add to schema: defineArrayMember({ type: "code" })
 *
 * Option 2: Custom code block with react-syntax-highlighter
 * - npm install react-syntax-highlighter @types/react-syntax-highlighter
 * - See CustomCodeBlock component below
 */

"use client";

import { useState, useEffect } from "react";
import { Check, Copy } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus, oneDark, atomDark } from "react-syntax-highlighter/dist/esm/styles/prism";

// ============================================================================
// TYPES
// ============================================================================

// Code block from @sanity/code-input plugin
interface SanityCodeBlock {
  _type: "code";
  language: string;
  code: string;
  filename?: string;
  highlightedLines?: number[];
}

// Custom code block schema
interface CustomCodeBlock {
  _type: "codeBlock";
  language?: string;
  code: string;
  filename?: string;
  showLineNumbers?: boolean;
  highlightLines?: string;
}

type CodeBlockProps = {
  value: SanityCodeBlock | CustomCodeBlock;
};

// ============================================================================
// THEMES
// ============================================================================

const THEMES = {
  vscDarkPlus,
  oneDark,
  atomDark,
};

type ThemeName = keyof typeof THEMES;

// ============================================================================
// MAIN CODE BLOCK COMPONENT
// ============================================================================

export default function CodeBlock({ value }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  // Handle both @sanity/code-input and custom schema types
  const code = value.code || "";
  const language = value.language || "text";
  const filename = value.filename;
  const showLineNumbers = (value as CustomCodeBlock).showLineNumbers !== false;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };

  // Lazy load syntax highlighter
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="my-8 rounded-lg overflow-hidden bg-gray-900">
        <div className="bg-gray-800 px-4 py-2 text-sm text-gray-400 flex items-center justify-between">
          <span className="font-mono">{language}</span>
          <button
            onClick={handleCopy}
            className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded transition-colors"
          >
            Copy
          </button>
        </div>
        <pre className="p-4 overflow-x-auto">
          <code className="text-sm text-gray-300">{code}</code>
        </pre>
      </div>
    );
  }

  return (
    <div className="my-8 rounded-lg overflow-hidden border border-border">
      {/* Header bar */}
      <div className="bg-gray-800 dark:bg-gray-900 px-4 py-2 text-sm flex items-center justify-between">
        <div className="flex items-center gap-2">
          {filename && (
            <span className="text-gray-400 text-xs font-mono">{filename}</span>
          )}
          <span className="font-mono text-gray-400">{language}</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded transition-colors"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check size={12} />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code content */}
      <SyntaxHighlighter
        language={language}
        style={THEMES.vscDarkPlus}
        customStyle={{
          margin: 0,
          borderRadius: "0 0 0.5rem 0.5rem",
          fontSize: "0.875rem",
          background: "#1e1e1e",
        }}
        showLineNumbers={showLineNumbers}
        wrapLines
        lineNumberStyle={{
          color: "#858585",
          fontSize: "0.75rem",
          paddingRight: "1rem",
          minWidth: "2.5rem",
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

// ============================================================================
// LAZY LOADED VERSION (for better performance)
// ============================================================================

/**
 * LazyCodeBlock - Dynamically imports syntax highlighter
 * Use this to reduce initial bundle size
 */
export function LazyCodeBlock({ value }: CodeBlockProps) {
  const [SyntaxHighlighterModule, setSyntaxHighlighterModule] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const code = value.code || "";
  const language = value.language || "text";

  useEffect(() => {
    import("react-syntax-highlighter")
      .then((mod) => {
        import("react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus").then(
          (styleMod) => {
            setSyntaxHighlighterModule({
              Prism: mod.Prism,
              style: styleMod.default,
            });
          }
        );
      })
      .catch((err) => {
        console.error("Failed to load syntax highlighter:", err);
      });
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };

  if (!SyntaxHighlighterModule) {
    return (
      <div className="my-8 rounded-lg overflow-hidden bg-gray-900 border border-border">
        <div className="bg-gray-800 px-4 py-2 text-sm text-gray-400 flex items-center justify-between">
          <span className="font-mono">{language}</span>
          <button
            onClick={handleCopy}
            className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded transition-colors"
          >
            Copy
          </button>
        </div>
        <pre className="p-4 overflow-x-auto">
          <code className="text-sm text-gray-300 whitespace-pre-wrap">{code}</code>
        </pre>
      </div>
    );
  }

  return (
    <div className="my-8 rounded-lg overflow-hidden border border-border">
      <div className="bg-gray-800 dark:bg-gray-900 px-4 py-2 text-sm flex items-center justify-between">
        <span className="font-mono text-gray-400">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded transition-colors"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? "Copied!" : "Copy"}</span>
        </button>
      </div>
      <SyntaxHighlighterModule.Prism
        language={language}
        style={SyntaxHighlighterModule.style}
        customStyle={{
          margin: 0,
          borderRadius: "0 0 0.5rem 0.5rem",
          fontSize: "0.875rem",
        }}
        showLineNumbers
        wrapLines
      >
        {code}
      </SyntaxHighlighterModule.Prism>
    </div>
  );
}

// ============================================================================
// USAGE IN PORTABLE TEXT COMPONENTS
// ============================================================================

/**
 * Add to your PortableText components:
 *
 * import { PortableTextComponents } from "@portabletext/react";
 * import CodeBlock from "@/components/CodeBlock";
 *
 * export const CustomComponent: PortableTextComponents = {
 *   types: {
 *     code: ({ value }) => <CodeBlock value={value} />,
 *     codeBlock: ({ value }) => <CodeBlock value={value} />,
 *   },
 * };
 */

// ============================================================================
// LANGUAGE MAPPING
// ============================================================================

/**
 * Sanity @code-input uses these language identifiers:
 *
 * - JavaScript: javascript, js
 * - TypeScript: typescript, ts
 * - Python: python, py
 * - Java: java
 * - C#: csharp, c#, cs
 * - C++: cpp, c++
 * - Go: go
 * - Rust: rust
 * - PHP: php
 * - Ruby: ruby
 * - HTML: html
 * - CSS: css, scss, less
 * - JSON: json
 * - XML: xml
 * - SQL: sql
 * - Bash: bash, shell
 * - Markdown: markdown, md
 * - YAML: yaml, yml
 * - Dockerfile: docker
 * - Kotlin: kotlin, kt
 * - Swift: swift
 */

// ============================================================================
// ALTERNATIVE: PRE/CODE WITHOUT SYNTAX HIGHLIGHTING
// ============================================================================

export function SimpleCodeBlock({ value }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const code = value.code || "";
  const language = value.language || "text";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };

  return (
    <div className="my-8 rounded-lg overflow-hidden border border-border bg-gray-900">
      <div className="bg-gray-800 px-4 py-2 text-sm flex items-center justify-between">
        <span className="font-mono text-gray-400">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded transition-colors"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? "Copied!" : "Copy"}</span>
        </button>
      </div>
      <pre className="p-4 overflow-x-auto">
        <code className="text-sm text-gray-300 whitespace-pre-wrap">{code}</code>
      </pre>
    </div>
  );
}
