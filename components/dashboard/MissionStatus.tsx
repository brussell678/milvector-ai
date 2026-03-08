export function MissionStatus({
  currentPhase,
  daysUntilEas,
  readiness,
  nextObjective,
}: {
  currentPhase: string;
  daysUntilEas: number | null;
  readiness: number;
  nextObjective: { href: string; label: string };
}) {
  return (
    <section className="panel p-6">
      <p className="text-xs font-semibold tracking-widest text-[var(--accent)]">MISSION STATUS</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        <article>
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)]">Current Phase</p>
          <p className="mt-1 text-xl font-extrabold">{currentPhase}</p>
        </article>
        <article>
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)]">Days Until EAS</p>
          <p className="mt-1 text-xl font-extrabold">{daysUntilEas ?? "Set EAS"}</p>
        </article>
        <article>
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)]">Readiness</p>
          <p className="mt-1 text-xl font-extrabold text-[var(--accent)]">{readiness}%</p>
        </article>
      </div>
      <a className="btn btn-primary mt-4 inline-flex" href={nextObjective.href}>
        Next Objective: {nextObjective.label}
      </a>
    </section>
  );
}
