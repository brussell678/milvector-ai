import { describe, expect, it } from "vitest";
import { calculateIncome, grossRetiredPay, projectIncome, reserveYearsOfService, type IncomeInputs } from "@/lib/retirement/calc";
import { basicPay, estimateHigh3, payInYear } from "@/lib/retirement/pay";
import { federalTax, federalTaxOnAddedIncome } from "@/lib/retirement/tax";
import { monthlyCompensation, NO_DEPENDENTS } from "@/lib/va/compensation";

describe("basic pay table (2026)", () => {
  it("returns the step reached, not the next one", () => {
    expect(basicPay("E-7", 20)).toBe(6245);
    expect(basicPay("E-7", 21.9)).toBe(6245);
    expect(basicPay("E-7", 22)).toBe(6475);
    expect(basicPay("O-5", 20)).toBe(12033);
    expect(basicPay("W-3", 20)).toBe(8477);
  });

  it("holds at the top step and handles grades that start late", () => {
    expect(basicPay("E-7", 35)).toBe(7067);
    expect(basicPay("W-5", 20)).toBe(10170);
    expect(basicPay("O-3E", 4)).toBe(7383);
    expect(basicPay("X-1", 10)).toBeNull();
  });

  it("carries the corrected O-8 over 18 figure and the general officer cap", () => {
    expect(basicPay("O-8", 18)).toBe(17912);
    expect(basicPay("O-10", 30)).toBe(18999);
  });

  it("moves an amount between years by the across-the-board raises", () => {
    expect(payInYear(1038, 2025, 3.6)).toBeCloseTo(1000, 6); // 3.8 percent raise in 2026
    expect(payInYear(1000, 2027, 3.6)).toBeCloseTo(1036, 6);
    expect(payInYear(1000, 2026, 3.6)).toBe(1000);
  });
});

describe("estimateHigh3", () => {
  const retire = new Date(2026, 11, 31); // 36 months back spans 2024 to 2026

  it("lands below current pay, because earlier months were paid on older tables", () => {
    const high3 = estimateHigh3({ grade: "E-7", yearsOfService: 20, retirementDate: retire })!;
    expect(high3).toBeLessThan(basicPay("E-7", 20)!);
    expect(high3).toBeGreaterThan(basicPay("E-7", 20)! * 0.9);
  });

  it("is lower when part of the window was at the previous grade", () => {
    const full = estimateHigh3({ grade: "E-8", yearsOfService: 22, retirementDate: retire })!;
    const recent = estimateHigh3({ grade: "E-8", yearsOfService: 22, retirementDate: retire, monthsInGrade: 12, previousGrade: "E-7" })!;
    expect(recent).toBeLessThan(full);
  });

  it("returns null for an unknown grade", () => {
    expect(estimateHigh3({ grade: "Z-9", yearsOfService: 20, retirementDate: retire })).toBeNull();
  });
});

describe("grossRetiredPay", () => {
  it("is 50 percent of High-3 at 20 years under High-3 and 40 percent under BRS", () => {
    expect(grossRetiredPay(6000, 20, "high3")).toBe(3000);
    expect(grossRetiredPay(6000, 20, "brs")).toBe(2400);
  });

  it("credits months and rounds down to the whole dollar", () => {
    // 22 years 6 months at 2.5 percent is 56.25 percent
    expect(grossRetiredPay(7777, 22.5, "high3")).toBe(Math.floor(7777 * 0.5625));
    expect(grossRetiredPay(5001, 20, "high3")).toBe(2500);
  });

  it("has no 75 percent ceiling beyond 30 years", () => {
    expect(grossRetiredPay(10000, 32, "high3")).toBe(8000);
  });

  it("converts reserve points to years", () => {
    expect(reserveYearsOfService(3600)).toBe(10);
    expect(grossRetiredPay(6000, reserveYearsOfService(3600), "high3")).toBe(1500);
  });
});

describe("VA compensation table (2026 rates, effective 1 December 2025)", () => {
  it("matches VA's published amounts", () => {
    expect(monthlyCompensation(10)).toBe(180.42);
    expect(monthlyCompensation(20)).toBe(356.66);
    expect(monthlyCompensation(50)).toBe(1132.9);
    expect(monthlyCompensation(100)).toBe(3938.58);
    expect(monthlyCompensation(70, { ...NO_DEPENDENTS, spouse: true })).toBe(1961.45);
    expect(monthlyCompensation(100, { ...NO_DEPENDENTS, spouse: true, childrenUnder18: 1 })).toBe(4318.99);
  });

  it("adds each child after the first, and school-age children at their own rate", () => {
    // 70 percent, spouse, 3 children under 18: 2,074.45 + 2 x 76.00
    expect(monthlyCompensation(70, { ...NO_DEPENDENTS, spouse: true, childrenUnder18: 3 })).toBe(2226.45);
    // 70 percent, spouse, 1 under 18 and 1 in school: 2,074.45 + 246.00
    expect(monthlyCompensation(70, { ...NO_DEPENDENTS, spouse: true, childrenUnder18: 1, childrenInSchool: 1 })).toBe(2320.45);
  });

  it("ignores dependents below 30 percent and pays nothing at 0", () => {
    expect(monthlyCompensation(20, { ...NO_DEPENDENTS, spouse: true, childrenUnder18: 2 })).toBe(356.66);
    expect(monthlyCompensation(0)).toBe(0);
  });

  it("projects a cost-of-living increase", () => {
    expect(monthlyCompensation(100, NO_DEPENDENTS, 3.6)).toBe(4080.37);
  });
});

