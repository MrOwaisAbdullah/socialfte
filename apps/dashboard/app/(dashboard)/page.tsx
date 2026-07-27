import Link from 'next/link';

// The login flow's post-success redirect target. Used to say "content
// screens come in later weeks" with no links anywhere — stale as of Week 5:
// Calendar and Performance are real, working screens now. This links to both
// directly rather than repeating that dead placeholder text.
export default function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-3xl text-primary">Dashboard</h1>
        <p className="font-body text-muted">
          Nothing publishes without your approval — this is where you review what the worker
          drafted and see how it performed.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/calendar"
          className="rounded-lg border border-dark/10 bg-light p-5 transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          <h2 className="font-heading text-xl text-primary">Calendar</h2>
          <p className="mt-1 font-body text-sm text-muted">
            See what's scheduled across every platform this week, drag to reschedule, and spot
            days that are over their daily posting cap.
          </p>
        </Link>
        <Link
          href="/performance"
          className="rounded-lg border border-dark/10 bg-light p-5 transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          <h2 className="font-heading text-xl text-primary">Performance</h2>
          <p className="mt-1 font-body text-sm text-muted">
            Engagement metrics for everything that's actually been published, collected every 6
            hours.
          </p>
        </Link>
      </div>
      <p className="font-body text-sm text-muted">
        Post approval itself happens in Discord, not here — the worker sends an approval card
        for every drafted post, and nothing goes out until a human clicks Approve.
      </p>
    </div>
  );
}
