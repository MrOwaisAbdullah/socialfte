import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, makeSessionToken, verifyPassword } from '@/lib/session';

async function login(formData: FormData) {
  'use server';
  const password = String(formData.get('password') ?? '');
  if (!verifyPassword(password)) {
    redirect('/login?error=1');
  }
  (await cookies()).set(SESSION_COOKIE, makeSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days — single operator, long-lived session
  });
  redirect('/');
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="mx-auto mt-24 max-w-sm">
      <h1 className="font-heading text-3xl text-primary">Yousuf Living</h1>
      <p className="mt-1 font-body text-sm text-muted">SocialFTE dashboard</p>
      <form action={login} className="mt-8 flex flex-col gap-4">
        <label htmlFor="password" className="font-body text-sm text-dark">
          Access code
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-md border border-dark/20 bg-light px-3 py-2 font-body text-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        {error && (
          <p role="alert" className="font-body text-sm text-red-700">
            Incorrect access code.
          </p>
        )}
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 font-body font-medium text-light transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Enter
        </button>
      </form>
    </div>
  );
}
