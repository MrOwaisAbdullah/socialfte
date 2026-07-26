import { defineArrayMember, defineField, defineType } from "sanity"
import { DocumentTextIcon } from "@sanity/icons"

/**
 * Blog Post Schema Template
 *
 * Copy and customize this template for blog post content types.
 * Add/remove fields as needed for your specific requirements.
 */
export const postType = defineType({
  name: "post",
  title: "Post",
  type: "document",
  icon: DocumentTextIcon,
  fields: [
    // === Basic Fields ===
    defineField({
      name: "title",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "slug",
      type: "slug",
      options: {
        source: "title",
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "summary",
      type: "text",
      rows: 3,
      validation: (Rule) => Rule.required().max(300),
    }),

    // === Content ===
    defineField({
      name: "content",
      type: "array",
      of: [{ type: "block" }],
      validation: (Rule) => Rule.required(),
    }),

    // === Media ===
    defineField({
      name: "mainImage",
      type: "image",
      options: {
        hotspot: true,
      },
      fields: [
        defineField({
          name: "alt",
          type: "string",
          title: "Alternative text",
          validation: (Rule) => Rule.required(),
        }),
      ],
      validation: (Rule) => Rule.required(),
    }),

    // === Relationships ===
    defineField({
      name: "author",
      type: "reference",
      to: { type: "author" },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "categories",
      type: "array",
      of: [defineArrayMember({ type: "reference", to: { type: "category" } })],
      validation: (Rule) => Rule.required().min(1),
    }),

    // === SEO Fields ===
    defineField({
      name: "seoTitle",
      title: "SEO Title",
      type: "string",
      description: "Custom title for search engines (max 60 characters)",
      validation: (Rule) => Rule.max(60),
    }),
    defineField({
      name: "seoDescription",
      title: "SEO Description",
      type: "text",
      rows: 3,
      description: "Meta description for search results (max 160 characters)",
      validation: (Rule) => Rule.max(160),
    }),
    defineField({
      name: "focusKeyword",
      title: "Focus Keyword",
      type: "string",
    }),
    defineField({
      name: "ogImage",
      title: "Open Graph Image",
      type: "image",
      description: "Override main image for social sharing (recommended: 1200x630)",
      options: { hotspot: true },
    }),

    // === Publishing ===
    defineField({
      name: "publishedAt",
      type: "datetime",
      initialValue: () => new Date().toISOString(),
    }),
    defineField({
      name: "status",
      title: "Status",
      type: "string",
      options: {
        list: [
          { title: "Draft", value: "draft" },
          { title: "Published", value: "published" },
          { title: "Archived", value: "archived" },
        ],
      },
      initialValue: "draft",
    }),
    defineField({
      name: "featured",
      type: "boolean",
      initialValue: false,
    }),

    // === Engagement ===
    defineField({
      name: "likes",
      title: "Likes",
      type: "number",
      initialValue: 0,
      readOnly: true,
    }),
    defineField({
      name: "dislikes",
      title: "Dislikes",
      type: "number",
      initialValue: 0,
      readOnly: true,
    }),

    // === Extended Content ===
    defineField({
      name: "faqs",
      title: "FAQs",
      type: "array",
      of: [
        defineArrayMember({
          type: "object",
          name: "faq",
          fields: [
            defineField({
              name: "question",
              type: "string",
              title: "Question",
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "answer",
              type: "text",
              title: "Answer",
              validation: (Rule) => Rule.required(),
            }),
          ],
        }),
      ],
    }),
  ],
  preview: {
    select: {
      title: "title",
      author: "author.name",
      media: "mainImage",
      categories: "categories",
    },
    prepare(selection) {
      const { author, categories } = selection
      const categoryList = categories?.map((c: any) => c.title).join(", ")
      return {
        title: selection.title,
        subtitle: author ? `by ${author}${categoryList ? ` • ${categoryList}` : ""}` : undefined,
        media: selection.media,
      }
    },
  },
})
