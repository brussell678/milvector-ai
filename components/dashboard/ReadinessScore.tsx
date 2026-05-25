import type { CategoryReadiness } from "./types";

export function ReadinessScore({
  readiness,
  categories,
}: {
  readiness: number;
  categories: CategoryReadiness[];
}) {
  return (
    <section className="panel p-5">
      <h2 className="font-bold">Readiness Score</h2>
      <div className="mt-3 rounded-md border border-[var(--line)] bg-[var(--surface)] p-4">
        <p className="text-xs font-semibold tracking-wide text-[var(--muted)]">Transition Readiness</p>
        <p className="mt-1 text-4xl font-extrabold text-[var(--accent)]">{readiness}%</p>
      </div>
      <div className="mt-4 space-y-3">
        {categories.map((item) => (
          <article key={item.key}>
            <div className="flex items-center justify-between text-xs">
              <p className="font-semibold uppercase tracking-wide text-[var(--muted)]">{item.label}</p>
              <p className="text-[var(--muted)]">
                {item.completed}/{item.total} ({item.weight}%)
              </p>
            </div>
            <div className="mt-1 h-2 rounded bg-[var(--surface)]">
              <div className="h-2 rounded bg-[var(--accent)]" style={{ width: `${item.score}%` }} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
