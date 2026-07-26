# Sanity Schema Design Patterns

## Core Schema Types Reference

### Document Types (Single Content)

Use `type: "document"` for content types with unique IDs:

```typescript
import { defineType, defineField } from "sanity"
import { DocumentIcon } from "@sanity/icons"

export const pageType = defineType({
  name: "page",
  title: "Page",
  type: "document",
  icon: DocumentIcon,
  fields: [
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
    // ... other fields
  ],
})
```

### Object Types (Reusable Components)

Use `type: "object"` for reusable content blocks:

```typescript
import { defineType, defineField } from "sanity"

export const heroSection = defineType({
  name: "heroSection",
  title: "Hero Section",
  type: "object",
  fields: [
    defineField({
      name: "headline",
      type: "string",
    }),
    defineField({
      name: "description",
      type: "text",
    }),
    defineField({
      name: "cta",
      type: "cta",  // Reference to another object type
    }),
  ],
})
```

## Field Types Reference

### String with Validation

```typescript
defineField({
  name: "title",
  type: "string",
  validation: (Rule) => Rule.required().min(10).max(60),
})
```

### Slug (URL Generation)

```typescript
defineField({
  name: "slug",
  type: "slug",
  options: {
    source: "title",  // Auto-generate from title field
    maxLength: 100,
  },
  validation: (Rule) => Rule.required(),
})
```

### Rich Text (Portable Text)

```typescript
defineField({
  name: "body",
  type: "array",
  of: [{ type: "block" }],
})
```

### Image with Alt Text

```typescript
defineField({
  name: "mainImage",
  type: "image",
  options: {
    hotspot: true,  // Enable focal point selection
  },
  fields: [
    defineField({
      name: "alt",
      type: "string",
      title: "Alternative Text",
      validation: (Rule) => Rule.required(),
    }),
  ],
  validation: (Rule) => Rule.required(),
})
```

### Reference (Relationships)

```typescript
defineField({
  name: "author",
  type: "reference",
  to: { type: "author" },
  validation: (Rule) => Rule.required(),
})
```

### Array of References

```typescript
defineField({
  name: "categories",
  type: "array",
  of: [{ type: "reference", to: { type: "category" } }],
  validation: (Rule) => Rule.required().min(1).max(5),
})
```

### Date/Time

```typescript
defineField({
  name: "publishedAt",
  type: "datetime",
  initialValue: () => new Date().toISOString(),
})
```

### Boolean

```typescript
defineField({
  name: "featured",
  type: "boolean",
  initialValue: false,
})
```

### Number

```typescript
defineField({
  name: "price",
  type: "number",
  validation: (Rule) => Rule.required().min(0).precision(2),
})
```

### Select (Dropdown)

```typescript
defineField({
  name: "status",
  type: "string",
  options: {
    list: [
      { title: "Draft", value: "draft" },
      { title: "Published", value: "published" },
      { title: "Archived", value: "archived" },
    ],
  },
  initialValue: "draft",
})
```

## Complex Patterns

### Multi-Locale Content

```typescript
defineField({
  name: "title",
  type: "object",
  fields: [
    defineField({ name: "en", type: "string" }),
    defineField({ name: "es", type: "string" }),
    defineField({ name: "fr", type: "string" }),
  ],
})
```

### Conditional Fields

Use preview for conditional display:

```typescript
preview: {
  select: {
    title: "title",
    type: "contentType",  // Reference another field
  },
  prepare(selection) {
    return { ...selection }
  },
}
```

### Array Inline Objects

```typescript
defineField({
  name: "features",
  type: "array",
  of: [
    defineArrayMember({
      type: "object",
      name: "feature",
      fields: [
        defineField({ name: "title", type: "string" }),
        defineField({ name: "description", type: "text" }),
        defineField({ name: "icon", type: "string" }),
      ],
    }),
  ],
})
```

### Reusable Object Type in Array

```typescript
// First define the object type
export const pricingTier = defineType({
  name: "pricingTier",
  type: "object",
  fields: [
    defineField({ name: "name", type: "string" }),
    defineField({ name: "price", type: "string" }),
    defineField({ name: "features", type: "array", of: [{ type: "string" }] }),
  ],
})

// Then use it in another schema
defineField({
  name: "pricing",
  type: "array",
  of: [{ type: "pricingTier" }],
})
```

## Validation Patterns

### Required with Custom Error

```typescript
validation: (Rule) =>
  Rule.required()
    .error("Title is required")
    .min(10)
    .warning("Titles shorter than 10 chars may not be SEO-friendly")
```

### Unique Field

```typescript
defineField({
  name: "email",
  type: "string",
  validation: (Rule) =>
    Rule.required()
      .email()
      .custom(async (email, context) => {
        // Check uniqueness
        const existing = await context.client
          .fetch(`*[_type == "user" && email == $email]`)
        return existing.length === 0 ? true : "Email already exists"
      }),
})
```

### Conditional Validation

```typescript
defineField({
  name: "endDate",
  type: "datetime",
  validation: (Rule) =>
    Rule.custom((endDate, context) => {
      const startDate = context.document.startDate
      if (startDate && endDate && new Date(endDate) <= new Date(startDate)) {
        return "End date must be after start date"
      }
      return true
    }),
})
```

## Preview Configuration

Previews show in Studio list view:

```typescript
preview: {
  select: {
    title: "title",
    media: "mainImage",
    author: "author.name",
    category: "categories.0.title",
  },
  prepare(selection) {
    const { title, media, author, category } = selection
    return {
      title: title,
      subtitle: author && category
        ? `${category} — by ${author}`
        : author || category || undefined,
      media: media,
    }
  },
}
```

## Icon Options

Import from `@sanity/icons`:
- DocumentIcon, FileTextIcon
- ImageIcon
- ShoppingBagIcon, ShoppingCartIcon
- CalendarIcon, ClockIcon
- TagIcon
- UserIcon, UsersIcon
- StarIcon, HeartIcon
- SettingsIcon, CogIcon

## Schema Organization

### File Structure

```
sanity/
├── schemaTypes/
│   ├── index.ts         # Exports all schemas
│   ├── postType.ts       # Individual content types
│   ├── authorType.ts
│   ├── categoryType.ts
│   ├── blockContentType.ts
│   └── sharedTypes.ts    # Reusable object types
```

### Export Pattern (`index.ts`)

```typescript
export { postType } from './postType'
export { authorType } from './authorType'
export { categoryType } from './categoryType'
export { blockContentType } from './blockContentType'
export { ctaType } from './sharedTypes'
export { heroSectionType } from './sharedTypes'
```

## Best Practices

1. **Always add slugs** for URL generation
2. **Always add alt text** to images (accessibility + SEO)
3. **Use references** for relationships (avoid duplication)
4. **Add previews** for better Studio UX
5. **Use meaningful icons** for visual identification
6. **Group related fields** using object types
7. **Set reasonable defaults** where appropriate
8. **Use validation** to enforce data quality
9. **Keep schemas focused** - single responsibility
10. **Document custom types** with comments
