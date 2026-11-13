import { describe, expect, it } from "vitest";
import { analyzeSbp, clampBase, presentValueOfIncome, sbpScenario, yearsUntilPaidUp } from "@/lib/sbp/math";

const base = {
  grossRetiredPay: 4000,
  baseAmount: 4000,
  memberAgeAtRetirement: 42,
  spouseAge: 40,
  marginalTaxRate: 0.22,
};

describe("SBP spouse coverage", () => {
  it("charges 6.5 percent of the base and pays 55 percent of it", () => {
    const s = sbpScenario("Full", base);
    expect(s.monthlyPremium).toBe(260);
    expect(s.monthlyAnnuity).toBe(2200);
  });

  it("shows the after-tax cost of a pre-tax premium", () => {
    expect(sbpScenario("Full", base).monthlyPremiumAfterTax).toBe(202.8);
  });

  it("is paid up after 30 years or at age 70, whichever is later", () => {
    expect(yearsUntilPaidUp(38)).toBe(32); // age 70 governs
    expect(yearsUntilPaidUp(40)).toBe(30);
    expect(yearsUntilPaidUp(55)).toBe(30); // 360 payments governs, paid up at 85
  });

  it("totals premiums to the paid-up date and finds the recovery point", () => {
    const s = sbpScenario("Full", base); // 30 years
    expect(s.totalPremiums).toBe(260 * 360);
    expect(s.monthsOfAnnuityToRecoverPremiums).toBe(Math.ceil((260 * 360) / 2200)); // 43 months
  });

  it("keeps the base between the minimum and full retired pay", () => {
    expect(clampBase(9000, 4000)).toBe(4000);
    expect(clampBase(100, 4000)).toBe(300);
    expect(clampBase(100, 250)).toBe(250);
  });

  it("flags small base amounts where DFAS may charge less", () => {
    expect(sbpScenario("Reduced", { ...base, baseAmount: 1500 }).lowBaseNotice).toBe(true);
    expect(sbpScenario("Full", base).lowBaseNotice).toBe(false);
  });
});

describe("presentValueOfIncome", () => {
  it("is a plain sum at zero real return", () => {
    expect(presentValueOfIncome(1000, 10, 0)).toBe(120000);
  });

  it("is smaller than the plain sum when money earns a real return", () => {
    const pv = presentValueOfIncome(1000, 10, 0.02);
    expect(pv).toBeLessThan(120000);
    expect(pv).toBeGreaterThan(105000);
  });

  it("is zero for no income or no time", () => {
    expect(presentValueOfIncome(0, 10, 0.02)).toBe(0);
    expect(presentValueOfIncome(1000, 0, 0.02)).toBe(0);
  });
});

describe("analyzeSbp", () => {
  it("builds full, reduced, none, and a term comparison", () => {
    const a = analyzeSbp(base, { reducedBase: 2000, termQuote: { coverage: 500000, monthlyPremium: 45, termYears: 20 } });
    expect(a.full.baseAmount).toBe(4000);
    expect(a.reduced?.monthlyAnnuity).toBe(1100);
    expect(a.none.retiredPayLostAtDeath).toBe(4000);
    expect(a.term?.spouseAgeWhenTermEnds).toBe(60);
    // The same lump sum buys more monthly income over a shorter remaining life
    expect(a.term!.incomeIfDeathAtTermEnd).toBeGreaterThan(a.term!.incomeIfDeathAtRetirement);
  });

  it("drops a reduced option that is not actually reduced", () => {
    expect(analyzeSbp(base, { reducedBase: 4000 }).reduced).toBeNull();
    expect(analyzeSbp(base).term).toBeNull();
  });
});
