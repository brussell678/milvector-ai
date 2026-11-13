// Survivor Benefit Plan arithmetic for spouse coverage on a regular (active
// duty) retirement. 10 U.S.C. 1447 to 1455; DoD FMR Volume 7B, Chapter 45.
//
// What is modeled:
//   - Spouse coverage premium: 6.5 percent of the chosen base amount
//   - Survivor annuity: 55 percent of the base amount, for life, with COLA
//   - Paid-up status: no more premiums after 360 payments AND age 70 (1452(j))
//   - Premiums come out of retired pay before tax
//   - SBP and VA DIC are both paid in full (offset ended 1 January 2023)
//
// What is NOT modeled, and is reported as such to the user:
//   - Reserve Component SBP, child-only, former-spouse, and insurable-interest
//     coverage, which price differently
//   - The alternate low-base premium formula. It can only make the premium
//     lower than shown here, and only at small base amounts.
//
// Every dollar figure is in today's dollars. Premium and annuity both rise
// with the same retired-pay COLA, so comparing them in today's dollars is fair.

export const SBP_PREMIUM_RATE = 0.065;
export const SBP_ANNUITY_RATE = 0.55;
export const SBP_MIN_BASE = 300;
export const PAID_UP_PAYMENTS = 360;
export const PAID_UP_AGE = 70;
// Below this base amount the alternate premium formula may apply.
export const LOW_BASE_NOTICE = 3000;

export type SbpInputs = {
  grossRetiredPay: number; // monthly, before deductions
  baseAmount: number; // monthly; 300 up to full retired pay
  memberAgeAtRetirement: number;
  spouseAge: number;
  marginalTaxRate: number; // 0 to 0.5, combined federal and state
  // Planning assumptions the user can change
  spouseLifeExpectancy?: number; // default 90
  realReturn?: number; // return above inflation on an invested lump sum, default 0.02
};

