// Military retired pay and its interaction with VA disability compensation.
//
// Retired pay (10 U.S.C. 1407, 1409, 12733, 12739):
//   High-3:  2.5 percent x years of service x High-36 average basic pay
//   BRS:     2.0 percent x years of service x High-36 average basic pay
//   Reserve: years of service = retirement points / 360
//   The result is rounded down to the whole dollar (10 U.S.C. 1412).
//
// Receiving VA compensation too (38 U.S.C. 5304, 5305; 10 U.S.C. 1414, 1413a):
//   By default a retiree waives retired pay dollar for dollar to receive VA
//   compensation, which is tax free.
//   CRDP: with a combined rating of 50 percent or more and a regular (20-year)
//         retirement, the waiver is restored. Both are paid in full.
//   CRSC: for combat-related disabilities, a tax-free payment replaces the
//         waived retired pay, up to the VA rate for the combat-related rating.
//   A retiree eligible for both receives whichever is larger, not both.
//
// Not modeled: Chapter 61 medical retirement, REDUX, Final Pay, the BRS lump
// sum, Special Monthly Compensation, and state-specific tax rules.

import { monthlyCompensation, type Dependents } from "@/lib/va/compensation";
import { SBP_PREMIUM_RATE, clampBase } from "@/lib/sbp/math";
import { federalTaxOnAddedIncome, type FilingStatus } from "@/lib/retirement/tax";

export type RetirementPlan = "high3" | "brs";

export const PLAN_MULTIPLIER: Record<RetirementPlan, number> = { high3: 0.025, brs: 0.02 };
export const CRDP_MINIMUM_RATING = 50;

export function grossRetiredPay(high3Average: number, yearsOfService: number, plan: RetirementPlan): number {
  if (high3Average <= 0 || yearsOfService <= 0) return 0;
  return Math.floor(high3Average * yearsOfService * PLAN_MULTIPLIER[plan]);
}

// DoD FMR Volume 7B, Chapter 3, 2.5.2: points divided by 360, carried to
// three decimal places and rounded to two (4,735 points = 13.152 = 13.15).
export function reserveYearsOfService(points: number) {
  const carried = Math.floor((Math.max(0, points) / 360) * 1000) / 1000;
  return Math.round(carried * 100) / 100;
}

export type IncomeInputs = {
  high3Average: number;
  yearsOfService: number; // for pay purposes; reserve = points / 360
  plan: RetirementPlan;
  // A regular (20 qualifying year) retirement. Defaults to yearsOfService >= 20.
  // Reserve retirees qualify on good years, though their pay uses points / 360.
  regularRetirement?: boolean;
  // VA
  vaRating: number; // combined rating, 0 to 100
  dependents: Dependents;
  vaIncreasePct?: number; // projected COLA on the published VA table
  combatRelatedRating?: number; // portion of the rating VA and the service treat as combat related
  // SBP
  sbpBaseAmount?: number; // 0 or undefined = no SBP
  // Taxes
  filingStatus: FilingStatus;
  otherAnnualIncome?: number; // household taxable income apart from retired pay
  stateTaxRatePct?: number; // effective state rate on taxable retired pay
};

