import Link from 'next/link';

// Per-client display name (FR-016) — reads from BRAND_NAME rather than
// hardcoding one brand's wordmark, so a second client's shell doesn't need a
// code change. Falls back to "Dashboard" if unset.
const brandName = process.env.BRAND_NAME || 'Dashboard';

// The only two real content screens that exist so far (Assets/Templates/Queue
// screens are out of scope per plan.md). Without this, the shell had no way
// to reach either page except typing the URL directly — the home page's own
// placeholder text was the only "navigation" and it just said "come later."
const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/performance', label: 'Performance' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-light"
      >
        Skip to main content
      </a>
      <header className="border-b border-dark/10 bg-light">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <span className="font-heading text-2xl text-primary">{brandName}</span>
          <nav aria-label="Main" className="flex items-center gap-5">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="font-body text-sm text-dark hover:text-primary hover:underline"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <span className="font-body text-sm text-muted">SocialFTE dashboard</span>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-6 py-8">
        {children}
      </main>
    </>
  );
}
