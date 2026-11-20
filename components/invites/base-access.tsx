import { NO_SSN_NOTE, passSteps } from "@/lib/invites/rsvp";
import type { InviteData } from "@/lib/invites/schema";
import { formatDateLong } from "@/lib/invites/time";

function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

// "Getting on base": who needs a pass, by when, and the steps, in the order a
// guest does them. Shown only when an event is aboard an installation.
export function BaseAccess({ data, today, heading, dayOf = false }: { data: InviteData; today: string; heading: React.ReactNode; dayOf?: boolean }) {
  const baseEvents = data.events.filter((event) => event.onBase).map((event) => event.name);
  const deadline = data.base.passDeadline;
  const left = deadline ? daysUntil(deadline, today) : null;
  const blocks = [
    ["Which gate, and when to leave", data.base.gate],
    ["What to bring", data.base.bring],
  ].filter(([, value]) => value) as [string, string][];

  // On the day the sign-up steps are history. Only what gets a guest through
  // the gate this morning is left: collecting the pass, the gate, what to bring.
  if (dayOf) {
    const steps = [["Collecting your pass", data.base.pickup], ...blocks].filter(([, value]) => value) as [string, string][];
    return (
      <section id="access" className="scroll-mt-4">
        {heading}
        <p className="mt-3 text-[var(--iv-muted)]">
          Adults without a DoD ID need the visitor pass that was arranged beforehand. Without it, the gate turns you away. If you think you were missed,
          contact the host before you drive.
        </p>
        {steps.map(([title, value]) => (
          <div key={title} className="mt-5">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--iv-muted)]">{title}</p>
            <p className="mt-1 whitespace-pre-line leading-relaxed">{value}</p>
          </div>
        ))}
      </section>
    );
  }

  return (
    <section id="access" className="scroll-mt-4">
      {heading}
      <p className="mt-3 text-[var(--iv-muted)]">
        The {baseEvents.join(" and the ")} {baseEvents.length === 1 ? "is" : "are"} aboard a military installation. Adults without a DoD ID need a visitor
        pass to get through the gate. Retired, active duty, dependent, and civilian employee IDs all count. Children do not need a pass.
      </p>

      {deadline && left !== null && (
        <div className="mt-5 rounded-2xl border-l-4 border-[var(--iv-accent)] bg-[var(--iv-surface)] px-5 py-4">
          <p className="font-bold">Need a pass? RSVP by {formatDateLong(deadline)}.</p>
          <p className="mt-1 text-sm text-[var(--iv-muted)]">
            {left > 1
              ? `${left} days left.`
              : left === 1
                ? "One day left."
                : left === 0
                  ? "Today is the last day."
                  : "That date has passed. RSVP anyway and contact the host right away. It may still be possible, but it cannot be promised."}
          </p>
        </div>
      )}

      <ol className="mt-5 grid gap-3">
        {passSteps(data).map((step) => (
          <li key={step} className="rounded-2xl border border-[var(--iv-line)] bg-[var(--iv-surface)] px-5 py-4 leading-relaxed">
            {step}
          </li>
        ))}
      </ol>

      {blocks.map(([title, value]) => (
        <div key={title} className="mt-5">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--iv-muted)]">{title}</p>
          <p className="mt-1 whitespace-pre-line leading-relaxed">{value}</p>
        </div>
      ))}

      <p className="mt-5 text-sm text-[var(--iv-muted)]">{NO_SSN_NOTE}</p>
    </section>
  );
}
