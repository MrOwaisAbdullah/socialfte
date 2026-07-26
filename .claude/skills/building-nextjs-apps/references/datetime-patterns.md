# Datetime Patterns (Next.js + UTC)

Handling dates correctly in Next.js applications prevents hydration mismatches and timezone bugs.

## Core Principle: UTC Everywhere

1. **Storage**: Always store dates in UTC (ISO 8601: `2024-01-01T15:30:00.000Z`).
2. **Transmission**: Send UTC strings between client and server.
3. **Display**: Convert to user's local time ONLY at the last moment (UI rendering).

## Handling `datetime-local` Inputs

HTML `<input type="datetime-local">` values do not contain timezone info (e.g., `2024-01-01T10:30`).

### Correct Pattern (using Luxon)

```typescript
import { DateTime } from 'luxon';

// Convert local input to UTC for storage
function handleDateChange(localValue: string) {
  const utcIsoString = DateTime.fromISO(localValue, { zone: 'local' })
    .toUTC()
    .toISO();
  
  // Send utcIsoString to API
  saveToBackend(utcIsoString);
}
```

## Displaying Dates (Avoiding Hydration Mismatches)

Rendering `new Date().toLocaleDateString()` during SSR causes mismatch errors because the server (UTC) and client (Local) differ.

### Option 1: Client-Side Only Rendering
Use a component that only renders date string on the client.

```typescript
'use client';
import { useEffect, useState } from 'react';

export function LocalTime({ date }: { date: string }) {
  const [local, setLocal] = useState<string>('');

  useEffect(() => {
    setLocal(new Date(date).toLocaleString());
  }, [date]);

  return <span>{local || date}</span>; // Fallback to UTC during hydration
}
```

### Option 2: `next-intl` or `react-wrap-balancer`
Use libraries designed for consistent rendering.

### Option 3: UTC Display
If local time isn't strictly required, display UTC or relative time (e.g., "5 mins ago") calculated consistently.

## Server Components

Server components run in Node.js/Edge environment, usually set to UTC.

```typescript
// app/page.tsx (Server Component)
export default async function Page() {
  const now = new Date(); 
  // This will be UTC on Vercel/most hosts
  
  return (
    <div>
      Server time: {now.toISOString()}
      {/* Do NOT format to locale string here if you expect it to match client */}
    </div>
  )
}
```
