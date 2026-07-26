---
name: google-tracking-suite
description: |
  Implement Google marketing and analytics tools in Next.js: Google Analytics 4,
  Google Tag Manager, and Google Ads conversion tracking.
  This skill should be used when users ask to add Google Analytics, configure
  Google Tag Manager, set up conversion tracking, implement event tracking,
  track form submissions, or integrate Google marketing tags (GA4, GTM, Ads)
  in Next.js applications.
---

# Google Analytics & Tracking Setup

Set up Google Analytics 4, Google Tag Manager, and Google Ads conversion tracking in Next.js using `@next/third-parties/google`.

## What This Skill Does

- Installs `@next/third-parties/google` package
- Configures `GoogleAnalytics` component in layout
- Sets up `GoogleTagManager` container
- Creates `trackConversion()` utility for Google Ads
- Creates event tracking utilities for GA4/GTM
- Handles environment variables securely
- Supports both GA4 direct and GTM indirect approaches
- UTM capture and cross-page attribution via localStorage
- SaaS conversion event wiring pattern (signup, activation, invite, upgrade)

---

## Octively Implementation (Shipped 2026-05-31)

**Already live in this project — do not re-implement, extend instead.**

### Files Created/Modified
| File | Purpose |
|------|---------|
| `lib/utm.ts` | Captures UTM params from URL → localStorage |
| `lib/analytics.ts` | `trackGAEvent` + `trackGTMEvent` with auto-UTM injection |
| `components/shared/UTMCapture.tsx` | Client component, runs `captureUTM()` on mount, renders null |
| `components/dashboard/OnboardingTracker.tsx` | Fires `bot_created` event, cleans `?onboarding=1` from URL |
| `components/dashboard/UpgradeTracker.tsx` | Fires `plan_upgraded` event, cleans `?upgraded=<plan>` from URL |

### Conversion Events Wired
| Event | Where Fired | Trigger |
|-------|------------|---------|
| `signup_complete` | `dashboard/signup/page.tsx` | After `authClient.signUp.email()` succeeds |
| `bot_created` | `dashboard/bots/[id]/page.tsx` | When `?onboarding=1` param present (set by `createBot` server action) |
| `client_invited` | `InviteClientDialog.tsx` | When `data.emailSent === true` |
| `plan_upgraded` | `dashboard/billing/page.tsx` | When `?upgraded=<plan>` param present (set by PayFast/LS return URL) |

### UTM Flow
1. User clicks UTM link (e.g. `octively.com?utm_source=facebook&utm_medium=community`)
2. `UTMCapture` (in root layout) fires `captureUTM()` → stores in `localStorage['oct_utm']`
3. User navigates, signs up, creates bot — all GA4 events include stored UTM params automatically
4. GA4 receives `{ utm_source: 'facebook', utm_medium: 'community', ...eventParams }`

### Critical Warning — Double Tracking
Having both `GoogleTagManager` and `GoogleAnalytics` in the layout means:
- `sendGAEvent` → goes via gtag.js directly to GA4 ✅
- If GTM also has a GA4 Configuration tag → events fire TWICE ⚠️
- **Fix:** Either remove `GoogleAnalytics` from layout and route via GTM only, OR remove the GA4 tag from GTM dashboard. Pick one path.

## What This Skill Does NOT Do

- Create GTM tag configurations (handled in GTM dashboard)
- Manage cookie consent (use vanilla-cookieconsent or similar)
- Set up Google Ads account or conversion actions
- Configure server-side tagging

---

## Before Implementation

Gather context to ensure successful implementation:

| Source | Gather |
|--------|--------|
| **Codebase** | Next.js version, existing `app/` structure, existing third-party scripts |
| **Conversation** | Tracking requirements (GA4 only, GTM, Ads, or all) |
| **Skill References** | Component patterns from `references/`, API docs from `references/` |
| **User Guidelines** | Project conventions, existing `lib/` structure |

Ensure all required context is gathered before implementing.

---

