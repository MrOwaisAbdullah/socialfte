import { defineArrayMember, defineField, defineType } from "sanity"
import { ShoppingBagIcon } from "@sanity/icons"

/**
 * Product Schema Template
 *
 * Use this template for e-commerce product content types.
 * Includes pricing, inventory, variants, and gallery.
 */
export const productType = defineType({
  name: "product",
  title: "Product",
  type: "document",
  icon: ShoppingBagIcon,
  fields: [
    // === Basic Info ===
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
      name: "description",
      type: "text",
      rows: 5,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "shortDescription",
      title: "Short Description",
      type: "text",
      rows: 2,
      validation: (Rule) => Rule.max(160),
    }),

    // === Media ===
    defineField({
      name: "mainImage",
      type: "image",
      options: { hotspot: true },
      fields: [
        defineField({
          name: "alt",
          type: "string",
          validation: (Rule) => Rule.required(),
        }),
      ],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "gallery",
      title: "Image Gallery",
      type: "array",
      of: [
        defineArrayMember({
          type: "image",
          options: { hotspot: true },
          fields: [
            defineField({ name: "alt", type: "string" }),
          ],
        }),
      ],
    }),

    // === Pricing ===
    defineField({
      name: "price",
      type: "number",
      validation: (Rule) => Rule.required().min(0).precision(2),
    }),
    defineField({
      name: "compareAtPrice",
      title: "Compare at Price",
      type: "number",
      validation: (Rule) => Rule.min(0).precision(2),
    }),
    defineField({
      name: "currency",
      title: "Currency",
      type: "string",
      initialValue: "USD",
      options: {
        list: [
          { title: "US Dollar", value: "USD" },
          { title: "Euro", value: "EUR" },
          { title: "British Pound", value: "GBP" },
        ],
      },
    }),

    // === Inventory ===
    defineField({
      name: "sku",
      title: "SKU",
      type: "string",
    }),
    defineField({
      name: "inStock",
      type: "boolean",
      initialValue: true,
    }),
    defineField({
      name: "stockQuantity",
      type: "number",
      initialValue: 0,
    }),
    defineField({
      name: "lowStockThreshold",
      type: "number",
      initialValue: 10,
    }),

    // === Organization ===
    defineField({
      name: "categories",
      type: "array",
      of: [defineArrayMember({ type: "reference", to: { type: "category" } })],
    }),
    defineField({
      name: "tags",
      type: "array",
      of: [{ type: "string" }],
    }),
    defineField({
      name: "brand",
      title: "Brand",
      type: "reference",
      to: { type: "brand" },
    }),

    // === Variants ===
    defineField({
      name: "variants",
      type: "array",
      of: [
        defineArrayMember({
          type: "object",
          name: "variant",
          fields: [
            defineField({ name: "name", type: "string" }),
            defineField({ name: "price", type: "number" }),
            defineField({
              name: "color",
              type: "string",
              description: "Hex code or color name",
            }),
            defineField({ name: "size", type: "string" }),
            defineField({ name: "inStock", type: "boolean" }),
            defineField({
              name: "images",
              type: "array",
              of: [{ type: "image" }],
            }),
          ],
        }),
      ],
    }),

    // === SEO ===
    defineField({
      name: "seoTitle",
      type: "string",
      validation: (Rule) => Rule.max(60),
    }),
    defineField({
      name: "seoDescription",
      type: "text",
      validation: (Rule) => Rule.max(160),
    }),
  ],
  preview: {
    select: {
      title: "title",
      price: "price",
      media: "mainImage",
      inStock: "inStock",
    },
    prepare(selection) {
      const { price, inStock } = selection
      return {
        title: selection.title,
        subtitle: inStock ? `$${price}` : "Out of Stock",
        media: selection.media,
      }
    },
  },
})
