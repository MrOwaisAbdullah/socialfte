# Brevo Email Troubleshooting Guide

Common errors, their causes, and solutions.

---

## API Errors

### 401 Unauthorized

**Error:**
```
{"code": "unauthorized", "message": "Invalid API key"}
```

**Causes:**
- Invalid or expired API key
- API key not set in environment

**Solutions:**
```typescript
// Check API key is loaded
const apiKey = process.env.BREVO_API_KEY;
if (!apiKey) {
  throw new Error('BREVO_API_KEY environment variable not set');
}

// Verify API key format (starts with xkeysib-)
if (!apiKey.startsWith('xkeysib-')) {
  console.error('Invalid API key format');
}
```

---

### 402 Payment Required

**Error:**
```
{"code": "payment_required", "message": "Account has insufficient credits"}
```

**Causes:**
- Free tier daily limit reached (300 emails)
- Paid account credits exhausted

**Solutions:**
```typescript
// Check remaining credits before sending
async function getCredits() {
  const account = await brevo.account.getAccount();
  return account.body.plan;
}

// Implement fallback
if (credits <= 0) {
  await queueEmailForLater(emailData);
  notifyAdmin('Email queued - credits exhausted');
}
```

---

### 400 Bad Request - Invalid Sender

**Error:**
```
{"code": "invalid_parameter", "message": "Sender not found or not validated"}
```

**Causes:**
- Sender domain not registered in Brevo
- Sender email not verified
- Using free email domain (Gmail, Yahoo) as sender

**Solutions:**
1. Register sender domain in Brevo Dashboard
2. Verify DNS records (SPF, DKIM, DMARC)
3. Use domain-based email: `noreply@yourdomain.com`

---

### 429 Too Many Requests

**Error:**
```
{"code": "too_many_requests", "message": "Rate limit exceeded"}
```

**Causes:**
- Sending too many emails too quickly
- Concurrent API calls exceeding limits

**Solutions:**
```typescript
import pLimit from 'p-limit';

// Limit concurrent requests
const limit = pLimit(10); // Max 10 concurrent

const tasks = recipients.map(r =>
  limit(() => sendEmail(r.email))
);

await Promise.all(tasks);
```

---

## Delivery Issues

### Emails Going to Spam

**Possible causes:**

| Cause | Solution |
|-------|----------|
| No domain authentication | Set up SPF, DKIM, DMARC records |
| Spam trigger words | Review content, avoid "free", "buy now" |
| Low engagement rate | Clean inactive subscribers |
| High bounce rate | Remove invalid emails |
| Missing unsubscribe link | Add mandatory unsubscribe |

**Check your spam score:**
- Mail-Tester: https://www.mail-tester.com
- GlockApps: https://glockapps.com

---

### Hard Bounces

**Error:** Permanent delivery failure

**Common reasons:**
- Email address doesn't exist
- Domain doesn't exist
- Recipient mailbox full

**Handling:**
```typescript
async function handleBounce(payload: BrevoWebhookPayload) {
  // Remove from mailing list
  await db.users.updateMany({
    where: { email: payload.email },
    data: { emailValid: false }
  });

  // Log reason
  console.log(`Hard bounce: ${payload.email} - ${payload.reason}`);
}
```

---

### Soft Bounces

**Error:** Temporary delivery failure

**Common reasons:**
- Recipient mailbox full
- Recipient server temporarily down
- Message too large

**Handling:**
```typescript
// Retry with exponential backoff
async function sendWithRetry(emailData: any, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await brevo.transactionalEmails.sendTransacEmail(emailData);
    } catch (error: any) {
      if (error.response?.body?.code === 'soft_bounce' && i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000)); // 1s, 2s, 4s
      } else {
        throw error;
      }
    }
  }
}
```

---

## Template Issues

### Template Variables Not Replacing

**Problem:** `{{params.firstname}}` appears literally in email

**Causes:**
- Parameter keys don't match template variables
- Nested object structure incorrect

**Solution:**
```typescript
// Template uses {{params.firstname}}
// Must pass:
email.params = {
  firstname: 'John',  // ✅ Correct
  user: { firstname: 'John' }  // ❌ Wrong - would need {{params.user.firstname}}
};
```

