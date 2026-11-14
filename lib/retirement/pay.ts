// Basic pay lookups and the High-3 (High-36) average.
// Data: data/pay/basic-pay-2026.json, built and cross-checked by
// scripts/build-pay-data.mjs.

import table from "@/data/pay/basic-pay-2026.json";

const grades = (table as unknown as { grades: Record<string, Record<string, number>> }).grades;

export const PAY_TABLE_YEAR = table.year;
export const PAY_GRADES = Object.keys(grades);

// Across-the-board basic pay raises, effective 1 January of each year.
// 2025 also carried a targeted April raise for E-1 to E-4, which does not
// affect anyone retiring from those grades after 20 years.
export const PAY_RAISES: Record<number, number> = { 2023: 4.6, 2024: 5.2, 2025: 4.5, 2026: 3.8 };

/** Monthly basic pay in the table year for a grade and completed years of service. */
export function basicPay(grade: string, yearsOfService: number): number | null {
  const row = grades[grade];
  if (!row) return null;
  const steps = Object.keys(row)
    .map(Number)
    .sort((a, b) => a - b);
  const reached = steps.filter((step) => step <= yearsOfService);
  // Grades that start partway through the table (O-1E, W-5, E-9) pay their
  // first listed step to anyone below it.
  const step = reached.length ? reached[reached.length - 1] : steps[0];
  return row[String(step)];
}

/**
 * Converts a table-year amount to what the same cell paid (or is assumed to
 * pay) in another calendar year, using the across-the-board raises.
 */
export function payInYear(amount: number, year: number, assumedFutureRaisePct: number): number {
  let value = amount;
  if (year < PAY_TABLE_YEAR) {
    for (let y = PAY_TABLE_YEAR; y > year; y -= 1) value /= 1 + (PAY_RAISES[y] ?? 3) / 100;
  } else {
    for (let y = PAY_TABLE_YEAR + 1; y <= year; y += 1) value *= 1 + assumedFutureRaisePct / 100;
  }
  return value;
}

export type High3Inputs = {
  grade: string;
  // Years of service on the retirement date (may include a fraction)
  yearsOfService: number;
  retirementDate: Date;
  // Months held in the retirement grade. Fewer than 36 means part of the
  // High-3 window was at the previous grade.
  monthsInGrade?: number;
  previousGrade?: string | null;
  assumedFutureRaisePct?: number;
};

/**
 * Average monthly basic pay over the 36 months before retirement, using the
 * pay each month actually carried: the grade held that month, the years of
 * service reached by then, and that calendar year's pay table.
 */
export function estimateHigh3(inputs: High3Inputs): number | null {
  const monthsInGrade = inputs.monthsInGrade ?? 36;
  const raise = inputs.assumedFutureRaisePct ?? 3.6;
  let total = 0;

  for (let monthsBack = 1; monthsBack <= 36; monthsBack += 1) {
    const date = new Date(inputs.retirementDate.getFullYear(), inputs.retirementDate.getMonth() - monthsBack, 1);
    const grade = monthsBack <= monthsInGrade || !inputs.previousGrade ? inputs.grade : inputs.previousGrade;
    const yos = Math.max(0, inputs.yearsOfService - monthsBack / 12);
    const pay = basicPay(grade, yos);
    if (pay === null) return null;
    total += payInYear(pay, date.getFullYear(), raise);
  }

  return Math.round((total / 36) * 100) / 100;
}
