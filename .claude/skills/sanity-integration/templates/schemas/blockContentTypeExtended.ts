/**
 * Extended Block Content Schema for Sanity CMS
 *
 * This schema includes support for:
 * - Rich text blocks (headings, paragraphs, lists, blockquotes)
 * - Inline code and code blocks with syntax highlighting
 * - Inline images with captions
 * - Callout boxes (info, warning, success, error)
 * - Video embeds (YouTube, Vimeo)
 * - Custom annotations and marks
 *
 * INSTALLATION:
 * 1. Copy this file to: sanity/schemaTypes/blockContentType.ts
 * 2. Add to schemaTypes/index.ts: export { blockContentType } from './blockContentType'
 * 3. Use in content schemas: defineField({ name: "content", type: "array", of: [{ type: "blockContent" }] })
 */

import { defineType, defineArrayMember } from "sanity";
import { CodeIcon, ImageIcon, InfoIcon, AlertTriangleIcon, CheckCircleIcon, XCircleIcon, VideoIcon } from "@sanity/icons";

// ============================================================================
// LANGUAGE OPTIONS FOR CODE BLOCKS
// ============================================================================

const LANGUAGE_OPTIONS = [
  { title: "Plain Text", value: "text" },
  { title: "JavaScript", value: "javascript" },
  { title: "TypeScript", value: "typescript" },
  { title: "Python", value: "python" },
  { title: "Java", value: "java" },
  { title: "C#", value: "csharp" },
  { title: "C++", value: "cpp" },
  { title: "Go", value: "go" },
  { title: "Rust", value: "rust" },
  { title: "PHP", value: "php" },
  { title: "Ruby", value: "ruby" },
  { title: "HTML", value: "html" },
  { title: "CSS / SCSS", value: "css" },
  { title: "JSON", value: "json" },
  { title: "XML", value: "xml" },
  { title: "SQL", value: "sql" },
  { title: "Bash / Shell", value: "bash" },
  { title: "Markdown", value: "markdown" },
  { title: "YAML", value: "yaml" },
  { title: "Dockerfile", value: "docker" },
  { title: "Kotlin", value: "kotlin" },
  { title: "Swift", value: "swift" },
];

// ============================================================================
// MAIN BLOCK CONTENT TYPE
// ============================================================================