export type IncomeResult = {
  grossRetiredPay: number;
  multiplierPct: number;
  vaCompensation: number;
  // Retired pay given up to receive VA compensation
  vaWaiver: number;
  concurrentReceipt: "CRDP" | "CRSC" | "none";
  crscPayment: number;
  retiredPayAfterWaiver: number;
  sbpPremium: number;
  taxableRetiredPay: number;
  federalTax: number;
  stateTax: number;
  // Monthly money actually received
  netRetiredPay: number;
  taxFreeIncome: number;
  totalNetMonthly: number;
  totalNetAnnual: number;
  notes: string[];
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export function calculateIncome(inputs: IncomeInputs): IncomeResult {
  const notes: string[] = [];
  const gross = grossRetiredPay(inputs.high3Average, inputs.yearsOfService, inputs.plan);
  const va = inputs.vaRating >= 10 ? monthlyCompensation(inputs.vaRating, inputs.dependents, inputs.vaIncreasePct ?? 0) : 0;

  let vaWaiver = 0;
  let crscPayment = 0;
  let concurrentReceipt: IncomeResult["concurrentReceipt"] = "none";

  if (va > 0 && gross > 0) {
    const fullWaiver = Math.min(va, gross);
    const regular = inputs.regularRetirement ?? inputs.yearsOfService >= 20;
    const crdpEligible = inputs.vaRating >= CRDP_MINIMUM_RATING && regular;

    const combatRating = Math.min(inputs.combatRelatedRating ?? 0, inputs.vaRating);
    const crscAvailable =
      combatRating >= 10 ? Math.min(monthlyCompensation(combatRating, inputs.dependents, inputs.vaIncreasePct ?? 0), fullWaiver) : 0;

    // CRDP restores the whole waiver as taxable retired pay. CRSC restores up
    // to the combat-related amount, tax free. Compare what each is worth.
    if (crdpEligible) {
      concurrentReceipt = "CRDP";
      vaWaiver = 0;
      notes.push("Your rating is 50 percent or higher with 20 or more years of service, so you receive full retired pay and full VA compensation (CRDP).");
      if (crscAvailable > 0) {
        notes.push("You may also qualify for CRSC. You can receive only one, and DFAS lets you choose each year. CRSC is tax free, so compare both during open season.");
      }
    } else if (crscAvailable > 0) {
      concurrentReceipt = "CRSC";
      vaWaiver = fullWaiver;
      crscPayment = round2(crscAvailable);
      notes.push("CRSC is not automatic. You apply to your branch of service with evidence that the disability is combat related.");
    } else {
      vaWaiver = fullWaiver;
      notes.push(
        !regular
          ? "With under 20 years of service, VA compensation replaces retired pay dollar for dollar. That part of your income becomes tax free."
          : "Below a 50 percent rating, VA compensation replaces retired pay dollar for dollar. Your total stays about the same, but that part becomes tax free."
      );
    }
    if (va > gross) notes.push("Your VA compensation is larger than your retired pay, so all of your retired pay is waived.");
  }

  const afterWaiver = round2(gross - vaWaiver);

  const sbpBase = inputs.sbpBaseAmount && inputs.sbpBaseAmount > 0 ? clampBase(inputs.sbpBaseAmount, gross) : 0;
  const sbpPremium = round2(sbpBase * SBP_PREMIUM_RATE);
  if (sbpPremium > afterWaiver && sbpPremium > 0) {
    notes.push("Your SBP premium is larger than the retired pay left after the VA waiver. DFAS would bill you for the difference or take it from CRSC or VA pay.");
  }

  const taxable = Math.max(0, round2(afterWaiver - sbpPremium));
  const federalAnnual = federalTaxOnAddedIncome(taxable * 12, inputs.otherAnnualIncome ?? 0, inputs.filingStatus);
  const federal = round2(federalAnnual / 12);
  const state = round2(taxable * ((inputs.stateTaxRatePct ?? 0) / 100));

  const netRetired = round2(afterWaiver - sbpPremium - federal - state);
  const taxFree = round2(va + crscPayment);
  const total = round2(netRetired + taxFree);

  return {
    grossRetiredPay: gross,
    multiplierPct: round2(inputs.yearsOfService * PLAN_MULTIPLIER[inputs.plan] * 100),
    vaCompensation: va,
    vaWaiver: round2(vaWaiver),
    concurrentReceipt,
    crscPayment,
    retiredPayAfterWaiver: afterWaiver,
    sbpPremium,
    taxableRetiredPay: taxable,
    federalTax: federal,
    stateTax: state,
    netRetiredPay: netRetired,
    taxFreeIncome: taxFree,
    totalNetMonthly: total,
    totalNetAnnual: round2(total * 12),
    notes,
  };
}

export type ProjectionRow = { year: number; grossRetiredPay: number; vaCompensation: number; combinedBeforeTax: number };

/**
 * Gross retired pay and VA compensation in future years. Both rise with the
 * same Consumer Price Index adjustment each December.
 */
export function projectIncome(result: IncomeResult, colaPct: number, years: number[]): ProjectionRow[] {
  return years.map((year) => {
    const factor = Math.pow(1 + colaPct / 100, year);
    const gross = Math.floor(result.grossRetiredPay * factor);
    const va = round2(result.vaCompensation * factor);
    const waiver = result.concurrentReceipt === "CRDP" ? 0 : Math.min(va, gross);
    const crsc = round2(result.crscPayment * factor);
    return { year, grossRetiredPay: gross, vaCompensation: va, combinedBeforeTax: round2(gross - waiver + va + crsc) };
  });
}
