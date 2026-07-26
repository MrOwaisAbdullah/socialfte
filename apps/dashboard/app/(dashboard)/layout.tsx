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
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="font-heading text-2xl text-primary">
            Yousuf<span className="text-accent">Living</span>
          </span>
          <span className="font-body text-sm text-muted">SocialFTE dashboard</span>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-6 py-8">
        {children}
      </main>
    </>
  );
}
