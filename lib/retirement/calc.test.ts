import { describe, expect, it } from "vitest";
import { calculateIncome, grossRetiredPay, projectIncome, reserveYearsOfService, type IncomeInputs } from "@/lib/retirement/calc";
import { basicPay, estimatedYears, estimateHigh3, monthlyPay, PAY_TABLE_YEARS, payInYear } from "@/lib/retirement/pay";
import { federalTax, federalTaxOnAddedIncome } from "@/lib/retirement/tax";
import { monthlyCompensation, NO_DEPENDENTS } from "@/lib/va/compensation";

describe("basic pay table (2026)", () => {
  it("returns the step reached, not the next one", () => {
    expect(basicPay("E-7", 20)).toBe(6245.7);
    expect(basicPay("E-7", 21.9)).toBe(6245.7);
    expect(basicPay("E-7", 22)).toBe(6475.2);
    expect(basicPay("O-5", 20)).toBe(12032.7);
    expect(basicPay("W-3", 20)).toBe(8476.5);
  });

  it("holds at the top step and handles grades that start late", () => {
    expect(basicPay("E-7", 35)).toBe(7067.4);
    expect(basicPay("W-5", 20)).toBe(10169.7);
    expect(basicPay("O-3E", 4)).toBe(7382.7);
    expect(basicPay("X-1", 10)).toBeNull();
  });

  it("carries the corrected O-8 over 18 figure and the general officer cap", () => {
    expect(basicPay("O-8", 18)).toBe(17911.8);
    expect(basicPay("O-10", 30)).toBe(18999.9);
  });

  it("holds O-6 and below to Executive Schedule Level V ($184,900 a year in 2026)", () => {
    // Uncapped, O-6 over 30 would be 2025's 14,925.00 plus 3.8 percent: 15,492.15.
    expect(basicPay("O-6", 26)).toBe(15188.7);
    expect(basicPay("O-6", 30)).toBe(15408.3);
    expect(basicPay("O-6", 38)).toBe(15408.3);
  });

  it("carries the cells two of three published copies agree on, to the cent", () => {
    expect(basicPay("W-3", 4)).toBe(5736.9);
    expect(basicPay("O-5", 14)).toBe(10715.1);
    expect(monthlyPay("W-3", 4, 2025, 0)).toBe(5526.9);
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

describe("one official table per year in the High-3 window", () => {
  it("holds the 2023, 2024, 2025, and 2026 tables", () => {
    expect(PAY_TABLE_YEARS).toEqual([2023, 2024, 2025, 2026]);
  });

  it("reads each year's own table, not the newest one with raises backed out", () => {
    expect(monthlyPay("E-7", 20, 2023, 3.6)).toBe(5473.2);
    expect(monthlyPay("E-7", 20, 2024, 3.6)).toBe(5757.9);
    expect(monthlyPay("E-7", 20, 2025, 3.6)).toBe(6017.1);
    expect(monthlyPay("E-7", 20, 2026, 3.6)).toBe(6245.7);
    // Capped general officer pay does not move with the raises, so backing them out was wrong.
    expect(monthlyPay("O-9", 24, 2024, 3.6)).toBe(18491.7);
  });

  it("projects a year with no table yet from the newest one and the assumed raise", () => {
    expect(monthlyPay("E-7", 20, 2027, 4)).toBeCloseTo(6245.7 * 1.04, 6);
  });

  it("averages the real cells over the 36 months before a January 31, 2027 retirement", () => {
    // Months Jan 2024 to Dec 2026, 12 on each table. At 30 years on the retirement date the
    // whole window sits on the over-26 step (27 to 30 years), so the average is of three cells.
    expect(estimatedYears(new Date(2027, 0, 31))).toEqual([]);
    const high3 = estimateHigh3({ grade: "W-4", yearsOfService: 30, retirementDate: new Date(2027, 0, 31) })!;
    const expected = (12 * monthlyPay("W-4", 26, 2024, 0)! + 12 * monthlyPay("W-4", 26, 2025, 0)! + 12 * monthlyPay("W-4", 26, 2026, 0)!) / 36;
    expect(high3).toBeCloseTo(expected, 1);
  });

  it("pays each month at the longevity step reached that month (E-7 retiring at 20 years 3 months)", () => {
    // Retirement date February 1, 2027, service entered as 20 years and 3 months.
    // Jan 2027: over 20, no 2027 table yet (2026 cell plus the assumed 3.6%)
    // Nov to Dec 2026: over 20       Jan to Oct 2026: over 18
    // all of 2025: over 18           Nov to Dec 2024: over 18
    // Feb to Oct 2024: over 16
    const high3 = estimateHigh3({ grade: "E-7", yearsOfService: 20 + 3 / 12, retirementDate: new Date(2027, 1, 1), assumedFutureRaisePct: 3.6 })!;
    const expected = (6245.7 * 1.036 + 2 * 6245.7 + 10 * 6177.3 + 12 * 5951.1 + 2 * 5694.9 + 9 * 5532.3) / 36;
    expect(high3).toBeCloseTo(expected, 1);
  });

  it("pays the month a step is reached at that step, even when months make an awkward fraction", () => {
    // W-5 at 32 years 2 months, retirement date January 1, 2027. The 26th month back is when
    // they reached 30 years; 32 + 2/12 - 26/12 is 29.999... in floating point.
    // Nov 2024 to Dec 2026: over 30 (26 months)   Jan to Oct 2024: over 26 (10 months)
    const high3 = estimateHigh3({ grade: "W-5", yearsOfService: 32 + 2 / 12, retirementDate: new Date(2027, 0, 1) })!;
    const expected = (12 * 12070.8 + 12 * 11628.9 + 2 * 11128.2 + 10 * 10597.2) / 36;
    expect(high3).toBeCloseTo(expected, 1);
  });

  it("prices every month at one table for a High-3 in today's dollars (Reserve E-7, pay starting 2044)", () => {
    // 22 years 6 months on the start date, February 2044. Same steps as any start:
    // 6 months over 22, 24 over 20, 6 over 18, all at the 2026 table, no assumed raise.
    const inputs = { grade: "E-7", yearsOfService: 22.5, retirementDate: new Date(2044, 1, 1), assumedFutureRaisePct: 3.6 };
    const today = estimateHigh3({ ...inputs, payTableYear: 2026 })!;
    expect(today).toBeCloseTo((6 * 6475.2 + 24 * 6245.7 + 6 * 6177.3) / 36, 2);
    expect(today).toBe(6272.55);
    expect(estimateHigh3(inputs)!).toBeGreaterThan(today * 1.036 ** 14);
  });

  it("says which years in the window are estimated, counting back from the retirement date", () => {
    // Retirement date January 1, 2027 (last day of service December 31): Jan 2024 to Dec 2026, all official.
    expect(estimatedYears(new Date(2027, 0, 1))).toEqual([]);
    // February 1, 2027 (last day January 31): January 2027 is in the window and has no table yet.
    expect(estimatedYears(new Date(2027, 1, 1))).toEqual([2027]);
    // December 1, 2026: the window reaches back to December 2023, which has its own table.
    expect(estimatedYears(new Date(2026, 11, 1))).toEqual([]);
    // Any 2026 retirement date is covered: January 1, 2026 reaches back to January 2023.
    expect(estimatedYears(new Date(2026, 0, 1))).toEqual([]);
    // December 1, 2025 would reach into 2022, before the earliest table.
    expect(estimatedYears(new Date(2025, 11, 1))).toEqual([2022]);
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

  it("rounds reserve years the way DFAS does: three places carried, two kept", () => {
    // The DoD FMR's own example: 4,735 points / 360 = 13.152, so 13.15 years.
    expect(reserveYearsOfService(4735)).toBe(13.15);
    // 5,000 / 360 = 13.888..., carried to 13.888, kept as 13.89.
    expect(reserveYearsOfService(5000)).toBe(13.89);
    expect(reserveYearsOfService(-10)).toBe(0);
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
