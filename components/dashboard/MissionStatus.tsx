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
    <section className="panel p-5 sm:p-6">
      <p className="text-xs font-semibold tracking-widest text-[var(--accent)]">MISSION STATUS</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <article className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)]">Current Phase</p>
          <p className="mt-1 text-xl font-extrabold">{currentPhase}</p>
        </article>
        <article className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)]">Days Until EAS</p>
          <p className="mt-1 text-xl font-extrabold">{daysUntilEas ?? "Set EAS"}</p>
        </article>
        <article className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)]">Readiness</p>
          <p className="mt-1 text-xl font-extrabold text-[var(--accent)]">{readiness}%</p>
        </article>
      </div>
      <a className="btn btn-primary mt-4 w-full sm:w-auto" href={nextObjective.href}>
        Next Objective: {nextObjective.label}
      </a>
    </section>
  );
}
