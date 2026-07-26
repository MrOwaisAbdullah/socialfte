---
name: nextjs-email
description: |
  Send email from a Next.js app using two providers by purpose: Resend for
  transactional mail (verification, password reset, invitations, notifications) and
  Brevo for marketing/digests (weekly summaries, nudges, contact forms). This skill
  should be used when implementing any email-sending feature, choosing between Resend
  and Brevo, building HTML email templates, or debugging email delivery and build-time
  init errors.
---

# Next.js Email — Resend (transactional) + Brevo (marketing)

Two providers, split by job. Mixing them is intentional, not redundant.

| Provider | Use for | Why |
|----------|---------|-----|
| **Resend** | Verification, password reset, invitations, lead/handoff notifications, receipts | Best deliverability for 1:1 transactional; simple `resend.emails.send` |
| **Brevo** | Weekly digests, usage nudges, marketing blasts, contact-form intake | Built-in contact lists, campaigns, marketing automation |

## Before Implementation

| Source | Gather |
|--------|--------|
| Codebase | Existing `lib/email/` (clients, templates, shared logo), `RESEND_*` / `BREVO_*` env vars, sender addresses |
| Conversation | Is the email transactional or marketing? Who is the recipient? Triggered by a user action or a cron? |
| References | `references/best-practices.md`, `references/api-endpoints.md`, `references/webhooks.md`, `references/troubleshooting.md` (Brevo); `assets/templates/*.html` for HTML scaffolds |

Decide provider FIRST (transactional → Resend, marketing → Brevo), then build.

## Clarifications

**Required:**
1. Is this email transactional (→ Resend) or marketing/digest (→ Brevo)?
2. Triggered by a user action or a scheduled job/cron?

**Optional (infer if unstated):**
3. Raw HTML templates or React Email (default: raw HTML with a shared header)?
4. Must the send block the request (default: non-blocking `void` for side-effect mail)?

If unanswered, default to: transactional→Resend, marketing→Brevo, raw HTML + shared logo partial, non-blocking sends except password reset.

## Documentation & sources

| Resource | URL | Use for |
|----------|-----|---------|
| Resend docs | https://resend.com/docs | Transactional send, domains, SDK |
| React Email | https://react.email/docs | Typed email templates |
| Brevo API | https://developers.brevo.com | Marketing/transactional API, campaigns |
| Email HTML guide | https://www.caniemail.com | Client support for CSS/HTML features |

## Client setup (`lib/email/clients.ts`)

```ts
import { Resend } from 'resend'
import { BrevoClient } from '@getbrevo/brevo'

// Fallback string, NOT a throw — a missing key must never break `next build`.
// Sends fail with 401 at runtime if unset, which is the correct, debuggable failure.
export const resend = new Resend(process.env.RESEND_API_KEY ?? 'not-configured')

export const brevo = new BrevoClient({ apiKey: process.env.BREVO_API_KEY ?? '' })
export const BREVO_SENDER  = { email: process.env.BREVO_FROM_EMAIL  ?? 'noreply@yourdomain.com', name: 'YourBrand' }
export const DIGEST_SENDER = { email: process.env.BREVO_DIGEST_EMAIL ?? 'digest@yourdomain.com', name: 'YourBrand' }
```

> **Build-time safety (important):** never instantiate a client that throws when its key is absent, and never call a provider at module top-level. Next.js evaluates modules during `build`; a throw there fails the whole build. Use a `?? 'not-configured'` fallback or a lazy getter: `let _r; const getResend = () => (_r ??= new Resend(process.env.RESEND_API_KEY!))`.

## Resend — transactional send

```ts
import { resend } from '@/lib/email/clients'

export async function sendInvitation({ to, inviteUrl, botName, ownerEmail }: {...}) {
  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'YourBrand <onboarding@resend.dev>',
    to,
    replyTo: ownerEmail,                 // let recipients reply to a human
    subject: `You're invited to ${botName}`,
    html: renderTemplate({ inviteUrl }), // share a logo/header partial across templates
  })
  if (error) return { error: error.message, sent: false }
  return { sent: true, id: data?.id }
}
```

- Wrap sends in `try/catch`. Treat side-effect mail (welcome, notifications) as **non-blocking**: `void sendX().catch(...)`. Block only when the email IS the action (password reset).
- Build absolute links with a robust base-URL helper, never `process.env.X ?? 'localhost'` (empty strings slip through `??` and produce hostless `http:///` links).
- Share a logo/header partial (e.g. `lib/email/shared.ts`) across every template for brand consistency.

## Brevo — marketing / digest

Use Brevo's transactional or campaigns API for digests and nudges (cron-triggered). Senders must be verified in Brevo → Senders & Domains. See `references/api-endpoints.md` for endpoint shapes and `references/webhooks.md` for delivery/open/bounce events.

## Decision rule

```
Triggered by a single user action, 1:1, must arrive  → Resend
Scheduled / bulk / list-based / marketing            → Brevo
```

## Anti-patterns

- ❌ Throwing on missing API key at module load → breaks `next build`. Use fallback/lazy init.
- ❌ Sending marketing mail through Resend, or transactional 1:1 mail through Brevo campaigns.
- ❌ `await`-ing non-critical notification emails inside a request's hot path → fire-and-forget with `void`.
- ❌ Hardcoded `localhost` / hostless URLs in email links.
- ❌ Unverified Brevo sender → silent non-delivery.
- ❌ Inline-everything templates with no shared header → brand drift across emails.

## Validation
- `npm run build` passes with email keys UNSET (no build-time throw).
- A transactional send (Resend) and a digest (Brevo) each deliver in a real test.
- Links in emails resolve to absolute production URLs.

> Note: the `references/` and `assets/templates/` in this skill are Brevo-oriented from its
> earlier scope; they still apply to Brevo marketing mail. Resend transactional patterns are
> documented inline above.
