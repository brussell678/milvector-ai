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
      <p className="mt-2 text-2xl font-extrabold text-[var(--accent)]">Transition Readiness: {readiness}%</p>
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