---

### Template Not Found

**Error:**
```
{"code": "invalid_parameter", "message": "Template not found"}
```

**Causes:**
- Invalid template ID
- Template is inactive
- Template belongs to different account

**Solution:**
```typescript
// List templates to find correct ID
const templates = await brevo.transactionalEmails.getSmtpTemplates();
console.log(templates.body.templates.map(t => ({
  id: t.id,
  name: t.templateName,
  isActive: t.isActive
})));
```

---

## Development Issues

### Emails Not Sending in Development

**Check:**
1. Environment variables loaded
2. API key valid
3. Network connectivity
4. CORS configuration (if calling from frontend)

**Debug logging:**
```typescript
const apiKey = process.env.BREVO_API_KEY;
console.debug('Brevo API Key:', apiKey?.substring(0, 10) + '...');
console.debug('Sender:', process.env.BREVO_SENDER_EMAIL);

const result = await brevo.transactionalEmails.sendTransacEmail(emailData);
console.debug('Result:', result);
```

---

### Webhook Not Receiving Events

**Check:**
1. Webhook URL is publicly accessible (not localhost)
2. Server returns 200 OK response
3. Firewall not blocking Brevo IPs
4. Webhook is active in Brevo dashboard

**Test webhook:**
```bash
# Simulate webhook
curl -X POST https://yourdomain.com/api/webhooks/brevo \
  -H "Content-Type: application/json" \
  -d '{"event":"delivered","email":"test@example.com"}'
```

---

## Next.js Specific Issues

### API Route Timing Out

**Problem:** Email sending blocks API response

**Solution:**
```typescript
// Fire and forget pattern
export async function POST(request: NextRequest) {
  const { email } = await request.json();

  // Don't await
  sendEmail(email).catch(err =>
    console.error('Background email error:', err)
  );

  return NextResponse.json({ success: true });
}
```

---

### Environment Variables Not Available

**Problem:** `process.env` undefined in Edge Runtime

**Solution:**
```typescript
// Use Node.js runtime
export const runtime = 'nodejs';

// Or access via Next.js config
export async function POST(request: NextRequest) {
  const apiKey = process.env.BREVO_API_KEY;
  // ...
}
```

---

## Performance Issues

### Slow Email Sending

**Problem:** Sending to 1000 recipients takes too long

**Solution:** Use batch API
```typescript
// Instead of loop
for (const recipient of recipients) {
  await sendEmail(recipient);  // ❌ Slow
}

// Use messageVersions
await brevo.transactionalEmails.sendTransacEmail({
  templateId: templateId,
  messageVersions: recipients.map(r => ({
    to: [{ email: r.email }],
    params: { name: r.name }
  }))
});  // ✅ Fast
```

---

### Memory Issues with Large Lists

**Problem:** Out of memory when processing large recipient lists

**Solution:** Process in chunks
```typescript
const CHUNK_SIZE = 1000;

for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
  const chunk = recipients.slice(i, i + CHUNK_SIZE);

  await brevo.transactionalEmails.sendTransacEmail({
    templateId: templateId,
    messageVersions: chunk.map(r => ({
      to: [{ email: r.email }]
    }))
  });

  // Allow GC
  await new Promise(resolve => setImmediate(resolve));
}
```

---

## Debug Checklist

Before requesting support, verify:

- [ ] API key is valid and starts with `xkeysib-`
- [ ] Environment variables are loaded
- [ ] Sender domain is registered and verified
- [ ] DNS records (SPF, DKIM, DMARC) are configured
- [ ] Template is active (if using templates)
- [ ] Recipient email address is valid
- [ ] Not exceeding rate limits (300/day free tier)
- [ ] Webhook URL is publicly accessible
- [ ] Server is responding with 200 OK to webhooks
- [ ] Request payload matches API specification

---

## Getting Help

**Resources:**
- API Documentation: https://developers.brevo.com
- Help Center: https://help.brevo.com
- Status Page: https://status.brevo.com
- Contact Support: https://help.brevo.com/hc/en-us/requests/new

**When creating a support ticket, include:**
1. API request ID (from response headers)
2. Message ID (from email response)
3. Error code and message
4. Timestamp of request
5. Recipient email (sanitized)
