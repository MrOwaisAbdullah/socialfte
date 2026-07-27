// Calendar screen — Week 5, US4 (T040).
// Deviation from the kickoff's literal `app/(app)/calendar/page.tsx` path:
// this project's actual route group is `(dashboard)` (see proxy.ts and the
// other content screens under it, e.g. performance/page.tsx) — `(app)` was
// never created. Same session gate, same shell, correct path for this repo.
export const dynamic = 'force-dynamic';

import CalendarBoard from '@/components/calendar/CalendarBoard';

function mondayOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export default function CalendarPage() {
  const weekStart = mondayOf(new Date());

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-3xl text-primary">Calendar</h1>
        <p className="font-body text-muted">
          Drag a post to a new day to reschedule it. The bar under each day shows how close that
          platform is to its daily cap.
        </p>
      </div>
      <CalendarBoard initialWeekStart={weekStart} />
    </div>
  );
}