## Required Clarifications

Ask about USER'S context (not domain knowledge):

1. **Tracking approach**: "Do you want GA4 direct (`GoogleAnalytics`) or GTM container (`GoogleTagManager`)?"
2. **Conversion tracking**: "Do you need Google Ads conversion tracking?"
3. **Credentials**: "Do you have your Measurement ID / GTM ID / Ads ID ready?"

If user has no credentials, guide them to obtain them before implementation.

---

## Supported Components

### @next/third-parties/google Exports

| Component | Purpose | Environment Variable |
|-----------|---------|---------------------|
| `GoogleAnalytics` | GA4 pageviews + events | `NEXT_PUBLIC_GA_MEASUREMENT_ID` |
| `GoogleTagManager` | GTM container management | `NEXT_PUBLIC_GTM_ID` |
| `sendGAEvent` | Track events via gtag.js | N/A |
| `sendGTMEvent` | Track events via dataLayer | N/A |

---

## Quick Setup (GA4 Only)

### Step 1: Install Package

```bash
npm install @next/third-parties
```

### Step 2: Add Environment Variable

```env
# .env.local
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

### Step 3: Update Layout

```tsx
// app/layout.tsx
import { GoogleAnalytics } from "@next/third-parties/google";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
      <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID!} />
    </html>
  );
}
```

### Step 4: Create Event Utility

```ts
// lib/analytics.ts
"use client";
import { sendGAEvent } from "@next/third-parties/google";

export function trackEvent(action: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  sendGAEvent("event", action, params ?? {});
}
```

---

## Complete Setup (GA4 + GTM + Ads)

### Environment Variables

```env
# .env.local
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
NEXT_PUBLIC_GTM_ID=GTM-XXXXXXX
NEXT_PUBLIC_GOOGLE_ADS_ID=AW-XXXXXXXXXX
NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL=XXXXXXXXXXXXXXXXXXXX
```

### Root Layout

```tsx
// app/layout.tsx
import { GoogleAnalytics, GoogleTagManager } from "@next/third-parties/google";

export default function RootLayout({ children }) {
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const gtmId = process.env.NEXT_PUBLIC_GTM_ID;

  return (
    <html lang="en">
      <body>{children}</body>
      {gtmId && <GoogleTagManager gtmId={gtmId} />}
      {gaId && <GoogleAnalytics gaId={gaId} />}
    </html>
  );
}
```

### Analytics Utility

```ts
// lib/analytics.ts
"use client";
import { sendGAEvent, sendGTMEvent } from "@next/third-parties/google";

export function trackGAEvent(
  action: string,
  params?: Record<string, unknown>
) {
  if (typeof window === "undefined") return;
  sendGAEvent("event", action, params ?? {});
}

export function trackGTMEvent(
  eventName: string,
  data?: Record<string, unknown>
) {
  if (typeof window === "undefined") return;
  sendGTMEvent({ event: eventName, ...data });
}
```

### Conversion Tracking Utility

```ts
// lib/gtm.ts
"use client";
import { sendGAEvent } from "@next/third-parties/google";

export function trackConversion(
  value: number = 1,
  currency: string = "USD"
) {
  if (typeof window === "undefined") return;

  const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  const label = process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL;

  if (!adsId || !label) {
    console.warn("[trackConversion] Missing Ads ID or label");
    return;
  }

  const sendTo = `${adsId}/${label}`;
  sendGAEvent("event", "conversion", {
    send_to: sendTo,
    value,
    currency,
    event_callback: () => {
      console.log("[trackConversion] Confirmed:", sendTo);
    },
  });
}
```

---

## Usage Examples

### Track Button Click (GA4)

```tsx
import { trackGAEvent } from "@/lib/analytics";

<button onClick={() => trackGAEvent("button_click", { button_name: "cta" })}>
  Click Me
</button>
```

### Track Form Submission

```tsx
import { trackGAEvent } from "@/lib/analytics";
import { trackConversion } from "@/lib/gtm";

