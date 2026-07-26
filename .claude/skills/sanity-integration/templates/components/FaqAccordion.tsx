/**
 * FAQ Accordion Component Template
 *
 * Renders FAQ section from Sanity CMS with shadcn/ui Accordion.
 * Includes JSON-LD structured data for SEO.
 *
 * INSTALLATION:
 * 1. Install shadcn/ui accordion: npx shadcn@latest add accordion
 * 2. Copy this file to your components directory
 * 3. Import and use: <FaqSection faqs={post.faqs} />
 *
 * SCHEMA REQUIREMENTS:
 * Add to your post schema:
 * defineField({
 *   name: "faqs",
 *   title: "FAQs",
 *   type: "array",
 *   of: [
 *     defineArrayMember({
 *       type: "object",
 *       name: "faq",
 *       fields: [
 *         defineField({ name: "question", type: "string", validation: Rule => Rule.required() }),
 *         defineField({ name: "answer", type: "text", validation: Rule => Rule.required() }),
 *       ],
 *     }),
 *   ],
 * })
 */

"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { HelpCircle } from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

export interface Faq {
  question: string;
  answer: string;
}

interface FaqProps {
  faqs: Faq[];
  className?: string;
}

// ============================================================================
// FAQ SECTION COMPONENT
// ============================================================================

export default function FaqSection({ faqs, className }: FaqProps) {
  if (!faqs || faqs.length === 0) {
    return null;
  }

  return (
    <section className={`my-8 sm:my-12 ${className || ""}`}>
      {/* Section Header */}
      <div className="text-center mb-6 sm:mb-8">
        <div className="flex items-center justify-center gap-2 mb-2">
          <HelpCircle className="w-5 h-5 text-primary" />
          <h3 className="text-primary font-semibold text-base sm:text-lg">
            FAQ
          </h3>
        </div>
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground">
          Frequently Asked Questions
        </h2>
      </div>

      {/* Accordion */}
      <Accordion type="multiple" className="w-full space-y-3 sm:space-y-4">
        {faqs.map((faq, index) => (
          <AccordionItem
            value={`item-${index}`}
            key={index}
            className="border border-border rounded-lg bg-background/80 backdrop-blur-sm overflow-hidden"
          >
            <AccordionTrigger className="p-3 sm:p-4 text-base sm:text-lg font-semibold text-left hover:text-primary transition-colors duration-300 hover:no-underline">
              {faq.question}
            </AccordionTrigger>
            <AccordionContent className="p-3 sm:p-4 pt-0 text-sm sm:text-base text-muted-foreground leading-relaxed">
              {faq.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

// ============================================================================
// JSON-LD FAQ SCHEMA COMPONENT
// ============================================================================

/**
 * JsonLdFaq - Adds FAQ structured data for SEO
 *
 * Google uses FAQPage schema to display FAQ rich results in search.
 * Include this component in your blog page for better SEO.
 */
export const JsonLdFaq = ({ faqs }: { faqs: Faq[] }) => {
  if (!faqs || faqs.length === 0) return null;

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

// ============================================================================
// USAGE EXAMPLE
// ============================================================================

/**
 * HOW TO USE:
 *
 * import FaqSection, { JsonLdFaq } from "@/components/FaqAccordion";
 *
 * function BlogPost({ post }) {
 *   return (
 *     <article>
 *       <PortableText value={post.content} />
 *
 *       {post.faqs && post.faqs.length > 0 && (
 *         <>
 *           <JsonLdFaq faqs={post.faqs} />
 *           <FaqSection faqs={post.faqs} />
 *         </>
 *       )}
 *     </article>
 *   );
 * }
 */

// ============================================================================
// STYLING VARIATIONS
// ============================================================================

/**
 * For different styling options, you can customize the Accordion components:
 *
 * 1. Modern Card Style:
 * - Use the default style with backdrop-blur and subtle borders
 *
 * 2. Minimal Style:
 * - Remove the border and background from AccordionItem
 * - Add: className="border-b border-border last:border-0 rounded-none bg-transparent"
 *
 * 3. Outlined Style:
 * - Add: className="border-2 border-border rounded-lg"
 *
 * 4. Filled Style:
 * - Add: className="bg-muted border-none rounded-lg"
 */

// ============================================================================
// ACCESSIBILITY NOTES
// ============================================================================

/**
 * Accessibility features included:
 * - Proper heading hierarchy (h2 for section title, h3 for label)
 * - Accordion items have proper aria attributes from shadcn/ui
 * - Keyboard navigation support built into Accordion
 * - Focus states visible with hover states
 *
 * Ensure:
 * - Each question is clear and concise
 * - Answers provide complete information
 * - Consider using semantic HTML for answers (if you switch from text to PortableText)
 */
