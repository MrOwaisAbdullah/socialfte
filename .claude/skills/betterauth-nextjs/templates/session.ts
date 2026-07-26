// Drop-in server-side auth guards. Import these into protected pages/routes/actions.
// The key lesson: read role from the DB (not the cookie cache) for authorization.

import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db, schema } from '@/lib/db'

export async function requireDeveloper() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/dashboard/login?reason=expired') // ?reason lets the login page explain the bounce
  if ((session.user as { role?: string }).role !== 'developer') redirect('/dashboard/login')
  return session.user
}

export async function requireClient() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/portal/login')

  // Read role from the DB — BetterAuth's cookieCache can return a STALE role if it
  // changed after the session was issued. Never authorize off the cached cookie role.
  const [dbUser] = await db
    .select({ role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id))
    .limit(1)

  if (!dbUser) redirect('/portal/login')
  if (dbUser.role === 'client') return session.user

  // Optional: a developer who assigned themselves a bot may also use the portal.
  if (dbUser.role === 'developer') {
    const [assigned] = await db
      .select({ id: schema.bots.id })
      .from(schema.bots)
      .where(eq(schema.bots.clientUserId, session.user.id))
      .limit(1)
    if (assigned) return session.user
  }
  redirect('/portal/login?error=not-client')
}

export async function requirePlatformOwner() {
  const user = await requireDeveloper()
  // SERVER-ONLY env. A NEXT_PUBLIC_ fallback would ship the admin email in the
  // client bundle, handing attackers the exact account to target.
  const ownerEmail = process.env.PLATFORM_OWNER_EMAIL
  if (!ownerEmail || user.email !== ownerEmail) redirect('/dashboard')
  return user
}

export async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}
