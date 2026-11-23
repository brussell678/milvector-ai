"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { LoadingBlock } from "@/components/tools/loading-block";
import { ToolAlert } from "@/components/tools/tool-alert";
import { Field, SbpAssessmentView, SbpNumbers, SbpReadThis, SbpSpecialRules } from "@/components/tools/sbp-views";
import { DEFAULT_SBP_FORM, sbpPayload, type SbpForm, type SbpResult } from "@/lib/sbp/inputs";

// ─── Page ─────────────────────────────────────────────────────────────

// Today's SBP Decision Advisor page. Members see it until the chat view opens
// to them (docs/CHAT_TOOLS_PLAN.md, D6); anyone who can see the chat reaches
// this at ?view=classic. Its request and figures come from lib/sbp/inputs.ts,
// the same functions the chat uses.
export function SbpAdvisorClassic({ chatAvailable = false }: { chatAvailable?: boolean }) {
  const [f, setF] = useState<SbpForm>(DEFAULT_SBP_FORM);
  const [result, setResult] = useState<SbpResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (key: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((prev) => ({ ...prev, [key]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const payload = sbpPayload(f);

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
      setResult(data as SbpResult);
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
          {chatAvailable && (
            <ToolAlert variant="info" title="Try the chat view">
              <p className="text-sm">
                The same advisor, as a chat you can ask questions in, with what-ifs that recalculate at once.{" "}
                <Link href="/app/tools/sbp-advisor" className="font-semibold underline">
                  Open the chat view
                </Link>
              </p>
            </ToolAlert>
          )}
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
              <SbpSpecialRules retirementType={f.retirementType} formerSpouse={f.formerSpouse} />
              <div className="tool-output-card">
                <div>
                  <p className="tool-kicker">THE NUMBERS</p>
                  <p className="section-title mt-0.5">What each option costs and pays</p>
                  <p className="section-description">
                    In today&apos;s dollars. SBP premiums and the survivor payment both rise with the yearly cost-of-living adjustment.
                  </p>
                </div>
                <SbpNumbers a={a} />
              </div>

              {r ? (
                <div className="tool-output-card">
                  <SbpAssessmentView r={r} />
                </div>
              ) : (
                <SbpAssessmentView r={null} assessmentError={result?.assessmentError} />
              )}

              <div className="tool-output-card">
                <p className="tool-kicker">READ THIS</p>
                <SbpReadThis a={a} />
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
