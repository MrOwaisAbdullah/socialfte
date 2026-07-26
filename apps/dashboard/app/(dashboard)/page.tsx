// Minimal home page — the login flow's post-success redirect target. The
// real content screens (Assets, Templates, Queue, Calendar, Performance) are
// out of scope for Week 2 (schema + shell + templates + render pipeline
// only); this is a placeholder so the dashboard has somewhere to land.
export default function HomePage() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-heading text-3xl text-primary">Dashboard</h1>
      <p className="font-body text-muted">
        Week 2 scope: schema, brand-matched shell, post templates, and the render pipeline. Content
        screens (Assets, Templates, Queue, Calendar, Performance) come in later weeks.
      </p>
    </div>
  );
}
