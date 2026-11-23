"use client";

import { ToolAlert } from "@/components/tools/tool-alert";
import type { Limb, Side } from "@/lib/va/bilateral";
import type { Analysis } from "@/lib/chat/va";

// The VA Rating Navigator's analysis card and its small helpers, shared by the
// classic page and the chat (docs/CHAT_TOOLS_PLAN.md, Phase 4). Moved here
// from the classic page unchanged.

// ─── Helpers ──────────────────────────────────────────────────────────

export const SIDE_OPTIONS: Record<"upper" | "lower", { value: Side; label: string }[]> = {
  upper: [
    { value: "left-upper", label: "Left arm or hand" },
    { value: "right-upper", label: "Right arm or hand" },
    { value: "both-upper", label: "Both arms" },
  ],
  lower: [
    { value: "left-lower", label: "Left leg or foot" },
    { value: "right-lower", label: "Right leg or foot" },
    { value: "both-lower", label: "Both legs" },
  ],
};

export function sideOptions(limb: Limb | null) {
  if (!limb) return [];
  return limb === "either" ? [...SIDE_OPTIONS.upper, ...SIDE_OPTIONS.lower] : SIDE_OPTIONS[limb];
}

export function Bullets({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">{title}</p>
      <ul className="flex flex-col gap-1.5">
        {items.map((item, idx) => (
          <li key={idx} className="flex gap-2 text-sm">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Fold({ title, children, open }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="rounded-lg border border-[var(--line)] bg-[var(--surface)]" open={open}>
      <summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold">{title}</summary>
      <div className="grid gap-3 border-t border-[var(--line)] p-3">{children}</div>
    </details>
  );
}

export const STATUS_LABEL: Record<string, { label: string; badge: string }> = {
  covered: { label: "You covered this", badge: "tool-badge-success" },
  unclear: { label: "Unclear", badge: "tool-badge-warn" },
  missing: { label: "Not mentioned", badge: "tool-badge-error" },
};

export function rangeText(a: Analysis) {
  const { low, high } = a.likelyRange;
  if (low === null || high === null) return "No estimate";
  return low === high ? `${low}%` : `${low} to ${high}%`;
}

// The estimate first, then each section folded so one condition never becomes a wall of text.
export function AnalysisView({ a }: { a: Analysis }) {
  const hasGaps = a.gaps.described.length + a.gaps.missing.length + a.gaps.weak.length + a.gaps.strengthen.length > 0;
  const hasLanguage = a.criteriaLanguage.lower.length + a.criteriaLanguage.middle.length + a.criteriaLanguage.higher.length > 0;

  return (
    <div className="grid gap-2">
      {a.crisisNote ? (
        <ToolAlert variant="stop" title="You are not alone">
          <p className="text-sm font-medium">{a.crisisNote}</p>
        </ToolAlert>
      ) : null}

      <div className="rounded-xl border border-[var(--accent)] bg-[var(--panel)] p-4">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Likely rating range (estimate)</p>
        <p className="mt-1 text-lg font-bold">{rangeText(a)}</p>
        <p className="text-xs text-[var(--muted)]">Confidence: {a.likelyRange.confidence}. Based only on what you entered.</p>
        {a.likelyRange.why ? <p className="mt-2 text-sm">{a.likelyRange.why}</p> : null}
        {a.likelyRange.up ? (
          <p className="mt-1.5 text-sm text-[var(--muted)]">
            <span className="font-semibold">Could move it up:</span> {a.likelyRange.up}
          </p>
        ) : null}
        {a.likelyRange.down ? (
          <p className="mt-1 text-sm text-[var(--muted)]">
            <span className="font-semibold">Could move it down:</span> {a.likelyRange.down}
          </p>
        ) : null}
      </div>

      {a.breakdown.length > 0 && (
        <Fold title="Rating criteria, level by level">
          {a.breakdown.map((row, idx) => (
            <div key={idx}>
              <p className="text-sm font-bold">{row.rating} percent</p>
              <p className="mt-0.5 text-sm">{row.criteria}</p>
              {row.evidence ? (
                <p className="mt-1 text-sm text-[var(--muted)]">
                  <span className="font-semibold">Evidence that supports it:</span> {row.evidence}
                </p>
              ) : null}
              {row.examiner ? (
                <p className="mt-0.5 text-sm text-[var(--muted)]">
                  <span className="font-semibold">What the examiner looks for:</span> {row.examiner}
                </p>
              ) : null}
            </div>
          ))}
        </Fold>
      )}

      {hasGaps && (
        <Fold title="Your evidence gaps">
          <Bullets title="What you already described" items={a.gaps.described} />
          <Bullets title="What appears to be missing" items={a.gaps.missing} />
          <Bullets title="Weak points" items={a.gaps.weak} />
          <Bullets title="What would strengthen the record" items={a.gaps.strengthen} />
        </Fold>
      )}

      {a.checklist.items.length > 0 && (
        <Fold title={`Exam form checklist${a.checklist.form ? `: ${a.checklist.form}` : ""}`}>
          <ul className="grid gap-1.5">
            {a.checklist.items.map((item, idx) => {
              const status = STATUS_LABEL[item.status] ?? STATUS_LABEL.unclear;
              return (
                <li key={idx} className="flex items-start justify-between gap-3 text-sm">
                  <span>{item.item}</span>
                  <span className={`tool-badge ${status.badge} shrink-0`} style={{ fontSize: "0.62rem" }}>
                    {status.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </Fold>
      )}

      {hasLanguage && (
        <Fold title="What the criteria turn on">
          <p className="text-xs text-[var(--muted)]">
            The regulation&apos;s own distinctions between rating levels. They tell you what to describe accurately, not what to
            say.
          </p>
          <Bullets title="Lower ratings" items={a.criteriaLanguage.lower} />
          <Bullets title="Middle ratings" items={a.criteriaLanguage.middle} />
          <Bullets title="Higher ratings" items={a.criteriaLanguage.higher} />
        </Fold>
      )}

      {a.examPrep.length > 0 && (
        <Fold title="Preparing for the exam">
          <Bullets title="" items={a.examPrep} />
        </Fold>
      )}

      {a.secondary.length > 0 && (
        <Fold title="Possible secondary conditions">
          <ul className="grid gap-1.5">
            {a.secondary.map((s, idx) => (
              <li key={idx} className="text-sm">
                <span className="font-semibold">{s.condition}</span>{" "}
                <span className="text-[var(--muted)]">
                  ({s.relationship}){s.note ? `: ${s.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Fold>
      )}
    </div>
  );
}
