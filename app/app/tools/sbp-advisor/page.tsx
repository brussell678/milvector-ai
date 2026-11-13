"use client";

import { FormEvent, useState } from "react";
import { LoadingBlock } from "@/components/tools/loading-block";
import { ToolAlert } from "@/components/tools/tool-alert";

// ─── Types ────────────────────────────────────────────────────────────

type Scenario = {
  label: string;
  baseAmount: number;
  monthlyPremium: number;
  monthlyPremiumAfterTax: number;
  monthlyAnnuity: number;
  yearsOfPremiums: number;
  totalPremiums: number;
  monthsOfAnnuityToRecoverPremiums: number;
  lumpSumEquivalentAtRetirement: number;
  lowBaseNotice: boolean;
};

type Term = {
  coverage: number;
  monthlyPremium: number;
  termYears: number;
  incomeIfDeathAtRetirement: number;
  incomeIfDeathAtTermEnd: number;
  spouseAgeWhenTermEnds: number;
};

type Analysis = {
  full: Scenario;
  reduced: Scenario | null;
  none: { retiredPayLostAtDeath: number };
  term: Term | null;
  assumptions: { spouseLifeExpectancy: number; realReturn: number; marginalTaxRate: number };
  notModeled: string[];
};

type Assessment = {
  snapshot: string;
  best_fit_option: string;
  why_it_fits: string[];
  main_risks: string[];
  strong_alternative: string;
  if_you_value_flexibility_more: string;
  if_you_value_certainty_more: string;
  next_steps: string[];
  missing_information: string[];
};

type Result = { analysis: Analysis; assessment: Assessment | null; assessmentError?: string };

// ─── Helpers ──────────────────────────────────────────────────────────

const usd = (value: number, cents = false) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents ? 2 : 0, minimumFractionDigits: cents ? 2 : 0 });

const num = (value: string) => (value.trim() === "" ? undefined : Number(value.replace(/[$,\s]/g, "")));

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-[var(--muted)]">{hint}</span> : null}
    </label>
  );
}

function Bullets({ title, items }: { title: string; items: string[] }) {
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

function ScenarioCard({ s, highlight }: { s: Scenario; highlight?: boolean }) {
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
    <div
      className={`rounded-xl border p-4 ${
        highlight ? "border-[var(--accent)] bg-[var(--panel)]" : "border-[var(--line)] bg-[var(--surface)]"
      }`}
    >
      <p className="text-sm font-bold">{s.label}</p>
      <dl className="mt-3 grid gap-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 text-sm">
            <dt className="text-[var(--muted)]">{k}</dt>
            <dd className="shrink-0 font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {s.lowBaseNotice ? (
        <p className="mt-3 text-xs text-[var(--muted)]">
          At a covered amount this small, DFAS may use a formula that makes the premium slightly lower than shown.
        </p>
      ) : null}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────

