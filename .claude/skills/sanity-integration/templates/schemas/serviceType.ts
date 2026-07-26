import { defineArrayMember, defineField, defineType } from "sanity"
import { LightbulbIcon } from "@sanity/icons"

/**
 * Service Schema Template
 *
 * Use this template for service-based content types.
 * Includes pricing tiers, process steps, and FAQs.
 */
export const serviceType = defineType({
  name: "service",
  title: "Service",
  type: "document",
  icon: LightbulbIcon,
  fields: [
    // === Basic ===
    defineField({
      name: "title",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "title" },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "tagline",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "description",
      type: "text",
      rows: 3,
      validation: (Rule) => Rule.required(),
    }),

    // === Extended Content ===
    defineField({
      name: "longDescription",
      type: "text",
      rows: 5,
    }),

    // === Media ===
    defineField({
      name: "icon",
      title: "Icon Name",
      type: "string",
      description: "Lucide icon name (e.g., 'Bot', 'Zap', 'Rocket')",
    }),
    defineField({
      name: "gradient",
      title: "Gradient Colors",
      type: "string",
      description: "Tailwind gradient classes (e.g., 'from-blue-500 to-cyan-500')",
    }),

    // === Features List ===
    defineField({
      name: "features",
      type: "array",
      of: [{ type: "string" }],
    }),

    // === Tech Stack ===
    defineField({
      name: "techStack",
      title: "Tech Stack",
      type: "array",
      of: [{ type: "string" }],
    }),

    // === Process Steps ===
    defineField({
      name: "process",
      title: "Process Steps",
      type: "array",
      of: [
        defineArrayMember({
          type: "object",
          fields: [
            defineField({
              name: "step",
              type: "number",
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "title",
              type: "string",
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "description",
              type: "text",
            }),
          ],
        }),
      ],
    }),

    // === Pricing ===
    defineField({
      name: "pricing",
      type: "array",
      of: [
        defineArrayMember({
          type: "object",
          fields: [
            defineField({ name: "name", type: "string" }),
            defineField({ name: "price", type: "string" }),
            defineField({
              name: "period",
              type: "string",
              description: "e.g., 'project', '/month', 'one-time'",
            }),
            defineField({
              name: "features",
              type: "array",
              of: [{ type: "string" }],
            }),
            defineField({
              name: "highlighted",
              type: "boolean",
              initialValue: false,
            }),
          ],
        }),
      ],
    }),

    // === FAQs ===
    defineField({
      name: "faqs",
      title: "Frequently Asked Questions",
      type: "array",
      of: [
        defineArrayMember({
          type: "object",
          fields: [
            defineField({
              name: "question",
              type: "string",
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "answer",
              type: "text",
              validation: (Rule) => Rule.required(),
            }),
          ],
        }),
      ],
    }),

    // === Organization ===
    defineField({
      name: "categories",
      type: "array",
      of: [defineArrayMember({ type: "reference", to: { type: "category" } })],
    }),
  ],
  preview: {
    select: {
      title: "title",
      tagline: "tagline",
    },
    prepare(selection) {
      return {
        title: selection.title,
        subtitle: selection.tagline,
      }
    },
  },
})
