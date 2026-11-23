import { analyzeSbp, type SbpAnalysis } from "@/lib/sbp/math";

// The SBP Decision Advisor's form, request, and figures, shared by the classic
// page, the chat, the tool route, and the follow-up endpoint
// (docs/CHAT_TOOLS_PLAN.md, Phase 5). One function turns the form into the
// request, and one turns a request into the figures, so the page, the chat,
// and the server always show the same numbers.

export type SbpForm = {
  maritalStatus: string;
  memberAge: string;
  spouseAge: string;
  childrenAges: string;
  formerSpouse: boolean;
  retirementType: string;
  relies: string;
  retiredPay: string;
  vaComp: string;
  spouseIncome: string;
  otherIncome: string;
  assets: string;
  lifeInsurance: string;
  expenses: string;
  taxRate: string;
  memberHealth: string;
  spouseHealth: string;
  tobacco: boolean;
  incomePreference: string;
  lumpSumComfort: string;
  inflation: string;
  horizon: string;
  reducedBase: string;
  termCoverage: string;
  termPremium: string;
  termYears: string;
  notes: string;
};

export const DEFAULT_SBP_FORM: SbpForm = {
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
};

/** A typed amount or age as a number: "$4,200" is 4200; blank is undefined. */
export const num = (value: string) => (value.trim() === "" ? undefined : Number(value.replace(/[$,\s]/g, "")));

/** The body /api/tools/sbp-advisor takes, from the form. */
export function sbpPayload(f: SbpForm) {
  const termComplete = num(f.termCoverage) && num(f.termPremium) && num(f.termYears);
  return {
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
}

export type SbpPayload = ReturnType<typeof sbpPayload>;

/** What the figures need from a request: enough of it to do the arithmetic. */
export type SbpFigureInput = {
  grossRetiredPay: number;
  memberAgeAtRetirement: number;
  spouseAge?: number | null;
  marginalTaxRatePct: number;
  reducedBaseAmount?: number | null;
  termQuote?: { coverage: number; monthlyPremium: number; termYears: number } | null;
};

/** The figures for a request: plain arithmetic, never the model (lib/sbp/math.ts). */
export function sbpAnalysisFor(input: SbpFigureInput): SbpAnalysis {
  return analyzeSbp(
    {
      grossRetiredPay: input.grossRetiredPay,
      baseAmount: input.grossRetiredPay,
      memberAgeAtRetirement: input.memberAgeAtRetirement,
      spouseAge: input.spouseAge ?? input.memberAgeAtRetirement,
      marginalTaxRate: input.marginalTaxRatePct / 100,
    },
    { reducedBase: input.reducedBaseAmount ?? null, termQuote: input.termQuote ?? null },
  );
}

/** The figures for a form, in the browser, when its essentials are filled; otherwise null. */
export function sbpAnalysisForForm(f: SbpForm): SbpAnalysis | null {
  const p = sbpPayload(f);
  if (!p.grossRetiredPay || p.grossRetiredPay < 100 || !p.memberAgeAtRetirement) return null;
  const term = p.termQuote && p.termQuote.coverage && p.termQuote.monthlyPremium && p.termQuote.termYears ? { coverage: p.termQuote.coverage, monthlyPremium: p.termQuote.monthlyPremium, termYears: p.termQuote.termYears } : null;
  return sbpAnalysisFor({ grossRetiredPay: p.grossRetiredPay, memberAgeAtRetirement: p.memberAgeAtRetirement, spouseAge: p.spouseAge, marginalTaxRatePct: p.marginalTaxRatePct, reducedBaseAmount: p.reducedBaseAmount, termQuote: term });
}

export type SbpAssessment = {
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

export type SbpResult = { analysis: SbpAnalysis; assessment: SbpAssessment | null; assessmentError?: string; runId?: string | null };

export const usd = (value: number, cents = false) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents ? 2 : 0, minimumFractionDigits: cents ? 2 : 0 });
