import { sbpPayload, usd, type SbpAssessment, type SbpForm, type SbpPayload } from "@/lib/sbp/inputs";
import type { SbpAnalysis } from "@/lib/sbp/math";

// The SBP Decision Advisor chat (docs/CHAT_TOOLS_PLAN.md, Phase 5): the quick
// questions the page asks (D19), what-ifs the page recalculates at once, and
// what a follow-up sends the model. The figures always come from code.

type Option = { value: string; label: string };
export type QuickQuestion = { field: keyof SbpForm; ask: string; options?: Option[]; placeholder?: string };

const HEALTH: Option[] = [
  { value: "good", label: "Good" },
  { value: "some_issues", label: "Some issues" },
  { value: "serious_issues", label: "Serious issues" },
];

// Mostly one tap each; the two amounts are typed, and every one can be skipped.
export const SBP_QUICK_QUESTIONS: QuickQuestion[] = [
  {
    field: "retirementType",
    ask: "What kind of retirement is it?",
    options: [
      { value: "active", label: "Active duty (20+ years)" },
      { value: "reserve", label: "Reserve or Guard" },
      { value: "medical", label: "Medical retirement" },
    ],
  },
  {
    field: "relies",
    ask: "If you died first, how much would your spouse rely on your retired pay?",
    options: [
      { value: "fully", label: "It would be most of the household income" },
      { value: "partly", label: "It matters, but there is other income" },
      { value: "no", label: "My spouse would be fine without it" },
    ],
  },
  { field: "memberHealth", ask: "How is your health?", options: HEALTH },
  { field: "spouseHealth", ask: "And your spouse's health?", options: HEALTH },
  {
    field: "incomePreference",
    ask: "If you die first, would your spouse rather have:",
    options: [
      { value: "guaranteed_monthly", label: "A guaranteed monthly check" },
      { value: "lump_sum", label: "A lump sum to manage" },
      { value: "unsure", label: "Not sure" },
    ],
  },
  {
    field: "lumpSumComfort",
    ask: "How would your spouse do managing a large lump sum?",
    options: [
      { value: "confident", label: "They would handle it well" },
      { value: "somewhat", label: "Probably, with help" },
      { value: "not_confident", label: "That would be hard" },
    ],
  },
  {
    field: "inflation",
    ask: "How much does protection from inflation matter?",
    options: [
      { value: "very", label: "Very important" },
      { value: "somewhat", label: "Somewhat important" },
      { value: "not", label: "Not a concern" },
    ],
  },
  {
    field: "horizon",
    ask: "Protection is needed for:",
    options: [
      { value: "spouse_lifetime", label: "My spouse's whole life" },
      { value: "early_years", label: "Mostly the early retirement years" },
      { value: "unsure", label: "Not sure" },
    ],
  },
  { field: "assets", ask: "About how much do you have in savings and investments (TSP, IRAs, brokerage, cash)?", placeholder: "e.g. 250,000" },
  { field: "lifeInsurance", ask: "How much life insurance do you already have in force?", placeholder: "e.g. 500,000" },
];

/** A typed amount, or null when it is not one ("about 250k" is 250000). */
export function parseAmount(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/[$,\s]/g, "");
  const m = /^(\d+(?:\.\d+)?)(k|m)?$/.exec(t);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] === "k" ? 1_000 : m[2] === "m" ? 1_000_000 : 1);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

// A what-if: the changed values only. The model may propose one; the page
// applies it to the form and recalculates in the browser.
export type SbpWhatIf = {
  reducedBaseAmount?: number;
  termQuote?: { coverage: number; monthlyPremium: number; termYears: number };
  grossRetiredPay?: number;
  memberAgeAtRetirement?: number;
  spouseAge?: number;
};

/** The form with a what-if applied. */
export function applyWhatIf(form: SbpForm, w: SbpWhatIf): SbpForm {
  return {
    ...form,
    ...(w.reducedBaseAmount !== undefined ? { reducedBase: String(w.reducedBaseAmount) } : {}),
    ...(w.termQuote ? { termCoverage: String(w.termQuote.coverage), termPremium: String(w.termQuote.monthlyPremium), termYears: String(w.termQuote.termYears) } : {}),
    ...(w.grossRetiredPay !== undefined ? { retiredPay: String(w.grossRetiredPay) } : {}),
    ...(w.memberAgeAtRetirement !== undefined ? { memberAge: String(w.memberAgeAtRetirement) } : {}),
    ...(w.spouseAge !== undefined ? { spouseAge: String(w.spouseAge) } : {}),
  };
}

