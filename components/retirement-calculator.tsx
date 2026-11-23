"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { calculateIncome, decemberIncreasesBy, grossRetiredPay, projectIncome, reserveYearsOfService, type RetirementPlan } from "@/lib/retirement/calc";
import { estimatedYears, estimateHigh3, PAY_GRADES, PAY_TABLE_YEAR, PAY_TABLE_YEARS, PENDING_RAISE_NOTES } from "@/lib/retirement/pay";
import { TAX_YEAR, type FilingStatus } from "@/lib/retirement/tax";
import { VA_PENDING_COLA, VA_RATES_EFFECTIVE, VA_RATES_LABEL, VA_RATINGS } from "@/lib/va/compensation";

// Announced cost-of-living increase for retired pay and VA compensation,
// effective 1 December 2026. VA has not yet published the new rate table.

const usd = (value: number, cents = false) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents ? 2 : 0, minimumFractionDigits: cents ? 2 : 0 });

const num = (value: string) => {
  const parsed = Number(value.replace(/[$,%\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const GRADE_LABELS: Record<string, string> = { E: "Enlisted", W: "Warrant Officer", O: "Officer" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// Retirement years offered: the newest pay table year and the five after it.
// Reserve and Guard retired pay usually starts at 60, often decades after the
// last drill, so that list runs 30 years out.
const YEARS = Array.from({ length: 6 }, (_, i) => PAY_TABLE_YEAR + i);
const RESERVE_YEARS = Array.from({ length: 31 }, (_, i) => PAY_TABLE_YEAR + i);
const NEXT_RAISE_YEAR = PAY_TABLE_YEAR + 1;
const longDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-[var(--muted)]">{hint}</span> : null}
    </label>
  );
}

function Line({ label, value, strong, muted, sign }: { label: string; value: number; strong?: boolean; muted?: string; sign?: "minus" | "plus" }) {
  if (!strong && value === 0) return null;
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? "border-t border-[var(--line)] pt-2 font-bold" : ""}`}>
      <dt className="text-sm">
        {label}
        {muted ? <span className="block text-xs font-normal text-[var(--muted)]">{muted}</span> : null}
      </dt>
      <dd className="shrink-0 text-sm tabular-nums">
        {sign === "minus" ? "− " : sign === "plus" ? "+ " : ""}
        {usd(value, true)}
      </dd>
    </div>
  );
}

export function RetirementCalculator() {
  // Service
  const [component, setComponent] = useState<"active" | "reserve">("active");
  const [plan, setPlan] = useState<RetirementPlan>("high3");
  const [years, setYears] = useState("20");
  const [months, setMonths] = useState("0");
  const [points, setPoints] = useState("3600");
  // High-3
  const [high3Mode, setHigh3Mode] = useState<"estimate" | "enter">("estimate");
  const [grade, setGrade] = useState("E-7");
  const [retireMonth, setRetireMonth] = useState(0);
  const [retireYear, setRetireYear] = useState(NEXT_RAISE_YEAR);
  const [promotedRecently, setPromotedRecently] = useState(false);
  const [monthsInGrade, setMonthsInGrade] = useState("12");
  const [previousGrade, setPreviousGrade] = useState("E-6");
  const [high3Entered, setHigh3Entered] = useState("");
  const [futureRaise, setFutureRaise] = useState("3.6");
  // VA
  const [vaRating, setVaRating] = useState(0);
  const [useNewVaRates, setUseNewVaRates] = useState(true);
  const [spouse, setSpouse] = useState(false);
  const [childrenUnder18, setChildrenUnder18] = useState("0");
  const [childrenInSchool, setChildrenInSchool] = useState("0");
  const [parents, setParents] = useState<0 | 1 | 2>(0);
  const [combatRating, setCombatRating] = useState(0);
  // SBP and taxes
  const [sbpChoice, setSbpChoice] = useState<"none" | "full" | "custom">("none");
  const [sbpCustom, setSbpCustom] = useState("");
  const [filingStatus, setFilingStatus] = useState<FilingStatus>("married");
  const [otherIncome, setOtherIncome] = useState("");
  const [stateRate, setStateRate] = useState("0");
  const [cola, setCola] = useState("2.5");

  const yearsOfService = component === "active" ? num(years) + Math.min(11, num(months)) / 12 : reserveYearsOfService(num(points));

  // Years in the 36 months before the retirement date with no official pay table yet.
  const estimated = useMemo(() => estimatedYears(new Date(retireYear, retireMonth, 1)), [retireYear, retireMonth]);
  const futureEstimated = estimated.filter((y) => y > PAY_TABLE_YEAR);

  const high3Inputs = useMemo(
    () => ({
      grade,
      // Reserve: years for the pay table (with months), not the points-based years in the formula.
      yearsOfService: component === "active" ? yearsOfService : num(years) + Math.min(11, num(months)) / 12,
      retirementDate: new Date(retireYear, retireMonth, 1),
      monthsInGrade: promotedRecently ? Math.min(36, Math.max(0, num(monthsInGrade))) : 36,
      previousGrade: promotedRecently ? previousGrade : null,
      assumedFutureRaisePct: num(futureRaise),
    }),
    [grade, component, yearsOfService, years, months, retireYear, retireMonth, promotedRecently, monthsInGrade, previousGrade, futureRaise],
  );
  const high3 = useMemo(() => (high3Mode === "enter" ? num(high3Entered) : (estimateHigh3(high3Inputs) ?? 0)), [high3Mode, high3Entered, high3Inputs]);

  // A start years past the newest table: the same months priced at that table, in today's dollars.
  const farOff = futureEstimated.length > 0 && futureEstimated[0] > PAY_TABLE_YEAR + 2;
  const high3Today = useMemo(
    () => (high3Mode === "estimate" && farOff ? (estimateHigh3({ ...high3Inputs, payTableYear: PAY_TABLE_YEAR }) ?? 0) : 0),
    [high3Mode, farOff, high3Inputs],
  );

  // Phone only: hide the bottom total bar once the full result is on screen.
  const resultRef = useRef<HTMLDivElement>(null);
  const [resultInView, setResultInView] = useState(false);
  useEffect(() => {
    const node = resultRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setResultInView(entry.isIntersecting), { rootMargin: "0px 0px -120px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // A far-off start shows the monthly income in today's dollars: today's pay table, VA rates, and
  // tax brackets, all from one year. The future-years table stays in the dollars of each year,
  // from the projected High-3 and VA rates raised each December until pay starts.
  const todaysDollars = high3Today > 0;

  const { result, atStart } = useMemo(() => {
    const incomeFor = (high3Average: number, vaIncreasePct: number) => {
      const gross = grossRetiredPay(high3Average, yearsOfService, plan);
      return calculateIncome({
        high3Average,
        yearsOfService,
        plan,
        // Reserve retirement itself requires 20 qualifying years.
        regularRetirement: component === "reserve" ? true : undefined,
        vaRating,
        dependents: { spouse, childrenUnder18: num(childrenUnder18), childrenInSchool: num(childrenInSchool), dependentParents: parents },
        vaIncreasePct,
        combatRelatedRating: combatRating,
        sbpBaseAmount: sbpChoice === "full" ? gross : sbpChoice === "custom" ? num(sbpCustom) : 0,
        filingStatus,
        otherAnnualIncome: num(otherIncome),
        stateTaxRatePct: num(stateRate),
      });
    };
    const pendingPct = VA_PENDING_COLA ? VA_PENDING_COLA.pct : 0;
    const now = incomeFor(todaysDollars ? high3Today : high3, useNewVaRates ? pendingPct : 0);
    if (!todaysDollars) return { result: now, atStart: now };
    const knownYear = Number((VA_PENDING_COLA?.effective ?? VA_RATES_EFFECTIVE).slice(0, 4));
    const increases = decemberIncreasesBy(new Date(retireYear, retireMonth, 1), knownYear);
    const vaAtStartPct = ((1 + pendingPct / 100) * (1 + num(cola) / 100) ** increases - 1) * 100;
    return { result: now, atStart: incomeFor(high3, vaAtStartPct) };
  }, [todaysDollars, high3Today, high3, yearsOfService, plan, component, vaRating, spouse, childrenUnder18, childrenInSchool, parents, useNewVaRates, combatRating, sbpChoice, sbpCustom, filingStatus, otherIncome, stateRate, retireYear, retireMonth, cola]);

  const projection = useMemo(() => projectIncome(atStart, num(cola), [0, 5, 10, 20, 30]), [atStart, cola]);
  const underTwenty = component === "active" && yearsOfService < 20;

  return (
    <div className="tool-shell">
      {/* ── INPUTS ─────────────────────────────────────────────── */}
      <div className="tool-input-panel">
        <section className="tool-section">
          <p className="tool-kicker">1. YOUR SERVICE</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Component">
              <select
                className="input"
                value={component}
                onChange={(e) => {
                  const next = e.target.value as "active" | "reserve";
                  setComponent(next);
                  if (next === "active" && !YEARS.includes(retireYear)) setRetireYear(NEXT_RAISE_YEAR);
                }}
              >
                <option value="active">Active duty</option>
                <option value="reserve">Reserve or National Guard</option>
              </select>
            </Field>
            <Field label="Retirement system" hint="Joined 2018 or later, or opted in: BRS. Otherwise High-3.">
              <select className="input" value={plan} onChange={(e) => setPlan(e.target.value as RetirementPlan)}>
                <option value="high3">High-3 (2.5% per year)</option>
                <option value="brs">Blended Retirement System (2.0% per year)</option>
              </select>
            </Field>
          </div>
          {component === "active" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Years of service at retirement">
                <input className="input" inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value)} />
              </Field>
              <Field label="Plus months" hint="Each full month counts.">
                <input className="input" inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} />
              </Field>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Total retirement points"
                hint={`From your points statement. Divided by 360 and rounded to two decimals, that is ${reserveYearsOfService(num(points)).toFixed(2)} years in the formula.`}
              >
                <input className="input" inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value)} />
              </Field>
              <Field label="Years of service for the pay table" hint="From your pay entry date to the month retired pay starts. Years in the Retired Reserve (the gray area) count.">
                <input className="input" inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value)} />
              </Field>
              <Field label="Plus months" hint="Each full month counts.">
                <input className="input" inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} />
              </Field>
            </div>
          )}
          {underTwenty && (
            <p className="text-xs text-[var(--warn)]">
              Regular retirement takes 20 years. Under 20, this only applies to an early retirement authority or medical retirement,
              which this calculator does not fully model.
            </p>
          )}
        </section>

        <section className="tool-section">
          <p className="tool-kicker">2. YOUR HIGH-3</p>
          <p className="section-description">
            The average of your highest 36 months of basic pay.{" "}
            {component === "reserve" ? "Usually the three years before your retired pay starts." : "Usually your last three years."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`btn text-sm ${high3Mode === "estimate" ? "btn-primary" : "btn-secondary"}`} onClick={() => setHigh3Mode("estimate")}>
              Estimate it for me
            </button>
            <button type="button" className={`btn text-sm ${high3Mode === "enter" ? "btn-primary" : "btn-secondary"}`} onClick={() => setHigh3Mode("enter")}>
              I know my High-3
            </button>
          </div>
          {high3Mode === "enter" ? (
            <Field label="High-3 average (monthly)" hint="Add up your last 36 months of basic pay from your LES and divide by 36.">
              <input className="input" inputMode="decimal" value={high3Entered} onChange={(e) => setHigh3Entered(e.target.value)} placeholder="e.g. 6,100" />
            </Field>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Pay grade at retirement">
                  <select className="input" value={grade} onChange={(e) => setGrade(e.target.value)}>
                    {Object.entries(GRADE_LABELS).map(([prefix, label]) => (
                      <optgroup key={prefix} label={label}>
                        {PAY_GRADES.filter((g) => g.startsWith(prefix)).map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </Field>
                <Field
                  label={component === "reserve" ? "Month retired pay starts" : "Retirement month"}
                  hint={
                    component === "reserve"
                      ? "Usually the month you turn 60. Qualifying active duty after January 28, 2008 moves it 3 months earlier for each 90 days in a fiscal year, but not before 50. Your High-3 is the 36 months before this date."
                      : "The month your retirement starts, the day after your last day of service. Last day January 31? Choose February."
                  }
                >
                  <select className="input" value={retireMonth} onChange={(e) => setRetireMonth(Number(e.target.value))}>
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i}>
                        {m}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Year">
                  <select className="input" value={retireYear} onChange={(e) => setRetireYear(Number(e.target.value))}>
                    {(component === "reserve" ? RESERVE_YEARS : YEARS).map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={promotedRecently} onChange={(e) => setPromotedRecently(e.target.checked)} />
                <span>
                  {component === "reserve"
                    ? "I will have held this grade less than 3 years when my retired pay starts"
                    : "I will have less than 3 years in this grade when I retire"}
                </span>
              </label>
              {promotedRecently && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Months in grade at retirement">
                    <input className="input" inputMode="numeric" value={monthsInGrade} onChange={(e) => setMonthsInGrade(e.target.value)} />
                  </Field>
                  <Field label="Grade before that">
                    <select className="input" value={previousGrade} onChange={(e) => setPreviousGrade(e.target.value)}>
                      {PAY_GRADES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}
              {futureEstimated.length > 0 && (
                <Field label={`Assumed pay raise after ${PAY_TABLE_YEAR} (%)`} hint={`The ${NEXT_RAISE_YEAR} raise is not final.${PENDING_RAISE_NOTES[NEXT_RAISE_YEAR] ? " " + PENDING_RAISE_NOTES[NEXT_RAISE_YEAR] : ""}`}>
                  <input className="input" inputMode="decimal" value={futureRaise} onChange={(e) => setFutureRaise(e.target.value)} />
                </Field>
              )}
              <p className="text-sm">
                Estimated High-3: <span className="font-bold tabular-nums">{usd(high3, true)}</span>{" "}
                <span className="text-[var(--muted)]">a month</span>
              </p>
              {futureEstimated.length > 0 && (
                <p className="text-xs text-[var(--muted)]">
                  Your months in {futureEstimated.length > 2 ? `${futureEstimated[0]} to ${futureEstimated[futureEstimated.length - 1]}` : futureEstimated.join(" and ")}{" "}
                  use the assumed raise above until DFAS publishes {futureEstimated.length > 1 ? "those years' pay tables" : "that year's pay table"}.
                  {farOff && " That is a projection years ahead, so treat it as a rough estimate in future dollars."}
                </p>
              )}
              {high3Today > 0 && (
                <p className="text-sm">
                  In today&apos;s dollars: a High-3 of <span className="font-bold tabular-nums">{usd(high3Today, true)}</span>, or{" "}
                  <span className="font-bold tabular-nums">{usd(grossRetiredPay(high3Today, yearsOfService, plan))}</span> a month in gross retired pay.{" "}
                  <span className="mt-1 block text-xs text-[var(--muted)]">
                    That prices every month at the {PAY_TABLE_YEAR} pay table. Your monthly income uses it, so you can weigh it against your budget now.
                  </span>
                </p>
              )}
            </>
          )}
        </section>

        <section className="tool-section">
          <p className="tool-kicker">3. VA DISABILITY</p>
          <Field label="Combined VA disability rating" hint="Expected or awarded. Choose 0% to see retired pay alone.">
            <select className="input" value={vaRating} onChange={(e) => setVaRating(Number(e.target.value))}>
              {VA_RATINGS.map((r) => (
                <option key={r} value={r}>
                  {r === 0 ? "None, or not rated yet" : `${r}%`}
                </option>
              ))}
            </select>
          </Field>
          <p className="text-xs text-[var(--muted)]">
            Not sure what you will be rated?{" "}
            <Link href="/app/tools/va-rating-navigator" className="font-semibold text-[var(--accent)] underline">
              Estimate it with the VA Rating Navigator
            </Link>
            .
          </p>
          {vaRating >= 30 && (
            <>
              <p className="text-sm font-medium">Dependents (they raise VA pay at 30% and above)</p>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={spouse} onChange={(e) => setSpouse(e.target.checked)} />
                <span>Spouse</span>
              </label>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Children under 18">
                  <input className="input" inputMode="numeric" value={childrenUnder18} onChange={(e) => setChildrenUnder18(e.target.value)} />
                </Field>
                <Field label="Children 18 to 23 in school">
                  <input className="input" inputMode="numeric" value={childrenInSchool} onChange={(e) => setChildrenInSchool(e.target.value)} />
                </Field>
                <Field label="Dependent parents">
                  <select className="input" value={parents} onChange={(e) => setParents(Number(e.target.value) as 0 | 1 | 2)}>
                    <option value={0}>None</option>
                    <option value={1}>One</option>
                    <option value={2}>Two</option>
                  </select>
                </Field>
              </div>
            </>
          )}
          {vaRating >= 10 && vaRating < 50 && (
            <Field label="Combat-related portion of your rating" hint="For Combat-Related Special Compensation (CRSC). Leave at none if unsure.">
              <select className="input" value={combatRating} onChange={(e) => setCombatRating(Number(e.target.value))}>
                {VA_RATINGS.filter((r) => r <= vaRating).map((r) => (
                  <option key={r} value={r}>
                    {r === 0 ? "None" : `${r}%`}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {vaRating >= 10 && VA_PENDING_COLA && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={useNewVaRates} onChange={(e) => setUseNewVaRates(e.target.checked)} />
              <span>
                Include the {VA_PENDING_COLA.pct}% increase effective {longDate(VA_PENDING_COLA.effective)}
                <span className="block text-xs text-[var(--muted)]">
                  An estimate until VA publishes the new table. Unchecked uses the official {VA_RATES_LABEL} rates.
                </span>
              </span>
            </label>
          )}
        </section>

        <section className="tool-section">
          <p className="tool-kicker">4. SBP AND TAXES</p>
          <Field label="Survivor Benefit Plan">
            <select className="input" value={sbpChoice} onChange={(e) => setSbpChoice(e.target.value as "none" | "full" | "custom")}>
              <option value="none">No SBP</option>
              <option value="full">Full coverage</option>
              <option value="custom">Reduced coverage</option>
            </select>
          </Field>
          {component === "reserve" && sbpChoice !== "none" && (
            <p className="text-xs text-[var(--muted)]">
              Reserve and Guard: if you chose RCSBP Option B or C on your 20-year letter, DFAS also takes a Reserve Component premium from your retired
              pay, on top of the standard 6.5 percent shown here. Its rate depends on your age and your spouse&apos;s age, so this estimate leaves it out.
              With Option A, the standard premium is all you pay.
            </p>
          )}
          {sbpChoice === "custom" && (
            <Field label="Covered amount of retired pay (monthly)">
              <input className="input" inputMode="decimal" value={sbpCustom} onChange={(e) => setSbpCustom(e.target.value)} placeholder="e.g. 2,000" />
            </Field>
          )}
          <p className="text-xs text-[var(--muted)]">
            Still deciding?{" "}
            <Link href="/app/tools/sbp-advisor" className="font-semibold text-[var(--accent)] underline">
              Compare your options in the SBP Decision Advisor
            </Link>
            .
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Filing status">
              <select className="input" value={filingStatus} onChange={(e) => setFilingStatus(e.target.value as FilingStatus)}>
                <option value="married">Married filing jointly</option>
                <option value="single">Single</option>
              </select>
            </Field>
            <Field label="Other household income (yearly)" hint="Civilian salary, spouse income. Sets the bracket your retired pay lands in.">
              <input className="input" inputMode="decimal" value={otherIncome} onChange={(e) => setOtherIncome(e.target.value)} placeholder="e.g. 85,000" />
            </Field>
            <Field label="State income tax on retired pay (%)" hint="Many states do not tax military retired pay. Enter 0 if yours does not.">
              <input className="input" inputMode="decimal" value={stateRate} onChange={(e) => setStateRate(e.target.value)} />
            </Field>
            <Field label="Yearly cost-of-living increase (%)" hint="For the future-years table only.">
              <input className="input" inputMode="decimal" value={cola} onChange={(e) => setCola(e.target.value)} />
            </Field>
          </div>
        </section>
      </div>

      {/* ── RESULTS ────────────────────────────────────────────── */}
      <div className="tool-output-panel scroll-mt-20" id="monthly-income" ref={resultRef}>
        <div className="tool-output-card lg:sticky lg:top-4">
          <div>
            <p className="tool-kicker">{todaysDollars ? "YOUR MONTHLY INCOME IN TODAY'S DOLLARS" : "YOUR MONTHLY INCOME"}</p>
            <p className="mt-1 text-4xl font-extrabold tabular-nums">{usd(result.totalNetMonthly)}</p>
            <p className="text-sm text-[var(--muted)]">
              a month after tax, about {usd(result.totalNetAnnual)} a year.{" "}
              {result.taxFreeIncome > 0 ? `${usd(result.taxFreeIncome)} of it is tax free.` : ""}
            </p>
            {todaysDollars && (
              <p className="mt-2 text-sm text-[var(--muted)]">
                Your retired pay starts in {retireYear}. This uses today&apos;s pay table, VA rates, and tax brackets, so you can weigh it
                against your budget now. The table below shows the dollars of each year.
              </p>
            )}
          </div>

          <dl className="grid gap-2">
            <Line label="Gross retired pay" value={result.grossRetiredPay} muted={`${result.multiplierPct}% of your High-3`} />
            <Line label="Waived for VA compensation" value={result.vaWaiver} sign="minus" muted="Replaced by tax-free VA pay below" />
            <Line label="SBP premium" value={result.sbpPremium} sign="minus" />
            <Line label={`Federal income tax (${TAX_YEAR} estimate)`} value={result.federalTax} sign="minus" />
            <Line label="State income tax" value={result.stateTax} sign="minus" />
            <Line label="Retired pay you keep" value={result.netRetiredPay} strong />
            <Line label="VA disability compensation" value={result.vaCompensation} sign="plus" muted="Tax free" />
            <Line label="Combat-Related Special Compensation" value={result.crscPayment} sign="plus" muted="Tax free" />
            <Line label="Total each month" value={result.totalNetMonthly} strong />
          </dl>

          {result.concurrentReceipt !== "none" && (
            <span className="tool-badge tool-badge-success self-start">
              {result.concurrentReceipt === "CRDP" ? "CRDP: both paid in full" : "CRSC applied"}
            </span>
          )}

          {result.notes.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
              {result.notes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
          )}
          {component === "reserve" && (
            <p className="text-sm text-[var(--muted)]">
              Reserve retired pay starts at age 60, or earlier with qualifying active service after January 28, 2008. This shows the
              amount once pay begins.
            </p>
          )}
        </div>

        <div className="tool-output-card">
          <div>
            <p className="tool-kicker">IN FUTURE YEARS</p>
            <p className="section-description">
              {todaysDollars
                ? `Before tax, in the dollars of each year. Retired pay starts from your projected ${retireYear} High-3, and VA rates rise by the yearly increase each December until then. After that, both rise with the same yearly adjustment.`
                : "Before tax. Retired pay and VA compensation both rise with the same yearly adjustment."}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[var(--muted)]">
                  <th className="py-1.5 pr-3 font-semibold">Year</th>
                  <th className="py-1.5 pr-3 text-right font-semibold">Retired pay</th>
                  <th className="py-1.5 pr-3 text-right font-semibold">VA pay</th>
                  <th className="py-1.5 text-right font-semibold">Monthly total</th>
                </tr>
              </thead>
              <tbody>
                {projection.map((row) => (
                  <tr key={row.year} className="border-t border-[var(--line)]">
                    <td className="py-1.5 pr-3">
                      {todaysDollars ? (row.year === 0 ? `${retireYear}, pay starts` : `${retireYear + row.year}`) : row.year === 0 ? "At retirement" : `Year ${row.year}`}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums whitespace-nowrap">{usd(row.grossRetiredPay)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums whitespace-nowrap">{usd(row.vaCompensation)}</td>
                    <td className="py-1.5 text-right font-semibold tabular-nums whitespace-nowrap">{usd(row.combinedBeforeTax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="tool-output-card">
          <p className="tool-kicker">WHAT THIS IS BUILT ON</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
            <li>Nothing you type here leaves your browser, and nothing is saved.</li>
            <li>
              Basic pay: the official DFAS tables for {PAY_TABLE_YEARS[0]} to {PAY_TABLE_YEAR}, month by month across your High-3. A month in a
              year without a published table uses the assumed raise. Your LES is the exact figure.
            </li>
            <li>
              VA compensation: VA&apos;s published {VA_RATES_LABEL} rates (effective {VA_RATES_EFFECTIVE})
              {VA_PENDING_COLA ? `, with the announced ${VA_PENDING_COLA.pct}% increase if you checked it` : ""}.
            </li>
            {component === "reserve" && (
              <li>
                Reserve and Guard: the High-3 is the 36 months before your retired pay starts, figured as if you had served on active duty in your
                grade, even if you were not drilling then (DoD Financial Management Regulation, Volume 7B, Chapter 3). Years in the formula are your
                points divided by 360, rounded to two decimals. If you leave the Retired Reserve before your pay starts, only months before you left
                count, which this does not model.
              </li>
            )}
            <li>Federal tax: {TAX_YEAR} brackets and standard deduction only. No credits, itemizing, or other taxes.</li>
            <li>
              Not included: medical (Chapter 61) retirement, REDUX, the BRS lump sum, Special Monthly Compensation, TSP, and Social
              Security.
            </li>
            <li>This is an estimate for planning, not a statement of entitlement. DFAS and VA determine actual pay.</li>
          </ul>
        </div>
      </div>

      {!resultInView && (
        <a
          href="#monthly-income"
          className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-[var(--line)] bg-[var(--panel)] px-4 py-2.5 shadow-[var(--shadow-lg)] lg:hidden"
          style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom))" }}
        >
          <span>
            <span className="block text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
              {todaysDollars ? "Monthly income, today's dollars" : "Your monthly income"}
            </span>
            <span className="block text-xl font-extrabold tabular-nums">{usd(result.totalNetMonthly)}</span>
          </span>
          <span className="btn btn-primary text-sm">See the breakdown</span>
        </a>
      )}
    </div>
  );
}
