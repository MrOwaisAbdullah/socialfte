---
name: betterauth-nextjs
description: |
  Implement authentication in Next.js (App Router) with BetterAuth: email/password,
  Google OAuth, multi-role accounts, Drizzle adapter, Upstash secondary storage,
  databaseHooks, rate limiting, and server-side session guards. This skill should be
  used when adding login/signup, social sign-in, role-based access, email verification,
  password reset, session handling, or multi-tenant org creation on signup.
---

# BetterAuth + Next.js

Production patterns for BetterAuth in a Next.js App Router app with Drizzle ORM, Upstash Redis,
and a two-role (developer / client) multi-tenant model.

## Before Implementation

Gather context before writing code:

| Source | Gather |
|--------|--------|
| Codebase | Existing `lib/auth/`, the Drizzle schema (`users`, `sessions`, `accounts`, `verifications`), env var names, how surfaces/subdomains are split |
| Conversation | Which providers (email/pw, Google, others), how many roles, what happens on signup (org creation? invite flow?) |
| References | `references/config.md` for the full annotated config; `references/anti-patterns.md` for the traps |
| User guidelines | Cookie/subdomain strategy, redirect targets, verification policy |

Only ask the user for THEIR requirements (roles, providers, post-signup side effects). The BetterAuth mechanics are in this skill.

## Clarifications

**Required:**
1. Which providers — email/password, Google, others?
2. How many roles, and what does each gate (e.g. developer vs client)?
3. What happens on signup — create an org/tenant, run an invite flow, both?

**Optional (infer if unstated):**
4. Single domain or multiple subdomains (affects session-cookie strategy)?
5. Require email verification before login (default yes)?

If unanswered, default to: email/password + Google, a single `role` field (`input:false`), org-per-developer on signup, email verification required, single-domain cookies.

## Documentation & sources

| Resource | URL | Use for |
|----------|-----|---------|
| BetterAuth docs | https://www.better-auth.com/docs | Config, options, API |
| Drizzle adapter | https://www.better-auth.com/docs/adapters/drizzle | Schema mapping |
| Google OAuth setup | https://www.better-auth.com/docs/authentication/google | Provider + redirect URIs |
| databaseHooks | https://www.better-auth.com/docs/concepts/database#database-hooks | Post-signup side effects |
| Context7 (MCP) | resolve-library-id → query-docs | Current BetterAuth API (changes often) |

Always verify the current API via Context7 — BetterAuth's config surface moves between versions.

## Core architecture

```
lib/auth/index.ts    → betterAuth({...}) instance (server-only)
lib/auth/session.ts  → requireX() server guards used by every protected page/route
lib/auth/client.ts   → createAuthClient() for client components (signIn/signOut/useSession)
app/api/auth/[...all]/route.ts → mounts auth.handler
```

## Setup checklist

1. **Drizzle adapter** — map `user/session/account/verification` to your schema tables:
   ```ts
   database: drizzleAdapter(db, { provider: 'pg', schema: { user: schema.users, session: schema.sessions, account: schema.accounts, verification: schema.verifications } })
   ```
2. **Custom fields** via `user.additionalFields` (e.g. `role` with `input: false` so clients can't set it, `defaultValue: 'developer'`).
3. **Email/password** with `requireEmailVerification: true` + `sendResetPassword`.
4. **`emailVerification`**: `sendOnSignUp: true`, `autoSignInAfterVerification: true`, short `expiresIn`.
5. **Social providers**: `google: { clientId, clientSecret }` from server env (`GOOGLE_CLIENT_ID/SECRET`).
6. **Secondary storage** (Upstash Redis) so sessions + rate-limit counters survive across serverless instances. Return `undefined` when env vars are missing so local dev still works.
7. **Rate limiting**: enable with per-route `customRules` (tighter on `/sign-in/email`, `/forget-password`, `/sign-up/email`).
8. **`trustedOrigins`**: list every production domain + preview wildcards + `localhost`.
9. **`nextCookies()` plugin** — add it **last** in `plugins: []` so server actions set cookies automatically (`better-auth/next-js`).
10. **Middleware** (if used): `auth.api.getSession` requires `runtime: 'nodejs'` in the middleware `config` (Next 15.2+), not edge.
11. **Types**: `export type Session = typeof auth.$Infer.Session`.

## Server-side guards (the most-used pattern)

Every protected page/route calls a guard from `lib/auth/session.ts`:

```ts
export async function requireDeveloper() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/dashboard/login?reason=expired')
  if ((session.user as { role?: string }).role !== 'developer') redirect('/dashboard/login')
  return session.user
}
```

Key rules:
- **Read role from the DB, not the cookie, for sensitive checks.** BetterAuth's `cookieCache` can return a stale `role` if it changed after the session was created. `requireClient()` re-queries `users.role`.
- **Platform-owner check** uses a server-only env var (`PLATFORM_OWNER_EMAIL`) — never `NEXT_PUBLIC_*`, which would ship the admin email in the client bundle.
- Pass a `?reason=` param on redirect so the login page can explain the bounce.

## Post-signup side effects: `databaseHooks`

Run multi-tenant setup in `databaseHooks.user.create.after` — e.g. create an org per developer, but skip users who have a pending invite (they're clients), and send the welcome email immediately for OAuth users (already verified) while email/pw users get a combined verify+welcome mail.

```ts
databaseHooks: { user: { create: { after: async (user) => { /* create org unless pending invite; detect OAuth via accounts.providerId !== 'credential' */ } } } }
```

## Multi-subdomain sessions (if applicable)

If you serve multiple subdomains (admin. / app.), give **each its own scoped session cookie** — sharing one `.parent.com` cookie lets a client login on one subdomain wipe the admin session on another. Use a separate non-sensitive UI-hint cookie (`hooks.after` + `createAuthMiddleware`) if the marketing site needs to know who's logged in.

## Anti-patterns

- ❌ Trusting `session.user.role` from the cookie cache for authorization → read from DB.
- ❌ `NEXT_PUBLIC_` for owner/admin identifiers → server-only env.
- ❌ Throwing when Redis/secret env vars are missing → return `undefined` storage, degrade gracefully.
- ❌ One shared parent-domain session cookie across subdomains with different roles.
- ❌ Letting `role` be user-settable (`input: true`) → privilege escalation.
- ❌ Forgetting preview-deploy origins in `trustedOrigins` → OAuth/callback failures.

## Validation
- `npm run build` passes (BetterAuth instance is server-only; never import it into a client component — use `lib/auth/client.ts`).
- Sign-in, Google OAuth, verification email, and password reset each work end-to-end.
- A client role cannot reach developer routes and vice-versa.