export default function SbpAdvisorPage() {
  const [f, setF] = useState({
    maritalStatus: "married",
    memberAge: "",
    spouseAge: "",
    childrenAges: "",
    formerSpouse: false,
    retirementType: "active",
    relies: "partly",
    retiredPay: "",
    vaComp: "",
    spouseIncome: "",
    otherIncome: "",
    assets: "",
    lifeInsurance: "",
    expenses: "",
    taxRate: "22",
    memberHealth: "good",
    spouseHealth: "good",
    tobacco: false,
    incomePreference: "unsure",
    lumpSumComfort: "somewhat",
    inflation: "very",
    horizon: "spouse_lifetime",
    reducedBase: "",
    termCoverage: "",
    termPremium: "",
    termYears: "",
    notes: "",
  });
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (key: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((prev) => ({ ...prev, [key]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const termComplete = num(f.termCoverage) && num(f.termPremium) && num(f.termYears);
    const payload = {
      maritalStatus: f.maritalStatus,
      memberAgeAtRetirement: num(f.memberAge),
      spouseAge: num(f.spouseAge) ?? null,
      childrenAges: f.childrenAges
        .split(",")
        .map((x) => Number(x.trim()))
        .filter((x) => Number.isFinite(x) && x >= 0 && f.childrenAges.trim() !== ""),
      formerSpouseOrCourtOrder: f.formerSpouse,
      retirementType: f.retirementType,
      spouseReliesOnRetiredPay: f.relies,
      grossRetiredPay: num(f.retiredPay),
      vaCompensation: num(f.vaComp) ?? 0,
      spouseIncome: num(f.spouseIncome) ?? 0,
      otherIncome: num(f.otherIncome) ?? 0,
      investableAssets: num(f.assets) ?? 0,
      existingLifeInsurance: num(f.lifeInsurance) ?? 0,
      monthlyExpenses: num(f.expenses) ?? 0,
      marginalTaxRatePct: num(f.taxRate) ?? 22,
      memberHealth: f.memberHealth,
      spouseHealth: f.spouseHealth,
      tobaccoUse: f.tobacco,
      incomePreference: f.incomePreference,
      lumpSumComfort: f.lumpSumComfort,
      inflationImportance: f.inflation,
      protectionHorizon: f.horizon,
      reducedBaseAmount: num(f.reducedBase) ?? null,
      termQuote: termComplete ? { coverage: num(f.termCoverage), monthlyPremium: num(f.termPremium), termYears: num(f.termYears) } : null,
      notes: f.notes || null,
    };

    try {
      const res = await fetch("/api/tools/sbp-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Something went wrong on our end. Your entries are still here. Try again in a few seconds.");
        return;
      }
      setResult(data as Result);
    } catch {
      setError("That didn't go through. Check your connection and try again. Your entries are still here.");
    } finally {
      setLoading(false);
    }
  }

  const a = result?.analysis;
  const r = result?.assessment;

  return (
    <main className="page-shell">
      <section className="page-hero-dark">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker-pill">SBP DECISION ADVISOR</p>
            <h1 className="page-title">
              Decide on the Survivor Benefit Plan <span className="gradient-text">with real numbers.</span>
            </h1>
            <p className="page-description">
              SBP is a one-time election at retirement. Enter your situation and see what each option costs, what your spouse would
              receive, and which approach fits your family.
            </p>
          </div>
          <aside className="page-hero-aside relative z-10">
            <p className="page-hero-aside-title">WHAT YOU GET</p>
            <ul className="page-hero-list">
              <li>Full, reduced, and no-SBP side by side</li>
              <li>A fair comparison with a term life quote, if you have one</li>
              <li>A plain-language recommendation with the tradeoffs</li>
              <li>Next steps before you sign the DD Form 2656</li>
            </ul>
          </aside>
        </div>
      </section>

      <div className="tool-shell">
        {/* ── INPUT ─────────────────────────────────────────────── */}
        <div className="tool-input-panel">
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <section className="tool-section">
              <p className="tool-kicker">YOUR FAMILY</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Marital status">
                  <select className="input" value={f.maritalStatus} onChange={set("maritalStatus")}>
                    <option value="married">Married</option>
                    <option value="single">Single</option>
                    <option value="divorced">Divorced</option>
                    <option value="widowed">Widowed</option>
                  </select>
                </Field>
                <Field label="Retirement type">
                  <select className="input" value={f.retirementType} onChange={set("retirementType")}>
                    <option value="active">Active duty (20+ years)</option>
                    <option value="reserve">Reserve or Guard</option>
                    <option value="medical">Medical retirement</option>
                  </select>
                </Field>
                <Field label="Your age at retirement">
                  <input className="input" inputMode="numeric" value={f.memberAge} onChange={set("memberAge")} placeholder="e.g. 42" required />
                </Field>
                <Field label="Spouse's age">
                  <input className="input" inputMode="numeric" value={f.spouseAge} onChange={set("spouseAge")} placeholder="e.g. 40" required={f.maritalStatus === "married"} />
                </Field>
              </div>
              <Field label="Children's ages" hint="Comma-separated. Leave blank if none.">
                <input className="input" value={f.childrenAges} onChange={set("childrenAges")} placeholder="e.g. 8, 12" />
              </Field>
              <Field label="How much does your spouse rely on your retired pay?">
                <select className="input" value={f.relies} onChange={set("relies")}>
                  <option value="fully">It would be most of the household income</option>
                  <option value="partly">It matters, but there is other income</option>
                  <option value="no">My spouse would be fine without it</option>
                </select>
              </Field>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={f.formerSpouse} onChange={set("formerSpouse")} />
                <span>A former spouse or a court order is involved in my SBP coverage</span>
              </label>
            </section>

            <section className="tool-section">
              <p className="tool-kicker">MONTHLY INCOME AND ASSETS</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Gross retired pay (monthly)" hint="Before taxes and deductions.">
                  <input className="input" inputMode="decimal" value={f.retiredPay} onChange={set("retiredPay")} placeholder="e.g. 4,200" required />
                </Field>
                <Field label="VA compensation (monthly)" hint="Estimate is fine. Optional.">
                  <input className="input" inputMode="decimal" value={f.vaComp} onChange={set("vaComp")} placeholder="e.g. 1,800" />
                </Field>
                <Field label="Spouse's income (monthly)">
                  <input className="input" inputMode="decimal" value={f.spouseIncome} onChange={set("spouseIncome")} placeholder="0" />
                </Field>
                <Field label="Other income (monthly)" hint="Other pensions, rentals.">
                  <input className="input" inputMode="decimal" value={f.otherIncome} onChange={set("otherIncome")} placeholder="0" />
                </Field>
                <Field label="Savings and investments" hint="TSP, IRAs, brokerage, cash.">
                  <input className="input" inputMode="decimal" value={f.assets} onChange={set("assets")} placeholder="e.g. 250,000" />
                </Field>
                <Field label="Life insurance already in force">
                  <input className="input" inputMode="decimal" value={f.lifeInsurance} onChange={set("lifeInsurance")} placeholder="e.g. 500,000" />
                </Field>
                <Field label="Household expenses (monthly)" hint="Optional, but it sharpens the answer.">
                  <input className="input" inputMode="decimal" value={f.expenses} onChange={set("expenses")} placeholder="e.g. 6,500" />
                </Field>
                <Field label="Tax bracket (%)" hint="Federal plus state. 22 is a common estimate.">
                  <input className="input" inputMode="decimal" value={f.taxRate} onChange={set("taxRate")} />
                </Field>
              </div>
            </section>

            <section className="tool-section">
              <p className="tool-kicker">HEALTH AND PRIORITIES</p>
              <p className="section-description">
                Health matters because SBP has no medical review, and private life insurance usually does.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Your health">
                  <select className="input" value={f.memberHealth} onChange={set("memberHealth")}>
                    <option value="good">Good</option>
                    <option value="some_issues">Some issues</option>
                    <option value="serious_issues">Serious issues</option>
                  </select>
                </Field>
                <Field label="Spouse's health">
                  <select className="input" value={f.spouseHealth} onChange={set("spouseHealth")}>
                    <option value="good">Good</option>
                    <option value="some_issues">Some issues</option>
                    <option value="serious_issues">Serious issues</option>
                  </select>
                </Field>
                <Field label="If you die first, your spouse would want">
                  <select className="input" value={f.incomePreference} onChange={set("incomePreference")}>
                    <option value="guaranteed_monthly">A guaranteed monthly check</option>
                    <option value="lump_sum">A lump sum to manage</option>
                    <option value="unsure">Not sure</option>
                  </select>
                </Field>
                <Field label="Managing a large lump sum">
                  <select className="input" value={f.lumpSumComfort} onChange={set("lumpSumComfort")}>
                    <option value="confident">My spouse would handle it well</option>
                    <option value="somewhat">Probably, with help</option>
                    <option value="not_confident">That would be hard</option>
                  </select>
                </Field>
                <Field label="Protection from inflation">
                  <select className="input" value={f.inflation} onChange={set("inflation")}>
                    <option value="very">Very important</option>
                    <option value="somewhat">Somewhat important</option>
                    <option value="not">Not a concern</option>
                  </select>
                </Field>
                <Field label="Protection is needed for">
                  <select className="input" value={f.horizon} onChange={set("horizon")}>
                    <option value="spouse_lifetime">My spouse&apos;s whole life</option>
                    <option value="early_years">Mostly the early retirement years</option>
                    <option value="unsure">Not sure</option>
                  </select>
                </Field>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={f.tobacco} onChange={set("tobacco")} />
                <span>I use tobacco or nicotine</span>
              </label>
            </section>

            <section className="tool-section">
              <p className="tool-kicker">OPTIONS TO COMPARE (OPTIONAL)</p>
              <Field label="Reduced SBP: covered amount (monthly)" hint="To see partial coverage, enter less than your full retired pay.">
                <input className="input" inputMode="decimal" value={f.reducedBase} onChange={set("reducedBase")} placeholder="e.g. 2,000" />
              </Field>
              <p className="text-sm font-medium">A real term life quote, if you have one</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Coverage">
                  <input className="input" inputMode="decimal" value={f.termCoverage} onChange={set("termCoverage")} placeholder="750,000" />
                </Field>
                <Field label="Premium / mo">
                  <input className="input" inputMode="decimal" value={f.termPremium} onChange={set("termPremium")} placeholder="65" />
                </Field>
                <Field label="Term (years)">
                  <input className="input" inputMode="numeric" value={f.termYears} onChange={set("termYears")} placeholder="20" />
                </Field>
              </div>
              <p className="text-xs text-[var(--muted)]">
                MilVector never makes up insurance prices. Without a real quote, the comparison stays general.
              </p>
              <Field label="Anything else that matters" hint="Optional. Do not include SSNs or account numbers.">
                <textarea className="input min-h-20" value={f.notes} onChange={set("notes")} />
              </Field>
              <button className="btn btn-primary w-full sm:w-auto" type="submit" disabled={loading}>
                {loading ? "Working…" : "Compare My Options"}
              </button>
            </section>
          </form>
        </div>

        {/* ── OUTPUT ────────────────────────────────────────────── */}
        <div className="tool-output-panel">
          {loading && <LoadingBlock task="Running the numbers…" detail="Calculating each option and writing your assessment. Usually 20 to 40 seconds." />}

          {!loading && error && (
            <ToolAlert variant="error" title="Could not finish">
              <p className="text-sm">{error}</p>
            </ToolAlert>
          )}

          {!loading && a && (
            <>
              {(f.retirementType === "reserve" || f.formerSpouse) && (
                <ToolAlert variant="warn" title="Your situation has special rules">
                  <p className="text-sm">
                    {f.retirementType === "reserve"
                      ? "Reserve Component SBP is priced differently from what is calculated here. "
                      : ""}
                    {f.formerSpouse ? "Former-spouse coverage and court orders change who can be covered and what can be declined. " : ""}
                    Treat these figures as a rough guide and confirm with your retirement services office or a legal assistance attorney.
                  </p>
                </ToolAlert>
              )}

              <div className="tool-output-card">
                <div>
                  <p className="tool-kicker">THE NUMBERS</p>
                  <p className="section-title mt-0.5">What each option costs and pays</p>
                  <p className="section-description">
                    In today&apos;s dollars. SBP premiums and the survivor payment both rise with the yearly cost-of-living adjustment.
                  </p>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
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
                    <p className="mt-3 text-xs text-[var(--muted)]">
                      Declining needs your spouse&apos;s notarized agreement and generally cannot be reversed later.
                    </p>
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
                  Assumptions: spouse lives to {a.assumptions.spouseLifeExpectancy}; an invested lump sum earns{" "}
                  {(a.assumptions.realReturn * 100).toFixed(0)} percent a year above inflation; tax bracket{" "}
                  {(a.assumptions.marginalTaxRate * 100).toFixed(0)} percent. SBP and VA survivor compensation (DIC) are both paid in
                  full.
                </p>
              </div>

              {r ? (
                <div className="tool-output-card">
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
                  <Bullets
                    title="Alternatives"
                    items={[
                      r.strong_alternative,
                      r.if_you_value_flexibility_more ? `If flexibility matters more: ${r.if_you_value_flexibility_more}` : "",
                      r.if_you_value_certainty_more ? `If certainty matters more: ${r.if_you_value_certainty_more}` : "",
                    ].filter(Boolean)}
                  />
                  <Bullets title="What to do next" items={r.next_steps} />
                </div>
              ) : (
                <ToolAlert variant="warn" title="The numbers are ready, but the written assessment did not generate">
                  <p className="text-sm">{result?.assessmentError ?? "Try again in a moment."}</p>
                </ToolAlert>
              )}

              <div className="tool-output-card">
                <p className="tool-kicker">READ THIS</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
                  <li>This is educational guidance, not legal, tax, or financial advice. MilVector sells nothing and earns nothing from your choice.</li>
                  {a.notModeled.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                  <li>Confirm your election with your installation retirement services office before you sign.</li>
                </ul>
              </div>
            </>
          )}

          {!loading && !result && !error && (
            <div className="tool-empty">
              <p className="font-medium">Your comparison will appear here</p>
              <p className="text-sm">
                Fill in what you know on the left. Only your ages and gross retired pay are required. Everything else sharpens the
                answer.
              </p>
              <div className="tool-example">
                <p className="tool-example-kicker">Example</p>
                <p className="mt-2 text-sm">
                  On $4,000 of retired pay, full SBP costs $260 a month and pays a surviving spouse $2,200 a month for life, rising
                  with inflation.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
