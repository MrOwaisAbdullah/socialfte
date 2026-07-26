# Google Ads Conversion Tracking Reference

## Overview

Google Ads conversion tracking measures when users complete valuable actions (form submissions, purchases, signups) after clicking your ads.

## Prerequisites

1. Google Ads account
2. Conversion action created in Google Ads
3. Conversion ID (AW-XXXXXXXXXX)
4. Conversion label (XXXXXXXXXXXXXXXXXXXX)

## Installation via @next/third-parties

```bash
npm install @next/third-parties
```

## Environment Variables

```env
# .env.local
NEXT_PUBLIC_GOOGLE_ADS_ID=AW-XXXXXXXXXX
NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL=XXXXXXXXXXXXXXXXXXXX
```

## Conversion Tracking Utility

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
    console.warn("[trackConversion] Missing Ads credentials");
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

## Usage in Forms

```tsx
import { trackConversion } from "@/lib/gtm";

async function handleEnrollSubmit(e: React.FormEvent) {
  e.preventDefault();

  const res = await fetch("/api/enroll", {
    method: "POST",
    body: JSONData,
  });

  if (res.ok) {
    trackConversion(1, "PKR");
  }
}
```

## Conversion Value Guidelines

| Conversion Type | Value | Currency |
|-----------------|-------|----------|
| Form submission | 1 | Any |
| Newsletter signup | 0.50 | Any |
| Lead | 50-500 | USD |
| Purchase | Actual amount | Any |

## Verification

### Console Check
```
[trackConversion] firing → AW-XXXXXXXXXX/label {value: 1, currency: 'PKR'}
[trackConversion] Confirmed: AW-XXXXXXXXXX/label
```

### Tag Assistant
1. Install Google Tag Assistant extension
2. Click through real Google Ad
3. Submit conversion action
4. Check Tag Assistant for event

### Network Tab
1. Filter by `google`
2. Look for `pagead/conversion` request
3. Check for `en=conversion` parameter

## Common Issues

### "Misconfigured" Status

**Cause**: Google detected the tag but found issues.

**Solutions**:
1. Verify Conversion ID matches exactly
2. Verify Conversion Label matches exactly
3. Wait 24-48 hours for Google to re-crawl
4. Use Tag Assistant for immediate verification

### Conversion Not Recording

**Cause**: GCLID cookie not set (tested without real ad click)

**Solutions**:
1. Must click through actual Google Ad
2. Test in incognito with ad click
3. Check network for `gclid` parameter

### Duplicate Conversions

**Cause**: Multiple conversion tags firing

**Solutions**:
1. Use single `trackConversion()` function
2. Ensure only one call per form submit
3. Check GTM tags (disable if using direct)

## GTM Alternative

If using GTM, send conversion via dataLayer:

```ts
window.dataLayer.push({
  event: "conversion",
  google_conversion_id: "AW-XXXXXXXXXX",
  google_conversion_label: "label",
  google_conversion_value: 1,
  google_conversion_currency: "USD",
});
```

## Privacy Considerations

- Provide clear privacy policy
- Allow users to opt out if possible
- Consider consent mode for EU compliance
- Don't track sensitive user data