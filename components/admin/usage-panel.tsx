import { PRICES_AS_OF, type UsageSummary } from "@/lib/admin/usage";

// Admin: who is using MilVector and what the AI costs (lib/admin/usage.ts).
const money = (n: number) => (n >= 100 ? `$${n.toFixed(0)}` : n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(3)}`);
const seconds = (n: number | null) => (n === null ? "-" : `${n < 10 ? n.toFixed(1) : n.toFixed(0)} s`);

export function UsagePanel({ summary, note }: { summary: UsageSummary | null; note?: string }) {
  if (!summary) {
    return (
      <section className="section-card">
        <p className="section-kicker">USAGE</p>
        <h2 className="section-title mt-1">Usage and AI cost</h2>
        <p className="section-description">{note ?? "Usage could not be loaded."}</p>
      </section>
    );
  }

  return (
    <section className="section-card" aria-labelledby="usage-title">
      <p className="section-kicker">USAGE</p>
      <h2 id="usage-title" className="section-title mt-1">
        Usage and AI cost
      </h2>
      <p className="section-description">
        {summary.totalMembers} members in all. An action is one thing a member asked a tool to do; the AI calls inside it count toward cost, not
        actions.
      </p>

      {summary.windows.map((w) => (
        <div key={w.days} className="mt-5">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Last {w.days} days</p>
          <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
            <article className="stat-card">
              <p className="stat-label">New members</p>
              <p className="stat-value">{w.newMembers}</p>
            </article>
            <article className="stat-card">
              <p className="stat-label">Active members</p>
              <p className="stat-value">{w.activeMembers}</p>
            </article>
            <article className="stat-card">
              <p className="stat-label">Actions</p>
              <p className="stat-value">{w.actions}</p>
              {w.failedActions > 0 ? <p className="mt-1 text-xs text-[var(--muted)]">{w.failedActions} failed</p> : null}
            </article>
            <article className="stat-card">
              <p className="stat-label">Est. AI cost</p>
              <p className="stat-value">{money(w.cost)}</p>
              {w.unpricedRuns > 0 ? <p className="mt-1 text-xs text-[var(--muted)]">{w.unpricedRuns} calls on an unpriced model</p> : null}
            </article>
          </div>
        </div>
      ))}

      <p className="mt-6 text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)]">By tool, last 30 days</p>
      {summary.tools.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--muted)]">No tool use in the last 30 days.</p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-xl border border-[var(--line)]">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-[var(--surface)] text-xs uppercase tracking-[0.08em] text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2 font-semibold">Tool</th>
                <th className="px-3 py-2 text-right font-semibold">Actions</th>
                <th className="px-3 py-2 text-right font-semibold">Members</th>
                <th className="px-3 py-2 text-right font-semibold">Failed</th>
                <th className="px-3 py-2 text-right font-semibold">Median</th>
                <th className="px-3 py-2 text-right font-semibold">Slowest 10%</th>
                <th className="px-3 py-2 text-right font-semibold">Est. cost</th>
                <th className="px-3 py-2 text-right font-semibold">Per action</th>
              </tr>
            </thead>
            <tbody>
              {summary.tools.map((t) => (
                <tr key={t.tool} className="border-t border-[var(--line)]">
                  <td className="px-3 py-2 font-medium">{t.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.actions}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.members}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.failedActions}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{seconds(t.p50Seconds)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{seconds(t.p90Seconds)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(t.cost)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.costPerAction === null ? "-" : money(t.costPerAction)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-[var(--muted)]">
        Cost is an estimate from the tokens each call logged, at list prices as of {PRICES_AS_OF}, with cached input priced in full, so it leans
        high. LinkedIn banner images are not included. Times are for the call a member waited on. Your admin account&apos;s own use is left out.
        OpenAI&apos;s billing page has the exact figure.
      </p>
    </section>
  );
}
