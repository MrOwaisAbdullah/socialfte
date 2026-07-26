# Resend (transactional) — patterns

Resend handles 1:1 transactional mail. Brevo (the other references here) handles marketing.

## Client (build-safe)

```ts
// lib/email/clients.ts — fallback string, never a throw (build evaluates this module)
import { Resend } from 'resend'
export const resend = new Resend(process.env.RESEND_API_KEY ?? 'not-configured')
```

Lazy alternative if you prefer no env at import time:
```ts
let _r: Resend | null = null
export const getResend = () => (_r ??= new Resend(process.env.RESEND_API_KEY!))
```

## Send wrapper

```ts
export async function sendTransactional(opts: {
  to: string; subject: string; html: string; replyTo?: string
}): Promise<{ sent: boolean; id?: string; error?: string }> {
  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'YourBrand <onboarding@resend.dev>',
    to: opts.to,
    replyTo: opts.replyTo,
    subject: opts.subject,
    html: opts.html,
  })
  if (error) return { sent: false, error: error.message }
  return { sent: true, id: data?.id }
}
```

## Idempotency keys (production best practice)

Pass an `Idempotency-Key` so a retry can't send a duplicate email:

```ts
await resend.emails.send(
  { from, to, subject, html },
  { idempotencyKey: `welcome/${userId}` }, // format: <event-type>/<entity-id>
)
```

- Format: `<event-type>/<entity-id>` (batch: `batch-<event-type>/<batch-id>`).
- Keys expire after **24h**, max length **256 chars**.
- Same key + **same payload** → returns the original response (no duplicate send).
- Same key + **different payload** → `409` conflict (use a new key or fix the payload).

## Error handling & retry policy (by status)

| Status | Meaning | Action |
|--------|---------|--------|
| 400 / 422 | Bad request params | Fix the request; **do not retry** |
| 401 / 403 | Bad API key / unverified domain | Fix config; **do not retry** |
| 409 | Idempotency conflict | New key or fix payload |
| 429 | Rate limited | **Retry with exponential backoff** |
| 500 | Server error | **Retry with exponential backoff** |

## Rules

- **Non-blocking for side-effect mail**: `void sendTransactional(...).catch(() => {})` for welcome/notification mail so a mail outage never fails the user's action. Block (await + surface error) only when the email IS the action (password reset, magic link).
- **Absolute links**: build URLs with a robust base-URL helper, never `process.env.X ?? 'localhost'` (empty strings pass `??` and produce hostless `http:///...` links — a real bug class).
- **`replyTo`** a human inbox so recipients can reply.
- **Verified domain**: add + verify your sending domain in Resend; `onboarding@resend.dev` is for testing only.
- **React Email** (optional): use `@react-email/components` + `render()` for typed templates instead of raw HTML strings.
- **Shared header/logo**: keep one partial (e.g. `lib/email/shared.ts`) imported by every template for brand consistency.

## Env

```
RESEND_API_KEY=
RESEND_FROM_EMAIL="YourBrand <noreply@yourdomain.com>"
```

## Common failure modes

- 401 at runtime → key unset/invalid (the `'not-configured'` fallback surfaces here, by design).
- Mail in spam → unverified domain / no SPF+DKIM.
- Build fails → something threw at module top-level; use the fallback/lazy pattern above.
- Hostless links in email → base-URL env was empty; coalesce empties to a real default.
