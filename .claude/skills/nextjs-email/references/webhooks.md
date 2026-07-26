# Brevo Webhooks Reference

Complete guide for implementing webhook event tracking with Brevo.

---

## Overview

Brevo webhooks allow your application to receive real-time notifications about email events. When an event occurs (email delivered, opened, clicked, etc.), Brevo sends a POST request to your configured endpoint.

**Benefits:**
- Track delivery status without polling
- Handle bounces and complaints immediately
- Build analytics and dashboards
- Update database records based on email events

---

## Setting Up Webhooks

### Via Brevo Dashboard

1. Go to **Campaigns > Transactional > Settings > Webhooks**
2. Click **Add a New Webhook**
3. Enter your webhook URL: `https://yourdomain.com/api/webhooks/brevo`
4. Select events to track (see list below)
5. Click **Save**

**Important:** Your webhook endpoint must be publicly accessible.

### Via API

```typescript
const webhookData = {
  url: 'https://yourdomain.com/api/webhooks/brevo',
  events: ['delivered', 'opened', 'clicked', 'bounce'],
  description: 'Transactional email events'
};

// POST /webhooks
await brevo.webhooks.createWebhook(webhookData);
```

---

## Available Events

### Transactional Email Events

| Event | Description | Use For |
|-------|-------------|---------|
| `sent` | Email was sent to Brevo | Tracking initiation |
| `delivered` | Email reached recipient's inbox | Confirming successful delivery |
| `opened` | Recipient opened email | Engagement analytics |
| `clicked` | Recipient clicked a link | CTA performance tracking |
| `soft_bounce` | Temporary delivery failure | Retry logic |
| `hard_bounce` | Permanent delivery failure | Remove from list |
| `invalid_email` | Email address is invalid | Clean database |
| `deferred` | Delivery delayed | Monitoring |
| `complaint` | Recipient marked as spam | Review practices |
| `unsubscribed` | Recipient unsubscribed | Honor opt-out |
| `blocked` | Email blocked by Brevo | Security review |

### Marketing Email Events

Includes all transactional events plus:
- `spam` - Recipient marked as spam (spam folder)
- `list_addition` - Contact added to list
- `list_removal` - Contact removed from list

---

## Webhook Payload Structure

All webhook payloads follow this structure:

```typescript
interface BrevoWebhookPayload {
  event: string;           // Event type (e.g., "delivered")
  email: string;           // Recipient email
  id: number;              // Internal Brevo ID
  date: string;            // Human-readable date
  ts: number;              // Unix timestamp
  "message-id": string;    // Email message ID
  ts_event: number;        // Event timestamp
  subject: string;         // Email subject
  tag: string;             // Serialized tags array
  sending_ip: string;      // IP address that sent the email
  ts_epoch: number;        // Millisecond timestamp
  tags: string[];          // Email tags
  template_id?: number;    // Template ID (if applicable)
  link?: string;           // Clicked link URL (for "clicked" event)
  reason?: string;         // Bounce/complaint reason
}
```

---

## Example Payloads

### Delivered Event

```json
{
  "event": "delivered",
  "email": "recipient@example.com",
  "id": 26224,
  "date": "2024-01-15 10:30:00",
  "ts": 1705309800,
  "message-id": "<20240115123456.abc@relay.brevo.com>",
  "ts_event": 1705309805,
  "subject": "Welcome to Our Service",
  "tag": "[\"welcome-email\"]",
  "sending_ip": "185.41.28.109",
  "ts_epoch": 1705309805223,
  "tags": ["welcome-email"],
  "template_id": 42
}
```

### Opened Event

```json
{
  "event": "opened",
  "email": "recipient@example.com",
  "id": 26224,
  "date": "2024-01-15 10:31:00",
  "ts": 1705309860,
  "message-id": "<20240115123456.abc@relay.brevo.com>",
  "ts_event": 1705309865,
  "subject": "Welcome to Our Service",
  "tag": "[\"welcome-email\"]",
  "sending_ip": "185.41.28.109",
  "ts_epoch": 1705309865223,
  "tags": ["welcome-email"]
}
```

