# Google Analytics 4 (GA4) Reference

## Overview

GA4 is Google's latest analytics platform with event-based data model, privacy features, and cross-platform tracking.

## Installation via @next/third-parties

```bash
npm install @next/third-parties
```

## Component Usage

```tsx
import { GoogleAnalytics } from "@next/third-parties/google";

// app/layout.tsx
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
      <GoogleAnalytics gaId="G-XXXXXXXXXX" />
    </html>
  );
}
```

## Event Tracking

### Basic Event

```ts
import { sendGAEvent } from "@next/third-parties/google";

sendGAEvent("event", "button_click", {
  button_name: "cta_section",
});
```

### Recommended Events (GA4)

| Event | When | Parameters |
|-------|------|------------|
| `page_view` | Page load | `page_location`, `page_referrer` |
| `search` | User searches | `search_term` |
| `select_content` | User selects item | `content_type`, `item_id` |
| `sign_up` | User signs up | `method` |
| `purchase` | User purchases | `value`, `currency`, `items` |
| `lead` | User submits lead | `value`, `currency` |

### E-commerce Events

```ts
// View item
sendGAEvent("event", "view_item", {
  currency: "USD",
  value: 99.99,
  items: [{ item_id: "sku123", item_name: "Course", price: 99.99 }],
});

// Add to cart
sendGAEvent("event", "add_to_cart", {
  currency: "USD",
  value: 99.99,
  items: [{ item_id: "sku123", item_name: "Course", quantity: 1 }],
});

// Purchase
sendGAEvent("event", "purchase", {
  currency: "USD",
  transaction_id: "txn_123",
  value: 99.99,
  items: [{ item_id: "sku123", item_name: "Course", quantity: 1 }],
});
```

## Environment Variables

```env
# .env.local
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

## Debug Mode

```tsx
<GoogleAnalytics
  gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID!}
  debugMode={process.env.NODE_ENV === "development"}
/>
```

Debug mode logs events to console and sends to GA4 debug view.

## User Properties

```ts
sendGAEvent("event", "set", {
  user_id: "user_123",
  user_properties: {
    membership_tier: "premium",
    signup_date: "2025-01-01",
  },
});
```

## Consent Mode

GA4 supports consent mode for GDPR compliance:

```ts
// Update consent state
window.gtag?.("consent", "update", {
  analytics_storage: "granted", // or "denied"
});
```

## Verification

1. Install GA4 DebugView browser extension
2. Enable debug mode in component
3. Trigger events in development
4. Check DebugView for event verification