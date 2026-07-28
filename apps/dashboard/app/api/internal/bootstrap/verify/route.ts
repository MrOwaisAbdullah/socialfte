// Bootstrap verification API — runs Step 6 checks server-side AND persists
// what steps 1-5 collected to brand_config (previously ignored the request
// body entirely and only ran a DB ping — collected brand name/tagline/colors
// were thrown away, so nothing the wizard asked for ever took effect).
import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const results: { test: string; passed: boolean; detail: string }[] = [];
  const body = await request.json().catch(() => ({}) as Record<string, unknown>);

  // Database check
  try {
    const { rows } = await db.execute<{ cnt: string }>(sql`SELECT COUNT(*) AS cnt FROM audit_log`);
    results.push({
      test: 'Database',
      passed: true,
      detail: `${rows[0].cnt} audit log rows found`,
    });
  } catch (e: unknown) {
    results.push({ test: 'Database', passed: false, detail: String(e).slice(0, 200) });
  }

  const allOk = results.every((r) => r.passed);

  // Persist steps 1-5's collected fields regardless of allOk (so a failed
  // verify doesn't lose what was typed in) — setup_complete only ever flips
  // true, never back to false, via the OR against the existing row.
  const brandName = typeof body.brandName === 'string' ? body.brandName : null;
  const tagline = typeof body.tagline === 'string' ? body.tagline : null;
  const primaryColor = typeof body.primaryColor === 'string' ? body.primaryColor : null;
  const accentColor = typeof body.accentColor === 'string' ? body.accentColor : null;
  const logoUrl = typeof body.logoUrl === 'string' ? body.logoUrl : null;
  const socialHandle = typeof body.socialHandle === 'string' ? body.socialHandle : null;
  const captionLanguage = typeof body.captionLanguage === 'string' && body.captionLanguage ? body.captionLanguage : null;
  // setup/page.tsx's form state is Record<string, string> (a checkbox stores
  // "true"/"false"), so accept either a real boolean or that string form —
  // only an explicit false turns the mark off.
  const showBrandMark = body.showBrandMark === false || body.showBrandMark === 'false' ? false : true;

  try {
    await db.execute(sql`
      INSERT INTO brand_config (key, brand_name, tagline, primary_color, accent_color, logo_url, social_handle, show_brand_mark, caption_language, setup_complete, updated_at)
      VALUES ('default', ${brandName}, ${tagline}, ${primaryColor}, ${accentColor}, ${logoUrl}, ${socialHandle}, ${showBrandMark}, ${captionLanguage}, ${allOk}, now())
      ON CONFLICT (key) DO UPDATE SET
        brand_name = EXCLUDED.brand_name,
        tagline = EXCLUDED.tagline,
        primary_color = EXCLUDED.primary_color,
        accent_color = EXCLUDED.accent_color,
        logo_url = EXCLUDED.logo_url,
        social_handle = EXCLUDED.social_handle,
        show_brand_mark = EXCLUDED.show_brand_mark,
        caption_language = EXCLUDED.caption_language,
        setup_complete = brand_config.setup_complete OR EXCLUDED.setup_complete,
        updated_at = now()
    `);
  } catch (e: unknown) {
    results.push({ test: 'Save brand config', passed: false, detail: String(e).slice(0, 200) });
  }

  const finalOk = results.every((r) => r.passed);
  return NextResponse.json({ ok: finalOk, results });
}
