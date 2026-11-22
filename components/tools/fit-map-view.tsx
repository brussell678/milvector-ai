"use client";

import type { ReactNode } from "react";
import { ToolAlert } from "@/components/tools/tool-alert";
import type { FitResult } from "@/lib/resume/fit-check";

// The fit check's answer, as the Targeted Resume Builder and the JD Decoder
// both show it: a verdict, each requirement with the master lines behind it,
// and an honest way to handle each gap.

const VERDICT: Record<string, { label: string; badge: string }> = {
  apply: { label: "Apply", badge: "tool-badge-success" },
  stretch: { label: "A stretch worth weighing", badge: "tool-badge-warn" },
  pass: { label: "Probably not this one", badge: "tool-badge-error" },
};
const ASSESSMENT: Record<string, { label: string; badge: string }> = {
  strong: { label: "Strong", badge: "tool-badge-success" },
  met: { label: "Met", badge: "tool-badge-success" },
  partial: { label: "Partial", badge: "tool-badge-warn" },
  gap: { label: "Gap", badge: "tool-badge-error" },
  // A condition of the job (travel, schedule): neither a match nor a gap.
  confirm: { label: "Confirm", badge: "" },
};
const TYPE_LABEL: Record<string, string> = { mandatory: "required", preferred: "preferred", condition: "condition of the job" };

/** kicker: the label above the verdict. gapHint: what to do about a gap, which differs by tool. */
export function FitMapView({ fit, kicker, gapHint, children }: { fit: FitResult; kicker: string; gapHint: string; children?: ReactNode }) {
  const { fitMap, master, cited } = fit;
  return (
    <section className="tool-output-card">
      <div>
        <p className="tool-kicker">{kicker}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className={`tool-badge ${VERDICT[fitMap.recommendation]?.badge ?? ""}`}>{VERDICT[fitMap.recommendation]?.label ?? fitMap.recommendation}</span>
        </div>
        <p className="mt-2 text-sm">{fitMap.reason}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Required: {fitMap.counts.mandatory.strong + fitMap.counts.mandatory.met} covered, {fitMap.counts.mandatory.partial} partial, {fitMap.counts.mandatory.gap} gap.
          Preferred: {fitMap.counts.preferred.strong + fitMap.counts.preferred.met} covered, {fitMap.counts.preferred.partial} partial, {fitMap.counts.preferred.gap} gap.
          {fitMap.counts.conditions ? ` Conditions to confirm: ${fitMap.counts.conditions}.` : ""} Read from {master.name}: {master.roles} roles, {master.lines} lines.
        </p>
      </div>
      {master.notes.length > 0 && (
        <ToolAlert variant="info" title="About your master">
          <ul className="list-disc pl-5 text-sm">
            {master.notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </ToolAlert>
      )}
      <ul className="grid gap-2">
        {fitMap.requirements.map((r, i) => {
          const a = ASSESSMENT[r.assessment] ?? ASSESSMENT.gap;
          const short = r.assessment === "gap" || r.assessment === "partial";
          return (
            <li key={i} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-sm font-medium">
                  {r.requirement} <span className="text-xs font-normal text-[var(--muted)]">({TYPE_LABEL[r.type] ?? r.type})</span>
                </p>
                <span className={`tool-badge ${a.badge} shrink-0`} style={{ fontSize: "0.62rem" }}>
                  {a.label}
                </span>
              </div>
              {r.evidence.length > 0 && (
                <ul className="mt-2 grid gap-1 border-l-2 border-[var(--line)] pl-3">
                  {r.evidence.map((id) =>
                    cited[id] ? (
                      <li key={id} className="text-xs text-[var(--muted)]">
                        {cited[id]}
                      </li>
                    ) : null,
                  )}
                </ul>
              )}
              {r.bridge && <p className="mt-2 text-sm">{r.bridge}</p>}
              {short && <p className="mt-2 text-xs text-[var(--muted)]">{gapHint}</p>}
            </li>
          );
        })}
      </ul>
      {children}
    </section>
  );
}