### Clicked Event

```json
{
  "event": "clicked",
  "email": "recipient@example.com",
  "id": 26224,
  "date": "2024-01-15 10:32:00",
  "ts": 1705309920,
  "message-id": "<20240115123456.abc@relay.brevo.com>",
  "ts_event": 1705309925,
  "subject": "Welcome to Our Service",
  "tag": "[\"welcome-email\"]",
  "sending_ip": "185.41.28.109",
  "ts_epoch": 1705309925223,
  "tags": ["welcome-email"],
  "link": "https://yourdomain.com/confirm?token=abc123"
}
```

### Hard Bounce Event

```json
{
  "event": "hard_bounce",
  "email": "invalid@example.com",
  "id": 26225,
  "date": "2024-01-15 10:33:00",
  "ts": 1705309980,
  "message-id": "<20240115123456.def@relay.brevo.com>",
  "ts_event": 1705309985,
  "subject": "Welcome to Our Service",
  "tag": "[\"welcome-email\"]",
  "sending_ip": "185.41.28.109",
  "ts_epoch": 1705309985223,
  "tags": ["welcome-email"],
  "reason": "550 5.1.1 The email account does not exist"
}
```

---

## Implementing Webhook Handler

### Next.js API Route

```typescript
// app/api/webhooks/brevo/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface BrevoWebhookPayload {
  event: string;
  email: string;
  'message-id': string;
  ts_epoch: number;
  tags: string[];
  reason?: string;
  link?: string;
}

export async function POST(request: NextRequest) {
  try {
    const payload: BrevoWebhookPayload = await request.json();

    // Verify webhook (optional - verify signature)
    const signature = request.headers.get('X-Webhook-Signature');

    // Handle different events
    switch (payload.event) {
      case 'delivered':
        await handleDelivered(payload);
        break;

      case 'opened':
        await handleOpened(payload);
        break;

      case 'clicked':
        await handleClicked(payload);
        break;

      case 'hard_bounce':
      case 'invalid_email':
        await handleBounce(payload);
        break;

      case 'complaint':
      case 'spam':
        await handleComplaint(payload);
        break;

      case 'unsubscribed':
        await handleUnsubscribed(payload);
        break;

      default:
        console.log('Unhandled event:', payload.event);
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

async function handleDelivered(payload: BrevoWebhookPayload) {
  // Update delivery status in database
  await prisma.emailEvent.create({
    data: {
      messageId: payload['message-id'],
      event: 'delivered',
      email: payload.email,
      timestamp: new Date(payload.ts_epoch)
    }
  });
  console.log(`Email delivered to ${payload.email}`);
}

async function handleOpened(payload: BrevoWebhookPayload) {
  await prisma.emailEvent.create({
    data: {
      messageId: payload['message-id'],
      event: 'opened',
      email: payload.email,
      timestamp: new Date(payload.ts_epoch)
    }
  });
  console.log(`Email opened by ${payload.email}`);
}

async function handleClicked(payload: BrevoWebhookPayload) {
  await prisma.emailEvent.create({
    data: {
      messageId: payload['message-id'],
      event: 'clicked',
      email: payload.email,
      metadata: { link: payload.link },
      timestamp: new Date(payload.ts_epoch)
    }
  });
  console.log(`Link clicked by ${payload.email}: ${payload.link}`);
}

async function handleBounce(payload: BrevoWebhookPayload) {
  // Mark email as invalid in database
  await prisma.user.updateMany({
    where: { email: payload.email },
    data: { emailValid: false, bounceReason: payload.reason }
  });

  await prisma.emailEvent.create({
    data: {
      messageId: payload['message-id'],
      event: 'bounced',
      email: payload.email,
      metadata: { reason: payload.reason },
      timestamp: new Date(payload.ts_epoch)
    }
  });
  console.log(`Email bounced for ${payload.email}: ${payload.reason}`);
}

async function handleComplaint(payload: BrevoWebhookPayload) {
  // Unsubscribe user immediately
  await prisma.user.updateMany({
    where: { email: payload.email },
    data: { emailMarketingOptOut: true }
  });

  console.log(`Spam complaint from ${payload.email} - unsubscribed`);
}

async function handleUnsubscribed(payload: BrevoWebhookPayload) {
  // Honor unsubscribe request
  await prisma.user.updateMany({
    where: { email: payload.email },
    data: { emailMarketingOptOut: true }
  });

  console.log(`${payload.email} unsubscribed`);
}
```

