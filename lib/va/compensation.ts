// Monthly VA disability compensation from the official rate table.
// Data: data/va/compensation-rates.json, built from VA.gov by
// scripts/build-va-rates.mjs.

import table from "@/data/va/compensation-rates.json";

type RateRow = Record<string, number>;
const rates = (table as unknown as { rates: Record<string, RateRow> }).rates;

export const VA_RATES_LABEL = table.label;
export const VA_RATES_EFFECTIVE = table.effective;
export const VA_RATES_SOURCE = table.source;

// VA's announced cost-of-living increase for the next table, offered to
// members as a labeled estimate. Once a published table with that effective
// date or later is loaded it turns itself off, so it is never applied twice.
const ANNOUNCED_COLA = { pct: 3.6, effective: "2026-12-01" };
export const VA_PENDING_COLA: { pct: number; effective: string } | null = ANNOUNCED_COLA.effective > VA_RATES_EFFECTIVE ? ANNOUNCED_COLA : null;

export type Dependents = {
  spouse: boolean;
  childrenUnder18: number;
  // Children 18 to 23 in a qualifying school program
  childrenInSchool: number;
  dependentParents: 0 | 1 | 2;
  spouseAidAndAttendance?: boolean;
};

export const NO_DEPENDENTS: Dependents = { spouse: false, childrenUnder18: 0, childrenInSchool: 0, dependentParents: 0 };

export const VA_RATINGS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;

function baseKey(dep: Dependents, hasChild: boolean) {
  const parents = dep.dependentParents;
  if (hasChild) {
    if (dep.spouse) return parents === 2 ? "child_spouse_2parents" : parents === 1 ? "child_spouse_1parent" : "child_spouse";
    return parents === 2 ? "child_2parents" : parents === 1 ? "child_1parent" : "child";
  }
  if (dep.spouse) return parents === 2 ? "spouse_2parents" : parents === 1 ? "spouse_1parent" : "spouse";
  return parents === 2 ? "parents2" : parents === 1 ? "parent1" : "alone";
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Monthly compensation for a combined rating and set of dependents.
 * `increasePct` projects a cost-of-living increase onto the published table
 * (for example 3.6) and is an estimate until VA publishes the new table.
 */
export function monthlyCompensation(rating: number, dep: Dependents = NO_DEPENDENTS, increasePct = 0): number {
  const row = rates[String(rating)];
  if (!row) return 0;
  const scale = 1 + increasePct / 100;

  // 10 and 20 percent pay one flat amount; dependents add nothing below 30.
  if (rating < 30) return round2(row.alone * scale);

  const under18 = Math.max(0, Math.floor(dep.childrenUnder18));
  const inSchool = Math.max(0, Math.floor(dep.childrenInSchool));
  const hasChild = under18 + inSchool > 0;

  let total = row[baseKey(dep, hasChild)];
  if (hasChild) {
    // The "1 child" row already covers the first child. VA's table prices that
    // row for a child under 18, so a household with only school-age children
    // is slightly understated here.
    const firstIsUnder18 = under18 > 0;
    total += (firstIsUnder18 ? under18 - 1 : 0) * row.add_child_under18;
    total += (firstIsUnder18 ? inSchool : inSchool - 1) * row.add_child_school;
  }
  if (dep.spouse && dep.spouseAidAndAttendance) total += row.add_spouse_aid_attendance;

  return round2(total * scale);
}
