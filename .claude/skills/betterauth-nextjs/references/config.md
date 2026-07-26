# Annotated BetterAuth config

A complete, production-tested `lib/auth/index.ts` shape. Adapt names to your schema.

```ts
import { betterAuth } from 'better-auth'
import { createAuthMiddleware } from 'better-auth/api'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { Redis } from '@upstash/redis'

// Upstash-backed SecondaryStorage so sessions + rate-limit counters survive across
// serverless instances (edge workers share no in-process memory). Return undefined
// when env is missing so local dev still boots.
function makeSecondaryStorage() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return undefined
  const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
  return {
    get: (k: string) => redis.get<string>(k),
    set: async (k: string, v: string, ttl?: number) => { ttl ? await redis.set(k, v, { ex: ttl }) : await redis.set(k, v) },
    delete: async (k: string) => { await redis.del(k) },
  }
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema: {
    user: schema.users, session: schema.sessions, account: schema.accounts, verification: schema.verifications,
  }}),

  user: { additionalFields: {
    role:    { type: 'string', required: true, defaultValue: 'developer', input: false }, // input:false = not user-settable
    segment: { type: 'string', required: false, input: true },
  }},

  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => { void sendVerificationEmail({ email: user.email, name: user.name ?? '', url }) },
    sendOnSignUp: true, autoSignInAfterVerification: true, expiresIn: 3600,
  },

  emailAndPassword: {
    enabled: true, requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => { await sendResetPasswordEmail({ email: user.email, url }) },
  },

  socialProviders: { google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! } },

  databaseHooks: { user: { create: { after: async (user) => {
    // Multi-tenant: create an org per developer, skip if there's a pending invite (they're a client).
    // Detect OAuth via accounts.providerId !== 'credential' to send the welcome mail immediately.
  }}}},

  secondaryStorage: makeSecondaryStorage(),

  rateLimit: {
    enabled: true, storage: 'secondary-storage', window: 60, max: 10,
    customRules: {
      '/sign-in/email':   { window: 60, max: 5 },
      '/forget-password': { window: 60, max: 3 },
      '/sign-up/email':   { window: 60, max: 3 },
    },
  },

  session: {
    cookieCache: { enabled: true, maxAge: 60 * 5 }, // 5-min cache; short so secret rotation clears sessions fast
    // With stateless + secondaryStorage you can also set: cookieCache.refreshCache: false
  },

  trustedOrigins: [ /* every prod domain + preview wildcards + http://localhost:3000 */ ],

  // nextCookies() MUST be the LAST plugin — it auto-sets cookies returned by
  // server actions so you don't hand-wire Set-Cookie. (better-auth/next-js)
  plugins: [nextCookies()],
})
```

Add the import: `import { nextCookies } from 'better-auth/next-js'`.

## Official cross-subdomain cookies vs per-subdomain (choose deliberately)

BetterAuth ships `advanced.crossSubDomainCookies` to SHARE one session cookie across subdomains:

```ts
advanced: { crossSubDomainCookies: { enabled: true, domain: '.yourdomain.com' } } // baseURL required
```

Use it when every subdomain is the **same app / same user identity** (e.g. `app.` ↔ `api.`).
**Do NOT use it when subdomains carry different ROLES with separate logins** (e.g. an admin
dashboard on `admin.` and a client portal on `app.`): a shared `.yourdomain.com` cookie lets a
login on one subdomain overwrite the other's session. There, keep BetterAuth's default
per-origin cookie and use a separate non-sensitive UI-hint cookie (see `recipes.md`).

## Middleware (Next.js 15.2+)

`auth.api.getSession` needs the **Node.js runtime** in middleware, not edge:

```ts
export const config = { runtime: 'nodejs', matcher: ['/dashboard'] }

export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user
```

## Env vars

```
BETTER_AUTH_SECRET=          # rotating this invalidates sessions
BETTER_AUTH_URL=             # base URL for callbacks
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
PLATFORM_OWNER_EMAIL=        # server-only, never NEXT_PUBLIC_
```

## Client usage

```ts
// lib/auth/client.ts
import { createAuthClient } from 'better-auth/react'
export const { signIn, signOut, useSession } = createAuthClient()
```

Never import `lib/auth/index.ts` (the server instance) into a client component — it pulls server-only deps and breaks the build. Use the client module's `signIn`/`signOut`.