/** A what-if in words, for its button and its card. */
export function whatIfLabel(w: SbpWhatIf): string {
  const parts: string[] = [];
  if (w.reducedBaseAmount !== undefined) parts.push(`covered amount ${usd(w.reducedBaseAmount)} a month`);
  if (w.termQuote) parts.push(`a ${usd(w.termQuote.coverage)}, ${w.termQuote.termYears}-year term quote at ${usd(w.termQuote.monthlyPremium, true)} a month`);
  if (w.grossRetiredPay !== undefined) parts.push(`retired pay ${usd(w.grossRetiredPay)} a month`);
  if (w.memberAgeAtRetirement !== undefined) parts.push(`your age ${w.memberAgeAtRetirement}`);
  if (w.spouseAge !== undefined) parts.push(`spouse's age ${w.spouseAge}`);
  return parts.join("; ");
}

/** What a follow-up sends: the request without the free-text notes. */
export function sbpIntake(form: SbpForm): Omit<SbpPayload, "notes"> {
  const { notes: _notes, ...rest } = sbpPayload(form);
  void _notes;
  return rest;
}

export type SbpChatContext = {
  intake: Omit<SbpPayload, "notes"> | null;
  assessment: SbpAssessment | null;
  whatIf: Omit<SbpPayload, "notes"> | null;
  whatIfLabel: string | null;
};

export const EMPTY_SBP_CONTEXT: SbpChatContext = { intake: null, assessment: null, whatIf: null, whatIfLabel: null };

/** Three questions to tap after a comparison: the model's own first, then the page's list. */
export function sbpSuggestions(args: { fromModel: string[]; married: boolean; asked: string[] }): string[] {
  const pool = [
    ...args.fromModel,
    "Which option fits my family best?",
    "What if I cover less than my full retired pay?",
    "How does SBP compare with term life for us?",
    ...(args.married ? ["What does my spouse need to sign?"] : []),
    "Who can help me with this for free?",
  ];
  const seen = new Set(args.asked.map((q) => q.trim().toLowerCase()));
  const out: string[] = [];
  for (const q of pool) {
    const key = q.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(q);
    if (out.length === 3) break;
  }
  return out;
}

/** The figures as lines of text, for the model and the Word file. */
export function figureLines(a: SbpAnalysis): string[] {
  const scenario = (s: SbpAnalysis["full"]) =>
    `${s.label}: covers ${usd(s.baseAmount)} a month of retired pay; premium ${usd(s.monthlyPremium, true)} a month (${usd(s.monthlyPremiumAfterTax, true)} after tax savings); spouse receives ${usd(s.monthlyAnnuity)} a month for life; premiums end after ${s.yearsOfPremiums} years, ${usd(s.totalPremiums)} in all; the annuity repays all premiums in ${s.monthsOfAnnuityToRecoverPremiums} months; a lump sum of ${usd(s.lumpSumEquivalentAtRetirement)} would be needed to match it.`;
  const lines = [scenario(a.full)];
  if (a.reduced) lines.push(scenario(a.reduced));
  lines.push(`No SBP: no premium; ${usd(a.none.retiredPayLostAtDeath)} a month of retired pay stops at the member's death.`);
  if (a.term) {
    lines.push(
      `Term life quote: ${usd(a.term.coverage)} of coverage at ${usd(a.term.monthlyPremium, true)} a month for ${a.term.termYears} years; it could fund ${usd(a.term.incomeIfDeathAtRetirement)} a month if the member dies at retirement, ${usd(a.term.incomeIfDeathAtTermEnd)} a month if in year ${a.term.termYears}, and nothing after the term ends (spouse age ${a.term.spouseAgeWhenTermEnds}).`,
    );
  }
  lines.push(`Assumptions: spouse lives to ${a.assumptions.spouseLifeExpectancy}; an invested lump sum earns ${(a.assumptions.realReturn * 100).toFixed(0)} percent a year above inflation; tax bracket ${(a.assumptions.marginalTaxRate * 100).toFixed(0)} percent.`);
  return lines;
}
