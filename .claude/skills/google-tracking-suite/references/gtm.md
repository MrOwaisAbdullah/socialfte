# Google Tag Manager (GTM) Reference

## Overview

GTM is a tag management system that lets you deploy various tracking tags (GA4, Ads, Meta, etc.) without modifying code. Tags are configured in the GTM dashboard.

## Installation via @next/third-parties

```bash
npm install @next/third-parties
```

## Component Usage

```tsx
import { GoogleTagManager } from "@next/third-parties/google";

// app/layout.tsx
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
      <GoogleTagManager gtmId="GTM-XXXXXXX" />
    </html>
  );
}
```

## Sending Events to GTM

```ts
import { sendGTMEvent } from "@next/third-parties/google";

// Send custom event to dataLayer
sendGTMEvent({
  event: "button_click",
  button_name: "cta",
  value: 100,
});
```

## GTM vs GA4 Direct

| Aspect | GoogleTagManager | GoogleAnalytics |
|--------|------------------|-----------------|
| Control | Via GTM dashboard | Via code |
| Flexibility | High (no code changes) | Medium |
| Performance | Slower (loads container) | Faster |
| Multiple tags | Yes | No (GA4 only) |
| Use case | Multiple marketing tools | GA4 only |

## GTM Container Structure

### Tags
Tags define what to fire (GA4 config, conversion tags, etc.)

### Triggers
Triggers define when to fire tags (page view, click, form submit)

### Variables
Variables store dynamic values (data layer, page info, etc.)

## Common GTM Setup in Next.js

### 1. Data Layer Variable
In GTM, create a data layer variable:
- Name: `dlv.event`
- Data Layer Variable Name: `event`

### 2. Custom Event Trigger
Create trigger for custom events:
- Trigger type: Custom Event
- Event name: `.*` (regex for all) or specific name

### 3. Fire GA4 Tag
Connect to GA4 configuration tag with measurement ID.

## Environment Variables

```env
# .env.local
NEXT_PUBLIC_GTM_ID=GTM-XXXXXXX
```

## Advanced Configuration

```tsx
<GoogleTagManager
  gtmId="GTM-XXXXXXX"
  dataLayer={{ user_id: "123", page: "home" }}
/>
```

## GTM Preview Mode

1. Open GTM dashboard
2. Click "Preview" button
3. Enter website URL
4. Test tag firing in debug console

## Common Pitfalls

1. **Double pageviews**: GA4 auto-tracks pageviews + GTM triggers
   - Solution: Disable pageview trigger in GTM if using GA4 direct

2. **GTM not loading**: Script blocked by ad blockers
   - Solution: Use descriptive container name, test in incognito

3. **Events not firing**: Trigger conditions not met
   - Solution: Use GTM Preview mode to debug

## Performance Tips

- Minimize number of tags in container
- Use `afterInteractive` strategy via @next/third-parties
- Avoid blocking scripts
- Use custom HTML tags sparingly