async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  const res = await fetch("/api/contact", { method: "POST", body: formData });

  if (res.ok) {
    trackGAEvent("form_submit", { form_name: "contact" });
    trackConversion(1, "USD"); // If this is a conversion
  }
}
```

### Track with GTM

```tsx
import { trackGTMEvent } from "@/lib/analytics";

trackGTMEvent("purchase", {
  value: 99.99,
  currency: "USD",
  items: [{ item_id: "sku123", item_name: "Course" }],
});
```

---

## Common Patterns

### Conditional Loading (Development vs Production)

```tsx
// Only load in production
{process.env.NODE_ENV === "production" && (
  <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID!} />
)}
```

### Debug Mode

```tsx
<GoogleAnalytics
  gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID!}
  debugMode={process.env.NODE_ENV === "development"}
/>
```

---

## Content Security Policy (CSP) — Required for GA4 + GTM

If your app sets a `Content-Security-Policy` header (e.g. in `next.config.ts`), GTM and GA4 scripts will be **blocked** with errors like:

```
Loading the script 'https://www.googletagmanager.com/gtm.js?id=GTM-XXXXXXX'
violates the following Content Security Policy directive: "script-src 'self' 'unsafe-inline'"
```

The scripts load after React hydration (via `@next/third-parties`) so they won't appear in `curl` output — `curl` produces a false negative. The block only shows in browser DevTools console.

**Required CSP directives** — add these to your existing policy:

```ts
// next.config.ts — in the CSP array
"script-src 'self' 'unsafe-inline' https://*.googletagmanager.com",
"connect-src 'self' https: https://*.google-analytics.com https://*.analytics.google.com",
```

- `script-src` — allows GTM container (`gtm.js`) and GA4 (`gtag/js`) to load from `googletagmanager.com`
- `connect-src` — allows GA4 to POST event data to `google-analytics.com` and `analytics.google.com`

**How to confirm the block is the issue:**
1. Open DevTools → Console tab
2. Look for CSP violation errors mentioning `googletagmanager.com`
3. If present, apply the CSP fix above and redeploy

**Octively fix (shipped Jun 2026):** Applied to `next.config.ts` `CSP` constant — both `script-src` and `connect-src` updated.

---

## Error Handling

| Issue | Cause | Fix |
|-------|-------|-----|
| "gtag is not defined" | Script not loaded | Use `@next/third-parties` components |
| TS error: `undefined` not assignable to `Object` | `sendGAEvent` 3rd param typed as `Object`, not `T \| undefined` | Use `params ?? {}` instead of `params` |
| Double pageviews | Both GA4 + GTM sending pageviews | Disable in GTM or use one method |
| Conversion not firing | Missing env vars | Verify `NEXT_PUBLIC_GOOGLE_ADS_*` set |
| "Misconfigured" in Ads | Incorrect event format | Use `sendGAEvent` with `send_to` param |
| GA4 "Data collection isn't active" | CSP blocking GA scripts, or own browser has ad-blocker | Check DevTools console for CSP errors; test in incognito with extensions off; verify network tab shows POST to `google-analytics.com/g/collect` |
| GTM/GA silently missing in `curl` output | Scripts inject after hydration — SSR HTML has only a preload `<link>`, not the script itself | Use browser DevTools, not `curl`, to verify GA is firing |

---

## Reference Files

| File | When to Read |
|------|--------------|
| `references/ga4.md` | Detailed GA4 implementation |
| `references/gtm.md` | GTM setup and tag management |
| `references/ads-conversion.md` | Google Ads conversion tracking |
| `references/event-tracking.md` | Event tracking patterns and best practices |

---

## Output Checklist

- [ ] `@next/third-parties` installed
- [ ] Environment variables documented in `.env.example`
- [ ] Components added to `app/layout.tsx`
- [ ] Analytics utility created in `lib/`
- [ ] Conversion tracking utility created (if needed)
- [ ] Usage examples provided to user
- [ ] Testing instructions given