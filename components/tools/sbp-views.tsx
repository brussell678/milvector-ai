import type { ReactNode } from "react";
import { ToolAlert } from "@/components/tools/tool-alert";
import type { SbpAnalysis, SbpScenario } from "@/lib/sbp/math";
import { usd, type SbpAssessment } from "@/lib/sbp/inputs";
import { sbpAlternativesText } from "@/lib/chat/sbp-text";

// The SBP Decision Advisor's figures and assessment, shared by the classic
// page and the chat (docs/CHAT_TOOLS_PLAN.md, Phase 5). Moved here from the
// classic page unchanged.

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-[var(--muted)]">{hint}</span> : null}
    </label>
  );
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

export function ScenarioCard({ s, highlight }: { s: SbpScenario; highlight?: boolean }) {
  const rows: [string, string][] = [
    ["Covered amount of retired pay", `${usd(s.baseAmount)} / mo`],
    ["Premium", `${usd(s.monthlyPremium, true)} / mo`],
    ["Premium after tax savings", `${usd(s.monthlyPremiumAfterTax, true)} / mo`],
    ["Spouse receives for life", `${usd(s.monthlyAnnuity)} / mo`],
    ["Premiums end after", `${s.yearsOfPremiums} years`],
    ["Total premiums until paid up", usd(s.totalPremiums)],
    ["Annuity repays all premiums in", `${s.monthsOfAnnuityToRecoverPremiums} months`],
    ["Lump sum needed to match it", usd(s.lumpSumEquivalentAtRetirement)],
  ];
  return (
    <div className={`rounded-xl border p-4 ${highlight ? "border-[var(--accent)] bg-[var(--panel)]" : "border-[var(--line)] bg-[var(--surface)]"}`}>
      <p className="text-sm font-bold">{s.label}</p>
      <dl className="mt-3 grid gap-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 text-sm">
            <dt className="text-[var(--muted)]">{k}</dt>
            <dd className="shrink-0 font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {s.lowBaseNotice ? <p className="mt-3 text-xs text-[var(--muted)]">At a covered amount this small, DFAS may use a formula that makes the premium slightly lower than shown.</p> : null}
    </div>
  );
}

export function SbpSpecialRules({ retirementType, formerSpouse }: { retirementType: string; formerSpouse: boolean }) {
  if (retirementType !== "reserve" && !formerSpouse) return null;
  return (
    <ToolAlert variant="warn" title="Your situation has special rules">
      <p className="text-sm">
        {retirementType === "reserve" ? "Reserve Component SBP is priced differently from what is calculated here. " : ""}
        {formerSpouse ? "Former-spouse coverage and court orders change who can be covered and what can be declined. " : ""}
        Treat these figures as a rough guide and confirm with your retirement services office or a legal assistance attorney.
      </p>
    </ToolAlert>
  );
}

/** Full, reduced, no SBP, and a term quote side by side, with the assumptions. */
export function SbpNumbers({ a, columns = "lg:grid-cols-2" }: { a: SbpAnalysis; columns?: string }) {
  return (
    <>
      <div className={`grid gap-3 ${columns}`}>
        <ScenarioCard s={a.full} highlight />
        {a.reduced ? <ScenarioCard s={a.reduced} /> : null}
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <p className="text-sm font-bold">No SBP</p>
          <dl className="mt-3 grid gap-1.5 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[var(--muted)]">Premium</dt>
              <dd className="font-semibold">$0</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[var(--muted)]">Retired pay that stops at your death</dt>
              <dd className="font-semibold tabular-nums">{usd(a.none.retiredPayLostAtDeath)} / mo</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-[var(--muted)]">Declining needs your spouse&apos;s notarized agreement and generally cannot be reversed later.</p>
        </div>
        {a.term ? (
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <p className="text-sm font-bold">Your term life quote</p>
            <dl className="mt-3 grid gap-1.5 text-sm">
              {(
                [
                  ["Coverage", usd(a.term.coverage)],
                  ["Premium", `${usd(a.term.monthlyPremium, true)} / mo`],
                  ["Income it could fund if you die at retirement", `${usd(a.term.incomeIfDeathAtRetirement)} / mo`],
                  [`Income it could fund if you die in year ${a.term.termYears}`, `${usd(a.term.incomeIfDeathAtTermEnd)} / mo`],
                  [`After the term ends (spouse age ${a.term.spouseAgeWhenTermEnds})`, "$0"],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3">
                  <dt className="text-[var(--muted)]">{k}</dt>
                  <dd className="shrink-0 font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </div>
      <p className="text-xs text-[var(--muted)]">
        Assumptions: spouse lives to {a.assumptions.spouseLifeExpectancy}; an invested lump sum earns {(a.assumptions.realReturn * 100).toFixed(0)} percent a year above inflation; tax bracket{" "}
        {(a.assumptions.marginalTaxRate * 100).toFixed(0)} percent. SBP and VA survivor compensation (DIC) are both paid in full.
      </p>
    </>
  );
}

/** The written assessment, or why there is none. */
export function SbpAssessmentView({ r, assessmentError }: { r: SbpAssessment | null; assessmentError?: string }) {
  if (!r) {
    return (
      <ToolAlert variant="warn" title="The numbers are ready, but the written assessment did not generate">
        <p className="text-sm">{assessmentError ?? "Try again in a moment."}</p>
      </ToolAlert>
    );
  }
  return (
    <>
      <div>
        <p className="tool-kicker">ASSESSMENT</p>
        <p className="section-title mt-0.5">{r.best_fit_option}</p>
      </div>
      <p className="text-sm leading-relaxed">{r.snapshot}</p>
      {r.missing_information.length > 0 && (
        <ToolAlert variant="warn" title="This is provisional">
          <ul className="list-disc pl-5 text-sm">
            {r.missing_information.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </ToolAlert>
      )}
      <Bullets title="Why it fits" items={r.why_it_fits} />
      <Bullets title="What could make this wrong" items={r.main_risks} />
      <Bullets title="Alternatives" items={sbpAlternativesText(r)} />
      <Bullets title="What to do next" items={r.next_steps} />
    </>
  );
}

export function SbpReadThis({ a }: { a: SbpAnalysis }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
      <li>This is educational guidance, not legal, tax, or financial advice. MilVector sells nothing and earns nothing from your choice.</li>
      {a.notModeled.map((n, i) => (
        <li key={i}>{n}</li>
      ))}
      <li>Confirm your election with your installation retirement services office before you sign.</li>
    </ul>
  );
}
