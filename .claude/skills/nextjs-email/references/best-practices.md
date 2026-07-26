# Brevo Email Best Practices

Production-proven guidelines for deliverability, security, and performance.

---

## Domain Authentication (MANDATORY)

Since February 1, 2024, **Gmail and Yahoo require domain authentication** for all bulk senders.

### SPF (Sender Policy Framework)

Add to your DNS:

```
Type: TXT
Name: @
Value: v=spf1 include:spf.brevo.com ~all
```

**What it does:** Authorizes Brevo's IP addresses to send emails for your domain.

### DKIM (DomainKeys Identified Mail)

Add to your DNS (get values from Brevo dashboard):

```
Type: TXT
Name: brevo._domainkey
Value: [DKIM 1 value from Brevo]

Type: TXT
Name: brevo2._domainkey
Value: [DKIM 2 value from Brevo]
```

**What it does:** Cryptographically signs emails to prove they're not forged.

### DMARC (Domain-based Message Authentication)

Add to your DNS:

```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com
```

**Policy levels:**
- `p=none` - Monitor only (start here)
- `p=quarantine` - Move suspicious mail to spam
- `p=reject` - Reject unauthenticated mail

---

## Deliverability Best Practices

### 1. Warm Up Your Domain

New domains have no sending reputation. Gradually increase volume:

| Day | Emails/Day |
|-----|------------|
| 1-2 | 50 |
| 3-5 | 100 |
| 6-10 | 250 |
| 11-15 | 500 |
| 16+ | Full volume |

### 2. Validate Email Addresses

Before sending, verify emails exist:

```typescript
function isValidEmail(email: string): boolean {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

// For high-volume, use an email validation service
// Examples: NeverBounce, ZeroBounce, Hunter.io
```

### 3. Always Provide Plain Text Version

```typescript
const emailData = {
  htmlContent: '<h1>Hello</h1><p>Welcome!</p>',
  textContent: 'Hello\n\nWelcome!', // Always include
  // ... other fields
};
```

**Why:** Spam filters prefer emails with both HTML and text versions.

### 4. Use Reply-To Headers

```typescript
const emailData = {
  replyTo: {
    email: 'support@yourdomain.com',
    name: 'Support Team'
  }
};
```

**Why:** Directs replies to the right place, maintains professional appearance.

### 5. Include Unsubscribe Links (Marketing Emails)

```html
<p>If you no longer wish to receive these emails,</p>
<a href="{{unsubscribe}}">click here to unsubscribe</a>
```

**Legal requirement:** CAN-SPAM Act, GDPR, CASL require unsubscribe options.

---

## Security Best Practices

### 1. Environment Variables Only

```typescript
// ✅ GOOD
const apiKey = process.env.BREVO_API_KEY;

// ❌ BAD
const apiKey = 'xkeysib-abc123...';
```

### 2. Escape User Content

```typescript
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

// Use in HTML content
htmlContent: `<p>${escapeHtml(userMessage)}</p>`
```

**Why:** Prevents XSS attacks and email injection.

### 3. Use Read-Only API Keys

Generate separate API keys for different purposes:
- **Transactional** - Full send permissions
- **Marketing** - Campaign management only
- **Webhooks** - Read-only event access

### 4. Never Log Sensitive Data

```typescript
// ✅ GOOD
console.log('Email sent to:', email.substring(0, 3) + '***');

// ❌ BAD
console.log('Email sent to:', email);
console.log('Message content:', message);
```

---

## Performance Best Practices

### 1. Use Async Patterns

```typescript
// ✅ GOOD - Send in background
export async function POST(request: NextRequest) {
  const { email } = await request.json();

  // Don't await - fire and forget for non-critical emails
  sendEmail(email).catch(err => console.error('Email error:', err));

  return NextResponse.json({ success: true });
}

// ❌ BAD - Blocks response
export async function POST(request: NextRequest) {
  await sendEmail(email); // User waits for email to send
  return NextResponse.json({ success: true });
}
```

### 2. Batch Sending for Large Lists