describe("federal tax (2026)", () => {
  it("applies the standard deduction first", () => {
    expect(federalTax(16100, "single")).toBe(0);
    expect(federalTax(32200, "married")).toBe(0);
  });

  it("walks the brackets", () => {
    // single, 66,100 gross: 50,000 taxable = 12,400 at 10% + 37,600 at 12%
    expect(federalTax(66100, "single")).toBe(1240 + 4512);
    // married, 132,200 gross: 100,000 taxable = 24,800 at 10% + 75,200 at 12%
    expect(federalTax(132200, "married")).toBe(2480 + 9024);
  });

  it("taxes added income at the rates other income has already reached", () => {
    // 36,000 of retired pay on top of a 132,200 salary: 800 at 12% then 35,200 at 22%
    expect(federalTaxOnAddedIncome(36000, 132200, "married")).toBe(96 + 7744);
    expect(federalTaxOnAddedIncome(0, 50000, "single")).toBe(0);
  });
});

describe("calculateIncome", () => {
  const base: IncomeInputs = {
    high3Average: 6000,
    yearsOfService: 20,
    plan: "high3",
    vaRating: 0,
    dependents: NO_DEPENDENTS,
    filingStatus: "single",
  };

  it("with no VA rating, pays retired pay less tax", () => {
    const r = calculateIncome(base);
    expect(r.grossRetiredPay).toBe(3000);
    expect(r.vaCompensation).toBe(0);
    expect(r.concurrentReceipt).toBe("none");
    expect(r.totalNetMonthly).toBe(r.grossRetiredPay - r.federalTax);
  });

  it("below 50 percent, VA pay replaces retired pay dollar for dollar", () => {
    const r = calculateIncome({ ...base, vaRating: 30 });
    expect(r.vaWaiver).toBe(552.47);
    expect(r.retiredPayAfterWaiver).toBe(2447.53);
    // Before tax the total is unchanged: the gain is that 552.47 is now tax free
    expect(r.retiredPayAfterWaiver + r.vaCompensation).toBe(3000);
    expect(r.taxFreeIncome).toBe(552.47);
  });

  it("at 50 percent with 20 years, both are paid in full (CRDP)", () => {
    const r = calculateIncome({ ...base, vaRating: 50 });
    expect(r.concurrentReceipt).toBe("CRDP");
    expect(r.vaWaiver).toBe(0);
    expect(r.retiredPayAfterWaiver + r.vaCompensation).toBe(3000 + 1132.9);
  });

  it("does not grant CRDP without a regular retirement", () => {
    const r = calculateIncome({ ...base, yearsOfService: 15, vaRating: 70 });
    expect(r.concurrentReceipt).toBe("none");
    expect(r.vaWaiver).toBe(1808.45);
  });

  it("grants CRDP to a reserve retiree with 20 good years even though pay uses points", () => {
    const r = calculateIncome({ ...base, yearsOfService: 10, regularRetirement: true, vaRating: 70 });
    expect(r.concurrentReceipt).toBe("CRDP");
  });

  it("pays CRSC up to the combat-related rate when CRDP does not apply", () => {
    const r = calculateIncome({ ...base, vaRating: 40, combatRelatedRating: 30 });
    expect(r.concurrentReceipt).toBe("CRSC");
    expect(r.vaWaiver).toBe(795.84);
    expect(r.crscPayment).toBe(552.47);
    expect(r.taxFreeIncome).toBe(795.84 + 552.47);
  });

  it("waives no more than the retired pay there is", () => {
    const r = calculateIncome({ ...base, high3Average: 1500, yearsOfService: 10, vaRating: 100 });
    expect(r.grossRetiredPay).toBe(375);
    expect(r.vaWaiver).toBe(375);
    expect(r.retiredPayAfterWaiver).toBe(0);
    expect(r.federalTax).toBe(0);
  });

  it("takes SBP out before tax", () => {
    const withSbp = calculateIncome({ ...base, sbpBaseAmount: 3000 });
    const without = calculateIncome(base);
    expect(withSbp.sbpPremium).toBe(195);
    expect(withSbp.taxableRetiredPay).toBe(2805);
    expect(withSbp.federalTax).toBeLessThan(without.federalTax);
  });

  it("applies a state rate to taxable retired pay only", () => {
    const r = calculateIncome({ ...base, vaRating: 50, stateTaxRatePct: 5 });
    expect(r.stateTax).toBe(150);
  });

  it("keeps the monthly lines adding up", () => {
    const r = calculateIncome({
      ...base,
      vaRating: 70,
      dependents: { ...NO_DEPENDENTS, spouse: true, childrenUnder18: 2 },
      sbpBaseAmount: 3000,
      filingStatus: "married",
      otherAnnualIncome: 90000,
      stateTaxRatePct: 4,
    });
    const rebuilt = r.grossRetiredPay - r.vaWaiver - r.sbpPremium - r.federalTax - r.stateTax + r.vaCompensation + r.crscPayment;
    expect(r.totalNetMonthly).toBeCloseTo(rebuilt, 2);
    expect(r.totalNetAnnual).toBeCloseTo(r.totalNetMonthly * 12, 2);
  });
});

describe("projectIncome", () => {
  it("grows both payments with the cost-of-living adjustment", () => {
    const r = calculateIncome({ high3Average: 6000, yearsOfService: 20, plan: "high3", vaRating: 50, dependents: NO_DEPENDENTS, filingStatus: "single" });
    const [now, later] = projectIncome(r, 2.5, [0, 10]);
    expect(now.grossRetiredPay).toBe(3000);
    expect(later.grossRetiredPay).toBe(Math.floor(3000 * Math.pow(1.025, 10)));
    expect(later.combinedBeforeTax).toBeGreaterThan(now.combinedBeforeTax);
  });
});
