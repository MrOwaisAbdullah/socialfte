// Template registry — single source of truth for which templateId maps to
// which component and which props it requires. Both the render-preview page
// (Story 5) and the render API route's validation (FR-014) read this instead
// of duplicating the template list. Adding a new template later means adding
// one entry here — the render route itself never needs to change (spec.md
// Edge Cases).
import type { ComponentType } from 'react';
import Hero from './hero';
import PriceCard from './price-card';
import SetBreakdown from './set-breakdown';
import Quote from './quote';
import BeforeAfter from './before-after';
import CarouselSlide from './carousel-slide';
import BoldHeadline from './bold-headline';
import ExclusiveBadge from './exclusive-badge';
import LightCircleFrame from './light-circle-frame';
import SweetDreams from './sweet-dreams';
import type { Aspect, BrandTokens } from './aspect';

type TemplateProps = Record<string, unknown> & { aspect?: Aspect; brand: BrandTokens };

export const TEMPLATE_REGISTRY: Record<
  string,
  { Component: ComponentType<TemplateProps>; requiredProps: string[] }
> = {
  hero: { Component: Hero as ComponentType<TemplateProps>, requiredProps: ['imageUrl', 'headline'] },
  'price-card': {
    Component: PriceCard as ComponentType<TemplateProps>,
    requiredProps: ['productName', 'tierLabel', 'price'],
  },
  'set-breakdown': {
    Component: SetBreakdown as ComponentType<TemplateProps>,
    requiredProps: ['setName', 'pieces', 'bundlePrice'],
  },
  quote: { Component: Quote as ComponentType<TemplateProps>, requiredProps: ['quote', 'thumbnailUrl'] },
  'before-after': {
    Component: BeforeAfter as ComponentType<TemplateProps>,
    requiredProps: ['beforeImageUrl', 'afterImageUrl'],
  },
  'carousel-slide': {
    Component: CarouselSlide as ComponentType<TemplateProps>,
    requiredProps: ['imageUrl', 'headline'],
  },
  // Sample-posts/-inspired templates (Bold Headline.png, Exclusive + Save
  // Badge.png, Light Circle Frame.png, Sweet Dreams.png) — badge/CTA/phone
  // text are all optional with in-component defaults or honest omission
  // (see each component), not required here, since compose_batch.py has no
  // dedicated discount/phone-number field to generate them from.
  'bold-headline': {
    Component: BoldHeadline as ComponentType<TemplateProps>,
    requiredProps: ['imageUrl', 'headline'],
  },
  'exclusive-badge': {
    Component: ExclusiveBadge as ComponentType<TemplateProps>,
    requiredProps: ['imageUrl', 'headline'],
  },
  'light-circle-frame': {
    Component: LightCircleFrame as ComponentType<TemplateProps>,
    requiredProps: ['imageUrl', 'headline'],
  },
  'sweet-dreams': {
    Component: SweetDreams as ComponentType<TemplateProps>,
    requiredProps: ['imageUrl', 'headline'],
  },
};

export function validateTemplateProps(templateId: string, props: Record<string, unknown>): string[] {
  const entry = TEMPLATE_REGISTRY[templateId];
  if (!entry) return [`unknown templateId: ${templateId}`];
  return entry.requiredProps.filter((key) => props[key] === undefined || props[key] === null);
}
