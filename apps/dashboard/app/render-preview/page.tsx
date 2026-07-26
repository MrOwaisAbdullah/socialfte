import { notFound } from 'next/navigation';
import { TEMPLATE_REGISTRY } from '@/components/templates/registry';
import type { Aspect } from '@/components/templates/aspect';

// Headless render target for Puppeteer (Story 5, FR-015). No nav, no app
// chrome — literally the template component and nothing else. `searchParams`
// is a Promise in Next.js 15/16 (research.md Decision 4) — must be awaited.
export default async function RenderPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ templateId?: string; props?: string; aspect?: string; brand?: string }>;
}) {
  const { templateId, props: propsJson, aspect, brand: brandJson } = await searchParams;

  const entry = templateId ? TEMPLATE_REGISTRY[templateId] : undefined;
  if (!entry || !propsJson || !brandJson) {
    notFound();
  }

  const props = JSON.parse(propsJson);
  const brand = JSON.parse(brandJson);
  const { Component } = entry;

  return <Component {...props} aspect={aspect as Aspect | undefined} brand={brand} />;
}
