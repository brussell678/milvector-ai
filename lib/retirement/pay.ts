// Basic pay lookups and the High-3 (High-36) average.
// Data: data/pay/basic-pay-<year>.json, one DFAS table per calendar year to
// the cent, each cell confirmed by two of three published copies and held to
// the statutory ceiling (scripts/build-pay-data.mjs). A High-3 is the 36
// months before the retirement date, so a retirement dated in year Y reaches
// back into Y-3: every year in that window needs its own table, and a year
// without one is estimated and labeled as such.

import t2023 from "@/data/pay/basic-pay-2023.json";
import t2024 from "@/data/pay/basic-pay-2024.json";
import t2025 from "@/data/pay/basic-pay-2025.json";
import t2026 from "@/data/pay/basic-pay-2026.json";

type PayTable = { year: number; grades: Record<string, Record<string, number>> };

// Add each new year's file here when DFAS publishes it (the weekly data check
// reports when one is out).
const TABLES: PayTable[] = ([t2023, t2024, t2025, t2026] as unknown as PayTable[]).sort((a, b) => a.year - b.year);
const LATEST = TABLES[TABLES.length - 1];
const EARLIEST = TABLES[0];

/** Calendar years with an official table, oldest first. */
export const PAY_TABLE_YEARS = TABLES.map((t) => t.year);
/** The newest official table's year. Months after it use an assumed raise. */
export const PAY_TABLE_YEAR = LATEST.year;
export const PAY_GRADES = Object.keys(LATEST.grades);

// Across-the-board basic pay raises, effective 1 January of each year. Only
// used for a year before the earliest table, and shown to members.
// 2025 also carried a targeted April raise for E-1 to E-4, which does not
// affect anyone retiring from those grades after 20 years.
export const PAY_RAISES: Record<number, number> = { 2023: 4.6, 2024: 5.2, 2025: 4.5, 2026: 3.8 };

// What is known about a raise that has no published table yet, shown beside
// the assumed raise. A year that gets its table stops showing on its own.
export const PENDING_RAISE_NOTES: Record<number, string> = { 2027: "Congress is weighing 3.6% against a tiered 5 to 7%." };

function cell(table: PayTable, grade: string, yearsOfService: number): number | null {
  const row = table.grades[grade];
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

/** Monthly basic pay on the newest table for a grade and completed years of service. */
export function basicPay(grade: string, yearsOfService: number): number | null {
  return cell(LATEST, grade, yearsOfService);
}

/**
 * Converts a newest-table amount to another calendar year using the
 * across-the-board raises (back) or the assumed raise (forward).
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

/**
 * Monthly basic pay in a calendar year: that year's official table when there
 * is one; after the newest table, the newest plus the assumed raise each year;
 * before the earliest table, the earliest less the recorded raises.
 */
export function monthlyPay(grade: string, yearsOfService: number, year: number, assumedFutureRaisePct: number): number | null {
  const exact = TABLES.find((t) => t.year === year);
  if (exact) return cell(exact, grade, yearsOfService);
  if (year > LATEST.year) {
    const base = cell(LATEST, grade, yearsOfService);
    return base === null ? null : base * (1 + assumedFutureRaisePct / 100) ** (year - LATEST.year);
  }
  let value = cell(EARLIEST, grade, yearsOfService);
  if (value === null) return null;
  for (let y = EARLIEST.year; y > year; y -= 1) value /= 1 + (PAY_RAISES[y] ?? 3) / 100;
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
  // Price every month at this year's table instead of the month's own year.
  // With the newest table, the result is the High-3 in today's dollars.
  payTableYear?: number;
};

/** Calendar years in the 36 months before retirement that have no official table yet. */
export function estimatedYears(retirementDate: Date): number[] {
  const years = new Set<number>();
  for (let monthsBack = 1; monthsBack <= 36; monthsBack += 1) {
    const year = new Date(retirementDate.getFullYear(), retirementDate.getMonth() - monthsBack, 1).getFullYear();
    if (!PAY_TABLE_YEARS.includes(year)) years.add(year);
  }
  return [...years].sort((a, b) => a - b);
}

/**
 * Average monthly basic pay over the 36 months before retirement, using the
 * pay each month actually carried: the grade held that month, the years of
 * service reached by then, and that calendar year's pay table.
 */
export function estimateHigh3(inputs: High3Inputs): number | null {
  const monthsInGrade = inputs.monthsInGrade ?? 36;
  const raise = inputs.assumedFutureRaisePct ?? 3.6;
  // Count service in whole months. The window usually crosses longevity steps
  // (retiring at 20 years 3 months: 3 months over 20, 24 over 18, 9 over 16),
  // and fractional years drift: 32 + 2/12 - 26/12 comes out just under 30 and
  // would pay the month someone reached over 30 at the over 26 rate.
  const serviceMonths = Math.round(inputs.yearsOfService * 12);
  let total = 0;

  for (let monthsBack = 1; monthsBack <= 36; monthsBack += 1) {
    const date = new Date(inputs.retirementDate.getFullYear(), inputs.retirementDate.getMonth() - monthsBack, 1);
    const grade = monthsBack <= monthsInGrade || !inputs.previousGrade ? inputs.grade : inputs.previousGrade;
    const yos = Math.max(0, serviceMonths - monthsBack) / 12;
    const pay = monthlyPay(grade, yos, inputs.payTableYear ?? date.getFullYear(), raise);
    if (pay === null) return null;
    total += pay;
  }

  return Math.round((total / 36) * 100) / 100;
}