```typescript
// ✅ GOOD - Use messageVersions
await brevo.transactionalEmails.sendTransacEmail({
  messageVersions: recipients.map(r => ({
    to: [{ email: r.email }],
    params: { name: r.name }
  }))
});

// ❌ BAD - Loop API calls
for (const recipient of recipients) {
  await sendEmail(recipient.email); // Slow, rate limit risk
}
```

### 3. Implement Retry Logic

```typescript
async function sendWithRetry(emailData: any, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await brevo.transactionalEmails.sendTransacEmail(emailData);
    } catch (error: any) {
      if (error.response?.status === 429) { // Rate limit
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000)); // Exponential backoff
      } else if (i === maxRetries - 1) {
        throw error;
      }
    }
  }
}
```

---

## Content Best Practices

### 1. Subject Line Guidelines

| Practice | Good | Bad |
|----------|------|-----|
| Length | 30-50 characters | 80+ characters |
| Personalization | `{{params.firstname}}, your order is ready` | `Order Update` |
| Clarity | `Reset your password` | `Important info inside` |
| Urgency | `24-hour sale ends tonight` | `!!!ACT NOW!!!` |

### 2. HTML Email Guidelines

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <style>
    /* Inline styles for email client compatibility */
    body { font-family: Arial, sans-serif; }
    .button { background: #007bff; color: white; }
  </style>
</head>
<body>
  <!-- Table-based layout for Gmail support -->
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <h1>Hello {{params.firstname}}</h1>
      <p>Welcome to our service!</p>
      <a href="{{params.confirmation_url}}" class="button">Confirm</a>
    </td></tr>
  </table>
</body>
</html>
```

**Key points:**
- Use tables, not flexbox/grid
- Inline styles (no external stylesheets)
- Max width: 600px
- Alt text for images
- Test in multiple clients (Gmail, Outlook, Apple Mail)

### 3. Preheader Text

```typescript
htmlContent: `
  <!DOCTYPE html>
  <html>
  <head>
    <!-- Preheader: invisible text shown in inbox preview -->
    <span style="display:none;font-size:0;color:#fff;">
      Confirm your email to get started with {{params.company}}.
    </span>
  </head>
  ...
`,
```

---

## Rate Limits

| Plan | Daily Limit | Hourly Limit |
|------|-------------|--------------|
| Free | 300 emails | ~12/hour |
| Starter | 10,000 emails | ~400/hour |
| Professional | Unlimited | Volume-based |

**Handling rate limits:**

```typescript
import { pRateLimit } from 'p-ratelimit';

const limiter = pRateLimit({
  limit: 10, // 10 emails
  interval: 1000, // per second
});

recipients.forEach(recipient => {
  limiter(() => sendEmail(recipient.email));
});
```

---

## Monitoring and Analytics

### Essential Metrics to Track

| Metric | Benchmark | Action if Below |
|--------|-----------|-----------------|
| Delivery Rate | >95% | Check domain authentication |
| Open Rate | >20% | Improve subject lines |
| Click Rate | >2% | Improve content/CTAs |
| Bounce Rate | <2% | Clean email list |
| Complaint Rate | <0.1% | Review content, frequency |
| Unsubscribe Rate | <0.5% | Reduce frequency, improve relevance |

### Set Up Webhooks

Track these events:
- `delivered` - Confirm successful delivery
- `opened` - Measure engagement
- `clicked` - Track CTA performance
- `bounce` - Clean invalid emails
- `spam` - Remove unhappy subscribers
- `unsubscribed` - Honor opt-outs immediately

---

## Testing Checklist

Before sending to production:

- [ ] Test email sent to real address
- [ ] Verify sender domain authentication
- [ ] Check plain text version renders
- [ ] Test unsubscribe link works
- [ ] Verify personalization variables populate
- [ ] Test in multiple email clients
- [ ] Check mobile responsiveness
- [ ] Verify reply-to address works
- [ ] Confirm scheduled time (if applicable)
- [ ] Test webhook endpoint receives events
