# BetterAuth recipes (procedural)

## Google OAuth setup

1. Google Cloud Console → APIs & Services → **Credentials** → Create OAuth client ID → **Web application**.
2. **Authorized redirect URIs** — add one per environment:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://admin.yourdomain.com/api/auth/callback/google` (and any other surface that signs in)
3. Copy client ID + secret into server env (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
4. In the auth config: `socialProviders: { google: { clientId, clientSecret } }`.
5. Client side: `signIn.social({ provider: 'google', callbackURL: '/dashboard' })`.
6. OAuth users are **pre-verified** — skip the verify email; send welcome immediately (detect via
   `accounts.providerId !== 'credential'` in the `databaseHooks.user.create.after` hook).

## Mounting the handler

```ts
// app/api/auth/[...all]/route.ts
import { auth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'
export const { GET, POST } = toNextJsHandler(auth)
```

## Multi-subdomain sessions (admin. / app. / marketing)

Problem: one shared `.yourdomain.com` session cookie lets a client login on `app.` wipe the
developer session on `admin.` (both write the same cookie).

Fix:
- Let **each subdomain keep its own scoped session cookie** (default same-origin cookie behavior).
- If the marketing apex needs to know who's logged in, set a **separate, non-sensitive UI-hint
  cookie** scoped to `.yourdomain.com` (e.g. `oct_dev` / `oct_client` = "1") via a `hooks.after`
  middleware. It carries no session token — only a flag the nav reads to show the right button.
  Clear it on sign-out for the subdomain that signed out.

```ts
hooks: {
  after: createAuthMiddleware(async (ctx) => {
    const host = ctx.headers?.get('host') ?? ''
    if (!host.endsWith('yourdomain.com')) return // skip dev/preview (same-origin useSession works)
    const opts = { domain: '.yourdomain.com', path: '/', sameSite: 'lax' as const, secure: true, httpOnly: false, maxAge: 60*60*24*30 }
    const s = ctx.context.newSession
    if (s) { const role = (s.user as {role?:string}).role === 'client' ? 'client' : 'developer'
             ctx.setCookie(role === 'client' ? 'oct_client' : 'oct_dev', '1', opts); return }
    if (ctx.path.startsWith('/sign-out'))
      ctx.setCookie(host.startsWith('app.') ? 'oct_client' : 'oct_dev', '', { ...opts, maxAge: 0 })
  }),
}
```

## Email verification + password reset

- `emailVerification`: `sendOnSignUp: true`, `autoSignInAfterVerification: true`, short `expiresIn` (e.g. 3600).
- `emailAndPassword.requireEmailVerification: true` blocks unverified logins.
- Wire `sendVerificationEmail` / `sendResetPassword` to your transactional provider (Resend).

## Rate-limit tuning

Tighten the abuse-prone routes beyond the global default:
```
'/sign-in/email':   { window: 60, max: 5 }
'/forget-password': { window: 60, max: 3 }
'/sign-up/email':   { window: 60, max: 3 }
```
Back it with `secondary-storage` (Upstash) so counters are shared across serverless instances.