export type SbpScenario = {
  label: string;
  baseAmount: number;
  monthlyPremium: number;
  monthlyPremiumAfterTax: number;
  monthlyAnnuity: number;
  yearsOfPremiums: number;
  totalPremiums: number; // today's dollars, until paid up
  // How long a survivor must draw the annuity to get back every premium paid
  monthsOfAnnuityToRecoverPremiums: number;
  // Lump sum that would fund the same income for the spouse's remaining life
  // if the member died at retirement
  lumpSumEquivalentAtRetirement: number;
  lowBaseNotice: boolean;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export function clampBase(baseAmount: number, grossRetiredPay: number) {
  if (grossRetiredPay <= 0) return 0;
  return Math.min(Math.max(baseAmount, Math.min(SBP_MIN_BASE, grossRetiredPay)), grossRetiredPay);
}

/** Years of premiums before coverage is paid up: 30 years, or until age 70 if later. */
export function yearsUntilPaidUp(memberAgeAtRetirement: number) {
  return Math.max(PAID_UP_PAYMENTS / 12, PAID_UP_AGE - memberAgeAtRetirement);
}

/** Present value of a monthly income paid for a number of years at a real annual return. */
export function presentValueOfIncome(monthly: number, years: number, realReturn: number) {
  if (years <= 0 || monthly <= 0) return 0;
  const months = Math.round(years * 12);
  const r = Math.pow(1 + realReturn, 1 / 12) - 1;
  if (Math.abs(r) < 1e-9) return monthly * months;
  return (monthly * (1 - Math.pow(1 + r, -months))) / r;
}

export function sbpScenario(label: string, inputs: SbpInputs): SbpScenario {
  const baseAmount = clampBase(inputs.baseAmount, inputs.grossRetiredPay);
  const monthlyPremium = round2(baseAmount * SBP_PREMIUM_RATE);
  const monthlyAnnuity = round2(baseAmount * SBP_ANNUITY_RATE);
  const years = yearsUntilPaidUp(inputs.memberAgeAtRetirement);
  const totalPremiums = round2(monthlyPremium * years * 12);
  const survivorYears = Math.max(0, (inputs.spouseLifeExpectancy ?? 90) - inputs.spouseAge);

  return {
    label,
    baseAmount: round2(baseAmount),
    monthlyPremium,
    monthlyPremiumAfterTax: round2(monthlyPremium * (1 - inputs.marginalTaxRate)),
    monthlyAnnuity,
    yearsOfPremiums: years,
    totalPremiums,
    monthsOfAnnuityToRecoverPremiums: monthlyAnnuity > 0 ? Math.ceil(totalPremiums / monthlyAnnuity) : 0,
    lumpSumEquivalentAtRetirement: Math.round(presentValueOfIncome(monthlyAnnuity, survivorYears, inputs.realReturn ?? 0.02)),
    lowBaseNotice: baseAmount > 0 && baseAmount < LOW_BASE_NOTICE,
  };
}

export type TermQuote = {
  coverage: number; // death benefit
  monthlyPremium: number;
  termYears: number;
};

export type TermComparison = {
  coverage: number;
  monthlyPremium: number;
  termYears: number;
  // Monthly income the death benefit could pay the spouse for life if the
  // member died at retirement, at the assumed real return
  incomeIfDeathAtRetirement: number;
  // Same, if the member died in the final year of the term
  incomeIfDeathAtTermEnd: number;
  spouseAgeWhenTermEnds: number;
  // After the term ends there is no benefit at all
  coverageAfterTerm: 0;
};

function monthlyIncomeFromLumpSum(lumpSum: number, years: number, realReturn: number) {
  if (years <= 0 || lumpSum <= 0) return 0;
  const perDollar = presentValueOfIncome(1, years, realReturn);
  return perDollar > 0 ? round2(lumpSum / perDollar) : 0;
}

export function termComparison(quote: TermQuote, inputs: SbpInputs): TermComparison {
  const lifeExpectancy = inputs.spouseLifeExpectancy ?? 90;
  const realReturn = inputs.realReturn ?? 0.02;
  const spouseAgeWhenTermEnds = inputs.spouseAge + quote.termYears;
  return {
    coverage: quote.coverage,
    monthlyPremium: quote.monthlyPremium,
    termYears: quote.termYears,
    incomeIfDeathAtRetirement: monthlyIncomeFromLumpSum(quote.coverage, lifeExpectancy - inputs.spouseAge, realReturn),
    incomeIfDeathAtTermEnd: monthlyIncomeFromLumpSum(quote.coverage, lifeExpectancy - spouseAgeWhenTermEnds, realReturn),
    spouseAgeWhenTermEnds,
    coverageAfterTerm: 0,
  };
}

export type SbpAnalysis = {
  full: SbpScenario;
  reduced: SbpScenario | null;
  none: { monthlyPremium: 0; monthlyAnnuity: 0; retiredPayLostAtDeath: number };
  term: TermComparison | null;
  assumptions: { spouseLifeExpectancy: number; realReturn: number; marginalTaxRate: number };
  notModeled: string[];
};

export function analyzeSbp(inputs: SbpInputs, options: { reducedBase?: number | null; termQuote?: TermQuote | null } = {}): SbpAnalysis {
  const full = sbpScenario("Full SBP", { ...inputs, baseAmount: inputs.grossRetiredPay });
  const reducedBase = options.reducedBase ?? null;
  const reduced =
    reducedBase && reducedBase < inputs.grossRetiredPay ? sbpScenario("Reduced SBP", { ...inputs, baseAmount: reducedBase }) : null;

  return {
    full,
    reduced,
    none: { monthlyPremium: 0, monthlyAnnuity: 0, retiredPayLostAtDeath: round2(inputs.grossRetiredPay) },
    term: options.termQuote ? termComparison(options.termQuote, inputs) : null,
    assumptions: {
      spouseLifeExpectancy: inputs.spouseLifeExpectancy ?? 90,
      realReturn: inputs.realReturn ?? 0.02,
      marginalTaxRate: inputs.marginalTaxRate,
    },
    notModeled: [
      "Reserve Component SBP, child-only, former-spouse, and insurable-interest coverage price differently and are not calculated here.",
      "At small base amounts DFAS may apply an alternate formula that lowers the premium. The figure shown is the standard 6.5 percent.",
      "Federal and state tax on the survivor annuity, and any Social Security or VA survivor benefits, are not included.",
    ],
  };
}
