# Event Tracking Patterns

## Overview

Event tracking measures user interactions beyond page views: clicks, form submissions, video plays, downloads, etc.

## GA4 Event Model

GA4 uses an event-based model:
- Events = what happened
- Parameters = details about what happened
- User properties = user attributes

## When to Track Events

| Interaction | Event Name | Parameters |
|-------------|------------|------------|
| Button click | `button_click` | `button_name`, `button_location` |
| Form submit | `form_submit` | `form_id`, `form_name`, `success` |
| File download | `file_download` | `file_name`, `file_extension` |
| Video play | `video_play` | `video_title`, `video_duration` |
| Search | `search` | `search_term` |
| Scroll | `scroll` | `percent_scrolled` |
| Outbound click | `click` | `link_url`, `link_classes` |

## Implementation Patterns

### Pattern 1: Simple Button Tracking

```tsx
import { trackGAEvent } from "@/lib/analytics";

<button onClick={() => trackGAEvent("button_click", { button_name: "hero_cta" })}>
  Get Started
</button>
```

### Pattern 2: Form Submission Tracking

```tsx
import { trackGAEvent } from "@/lib/analytics";
import { trackConversion } from "@/lib/gtm";

async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();

  try {
    const res = await fetch("/api/contact", {
      method: "POST",
      body: JSON.stringify(formData),
    });

    if (res.ok) {
      trackGAEvent("form_submit", { form_name: "contact", success: true });
      trackConversion(1, "USD");
    } else {
      trackGAEvent("form_error", { form_name: "contact", error: "api_fail" });
    }
  } catch (err) {
    trackGAEvent("form_error", { form_name: "contact", error: "network" });
  }
}
```

### Pattern 3: Scroll Depth Tracking

```tsx
"use client";
import { useEffect } from "react";
import { trackGAEvent } from "@/lib/analytics";

function ScrollTracker() {
  useEffect(() => {
    let fired: Record<number, boolean> = { 25: false, 50: false, 75: false, 100: false };

    const handleScroll = () => {
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY;
      const scrollPercent = Math.round((scrollTop / (documentHeight - windowHeight)) * 100);

      [25, 50, 75, 100].forEach(threshold => {
        if (scrollPercent >= threshold && !fired[threshold]) {
          fired[threshold] = true;
          trackGAEvent("scroll", { depth_percent: threshold });
        }
      });
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return null;
}
```

### Pattern 4: Download Tracking

```tsx
import { trackGAEvent } from "@/lib/analytics";

<a
  href="/files/guide.pdf"
  onClick={() => trackGAEvent("file_download", { file_name: "guide.pdf", file_type: "pdf" })}
  download
>
  Download Guide
</a>
```

### Pattern 5: Video Tracking

```tsx
import { trackGAEvent } from "@/lib/analytics";

<YouTubeEmbed
  videoid="abc123"
  onPlay={() => trackGAEvent("video_engagement", { action: "play", video_id: "abc123" })}
  onEnd={() => trackGAEvent("video_engagement", { action: "complete", video_id: "abc123" })}
/>
```

### Pattern 6: E-commerce Tracking

```tsx
import { trackGAEvent } from "@/lib/analytics";

// View item
trackGAEvent("view_item", {
  currency: "USD",
  value: 299,
  items: [{
    item_id: "course_001",
    item_name: "Advanced React Course",
    item_category: "Education",
    price: 299,
  }],
});

// Add to cart
trackGAEvent("add_to_cart", {
  currency: "USD",
  value: 299,
  items: [{
    item_id: "course_001",
    item_name: "Advanced React Course",
    quantity: 1,
    price: 299,
  }],
});

// Purchase
trackGAEvent("purchase", {
  currency: "USD",
  transaction_id: generateTransactionId(),
  value: 299,
  tax: 0,
  shipping: 0,
  items: [{
    item_id: "course_001",
    item_name: "Advanced React Course",
    quantity: 1,
    price: 299,
  }],
});
```

## Best Practices

1. **Use descriptive event names**: `button_click` not `click1`
2. **Include relevant parameters**: Context helps analysis
3. **Track success AND failure**: Measure form errors
4. **Use consistent naming**: `form_submit` not `form_submission`
5. **Test in debug mode**: Use GA4 DebugView

## Anti-Patterns

1. **Don't over-track**: Every click = noise, not insight
2. **Don't track PII**: Never send emails, names, etc.
3. **Don't track sensitive data**: Medical, financial, etc.
4. **Don't use custom dimensions when events suffice**: Simplify

## Naming Conventions

| Category | Format | Example |
|----------|--------|---------|
| Events | `snake_case` | `button_click` |
| Parameters | `snake_case` | `button_name` |
| Item names | Sentence case | `Course Title` |
| Values | Lowercase | `usd` (for currency) |