export const blockContentType = defineType({
  title: "Block Content",
  name: "blockContent",
  type: "array",
  of: [
    // ========================================================================
    // STANDARD TEXT BLOCKS
    // ========================================================================
    defineArrayMember({
      type: "block",
      // Heading styles
      styles: [
        { title: "Normal", value: "normal" },
        { title: "Heading 1", value: "h1" },
        { title: "Heading 2", value: "h2" },
        { title: "Heading 3", value: "h3" },
        { title: "Heading 4", value: "h4" },
        { title: "Heading 5", value: "h5" },
        { title: "Heading 6", value: "h6" },
        { title: "Quote", value: "blockquote" },
      ],
      // List types
      lists: [
        { title: "Bullet", value: "bullet" },
        { title: "Numbered", value: "number" },
      ],
      // Inline marks (decorators)
      marks: {
        decorators: [
          { title: "Strong", value: "strong" },
          { title: "Emphasis", value: "em" },
          { title: "Code", value: "code" },
          { title: "Underline", value: "underline" },
          { title: "Strikethrough", value: "strike-through" },
          { title: "Highlight", value: "highlight" },
        ],
        // Inline annotations
        annotations: [
          {
            title: "Link",
            name: "link",
            type: "object",
            fields: [
              {
                title: "URL",
                name: "href",
                type: "url",
                validation: (Rule: any) => Rule.required(),
              },
            ],
          },
          {
            title: "Internal Link",
            name: "internalLink",
            type: "object",
            fields: [
              {
                title: "Reference",
                name: "reference",
                type: "reference",
                to: [{ type: "post" }, { type: "page" }],
              },
            ],
          },
        ],
      },
    }),

    // ========================================================================
    // INLINE IMAGES (Within content)
    // ========================================================================
    defineArrayMember({
      type: "image",
      icon: ImageIcon,
      options: { hotspot: true },
      fields: [
        {
          name: "alt",
          type: "string",
          title: "Alternative Text",
          description: "Important for accessibility and SEO",
          validation: (Rule: any) => Rule.required(),
        },
        {
          name: "caption",
          type: "string",
          title: "Caption",
          description: "Optional image caption",
        },
      ],
      preview: {
        select: {
          media: "asset",
          title: "caption",
          alt: "alt",
        },
        prepare({ media, title, alt }: any) {
          return {
            title: title || alt || "Untitled Image",
            media,
          };
        },
      },
    }),

    // ========================================================================
    // CODE BLOCKS
    // ========================================================================
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
          description: "Programming language for syntax highlighting",
          options: {
            list: LANGUAGE_OPTIONS,
          },
          initialValue: "javascript",
        },
        {
          name: "code",
          type: "text",
          title: "Code",
          description: "The code to display",
          validation: (Rule: any) => Rule.required(),
        },
        {
          name: "filename",
          type: "string",
          title: "Filename (Optional)",
          description: "Optional filename to display above the code block",
        },
        {
          name: "showLineNumbers",
          type: "boolean",
          title: "Show Line Numbers",
          initialValue: true,
        },
        {
          name: "highlightLines",
          type: "string",
          title: "Highlight Lines",
          description: "Lines to highlight (e.g., '1,3-5')",
        },
      ],
      preview: {
        select: {
          code: "code",
          language: "language",
        },
        prepare({ code, language }: any) {
          return {
            title: `${language || "Code"} Block`,
            subtitle: code?.substring(0, 50) + (code?.length > 50 ? "..." : ""),
          };
        },
      },
    }),

    // ========================================================================
    // CALLOUT BOXES
    // ========================================================================
    defineArrayMember({
      type: "object",
      name: "callout",
      title: "Callout",
      icon: InfoIcon,
      fields: [
        {
          name: "type",
          type: "string",
          title: "Type",
          options: {
            list: [
              { title: "Info", value: "info" },
              { title: "Warning", value: "warning" },
              { title: "Success", value: "success" },
              { title: "Error", value: "error" },
            ],
          },
          initialValue: "info",
        },
        {
          name: "title",
          type: "string",
          title: "Title (Optional)",
          description: "Optional title for the callout",
        },
        {
          name: "content",
          type: "array",
          of: [{ type: "block" }],
          title: "Content",
          description: "Callout content (supports formatting)",
        },
      ],
      preview: {
        select: {
          type: "type",
          title: "title",
        },
        prepare({ type, title }: any) {
          return {
            title: title || `${type?.charAt(0).toUpperCase() + type?.slice(1)} Callout`,
          };
        },
      },
    }),

    // ========================================================================
    // VIDEO EMBEDS
    // ========================================================================
    defineArrayMember({
      type: "object",
      name: "video",
      title: "Video",
      icon: VideoIcon,
      fields: [
        {
          name: "url",
          type: "url",
          title: "Video URL",
          description: "YouTube or Vimeo URL",
          validation: (Rule: any) =>
            Rule.required().custom((url: string) => {
              if (!url) return true;
              const isYoutube = /youtube\.com|youtu\.be/.test(url);
              const isVimeo = /vimeo\.com/.test(url);
              return isYoutube || isVimeo || "Only YouTube and Vimeo URLs are supported";
            }),
        },
        {
          name: "caption",
          type: "string",
          title: "Caption (Optional)",
        },
        {
          name: "autoplay",
          type: "boolean",
          title: "Autoplay",
          initialValue: false,
        },
      ],
      preview: {
        select: {
          url: "url",
        },
        prepare({ url }: any) {
          return {
            title: "Video",
            subtitle: url,
          };
        },
      },
    }),

    // ========================================================================
    // TWEET EMBEDS
    // ========================================================================
    defineArrayMember({
      type: "object",
      name: "tweet",
      title: "Tweet",
      icon: InfoIcon,
      fields: [
        {
          name: "url",
          type: "url",
          title: "Tweet URL",
          description: "Full URL to the tweet",
          validation: (Rule: any) =>
            Rule.required().custom((url: string) => {
              if (!url) return true;
              return (
                /twitter\.com\/.*\/status\//.test(url) ||
                /x\.com\/.*\/status\//.test(url) ||
                "Please enter a valid Twitter/X URL"
              );
            }),
        },
      ],
      preview: {
        select: {
          url: "url",
        },
        prepare({ url }: any) {
          return {
            title: "Tweet",
            subtitle: url,
          };
        },
      },
    }),

    // ========================================================================
    // DIVIDER / SEPARATOR
    // ========================================================================
    defineArrayMember({
      type: "object",
      name: "divider",
      title: "Divider",
      fields: [
        {
          name: "style",
          type: "string",
          title: "Style",
          options: {
            list: [
              { title: "Solid", value: "solid" },
              { title: "Dashed", value: "dashed" },
              { title: "Dotted", value: "dotted" },
            ],
          },
          initialValue: "solid",
        },
      ],
      preview: {
        prepare() {
          return {
            title: "Divider",
            subtitle: "Horizontal separator",
          };
        },
      },
    }),

    // ========================================================================
    // BUTTON / CTA
    // ========================================================================
    defineArrayMember({
      type: "object",
      name: "button",
      title: "Button",
      fields: [
        {
          name: "text",
          type: "string",
          title: "Button Text",
          validation: (Rule: any) => Rule.required(),
        },
        {
          name: "url",
          type: "url",
          title: "URL",
          validation: (Rule: any) => Rule.required(),
        },
        {
          name: "variant",
          type: "string",
          title: "Style",
          options: {
            list: [
              { title: "Primary", value: "primary" },
              { title: "Secondary", value: "secondary" },
              { title: "Outline", value: "outline" },
              { title: "Ghost", value: "ghost" },
            ],
          },
          initialValue: "primary",
        },
        {
          name: "size",
          type: "string",
          title: "Size",
          options: {
            list: [
              { title: "Small", value: "sm" },
              { title: "Medium", value: "md" },
              { title: "Large", value: "lg" },
            ],
          },
          initialValue: "md",
        },
      ],
      preview: {
        select: {
          text: "text",
          variant: "variant",
        },
        prepare({ text, variant }: any) {
          return {
            title: text || "Button",
            subtitle: variant || "primary",
          };
        },
      },
    }),

    // ========================================================================
    // TABLE (Simple)
    // ========================================================================
    defineArrayMember({
      type: "object",
      name: "table",
      title: "Table",
      fields: [
        {
          name: "rows",
          type: "array",
          title: "Rows",
          of: [
            {
              type: "object",
              name: "row",
              fields: [
                {
                  name: "cells",
                  type: "array",
                  of: [{ type: "string" }],
                  title: "Cells",
                },
                {
                  name: "isHeader",
                  type: "boolean",
                  title: "Header Row",
                  initialValue: false,
                },
              ],
            },
          ],
        },
        {
          name: "caption",
          type: "string",
          title: "Caption (Optional)",
        },
      ],
      preview: {
        select: {
          caption: "caption",
        },
        prepare({ caption }: any) {
          return {
            title: "Table",
            subtitle: caption || "Data table",
          };
        },
      },
    }),
  ],
});

// ============================================================================
// EXPORT HELPER FOR REUSABLE IMPORTS
// ============================================================================

export const LANGUAGE_OPTIONS_LIST = LANGUAGE_OPTIONS;