---

## Webhook Security

### Verify Webhook Signature

```typescript
import crypto from 'crypto';

function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(payload).digest('base64');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(digest)
  );
}

export async function POST(request: NextRequest) {
  const rawPayload = await request.text();
  const signature = request.headers.get('X-Webhook-Signature');

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 401 });
  }

  const isValid = verifyWebhookSignature(
    rawPayload,
    signature,
    process.env.BREVO_WEBHOOK_SECRET!
  );

  if (!isValid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }

  // Process webhook...
}
```

### IP Whitelisting

Brevo sends webhooks from these IP ranges (configure firewall):
- `185.41.28.0/24`
- `185.41.29.0/24`

---

## Webhook Limits

| Limit | Value |
|-------|-------|
| Maximum webhooks | 40 (transactional + marketing combined) |
| Maximum URL length | 2048 characters |
| Retry attempts | 3 over 24 hours |
| Retry interval | Exponential backoff |

---

## Testing Webhooks

### Using RequestBin (Development)

1. Go to https://requestbin.com
2. Create a new request bin
3. Copy the endpoint URL
4. Configure webhook in Brevo with this URL
5. Send test email
6. View incoming requests in RequestBin

### Using ngrok (Local Development)

```bash
# Install ngrok
npm install -g ngrok

# Start your local server
npm run dev

# In another terminal, expose your local server
ngrok http 3000

# Use the ngrok URL for webhook configuration
# Example: https://abc123.ngrok.io/api/webhooks/brevo
```

### Send Test Webhook

```bash
curl -X POST https://yourdomain.com/api/webhooks/brevo \
  -H "Content-Type: application/json" \
  -d '{
    "event": "delivered",
    "email": "test@example.com",
    "message-id": "test-123",
    "ts_epoch": 1705309805223,
    "tags": ["test"],
    "subject": "Test Email"
  }'
```

---

## Event Handling Best Practices

### 1. Process Async, Respond Quickly

```typescript
export async function POST(request: NextRequest) {
  const payload = await request.json();

  // Respond immediately, process async
  processWebhookAsync(payload).catch(console.error);

  return NextResponse.json({ received: true });
}

async function processWebhookAsync(payload: BrevoWebhookPayload) {
  // Handle webhook without blocking response
}
```

### 2. Idempotency (Deduplication)

```typescript
// Use message-id + event as unique key
const eventKey = `${payload['message-id']}-${payload.event}`;

const exists = await prisma.emailEvent.findUnique({
  where: { key: eventKey }
});

if (!exists) {
  await prisma.emailEvent.create({
    data: { key: eventKey, ...payload }
  });
}
```

### 3. Error Logging

```typescript
import { prisma } from '@/lib/db';

async function handleWebhook(payload: BrevoWebhookPayload) {
  try {
    await processEvent(payload);
  } catch (error) {
    // Log error for investigation
    await prisma.webhookError.create({
      data: {
        event: payload.event,
        email: payload.email,
        error: String(error),
        payload: JSON.stringify(payload)
      }
    });
    throw error; // Still return error to trigger retry
  }
}
```

---

## Common Issues

### Issue: Webhook Not Received

**Possible causes:**
1. URL not publicly accessible
2. Firewall blocking Brevo IPs
3. Invalid URL (returns 4xx/5xx)
4. Webhook deleted or disabled

**Solution:** Test with RequestBin, check server logs, verify URL.

### Issue: Duplicate Events

**Possible causes:** Brevo retries on failure

**Solution:** Implement idempotency with unique constraints.

### Issue: Missing Events

**Possible causes:** Webhook limit reached (40 max)

**Solution:** Delete unused webhooks, consolidate events.
