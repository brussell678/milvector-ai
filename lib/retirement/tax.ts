// Federal income tax estimate, tax year 2026.
// Source: IRS, "IRS releases tax inflation adjustments for tax year 2026,
// including amendments from the One, Big, Beautiful Bill" (Rev. Proc. 2025-32).
//
// This is an estimate of ordinary income tax only: standard deduction and the
// rate brackets. No credits, no itemizing, no other taxes.

export const TAX_YEAR = 2026;

export type FilingStatus = "single" | "married";

const STANDARD_DEDUCTION: Record<FilingStatus, number> = { single: 16100, married: 32200 };

// [income above this, rate]
const BRACKETS: Record<FilingStatus, Array<[number, number]>> = {
  single: [
    [0, 0.1],
    [12400, 0.12],
    [50400, 0.22],
    [105700, 0.24],
    [201775, 0.32],
    [256225, 0.35],
    [640600, 0.37],
  ],
  married: [
    [0, 0.1],
    [24800, 0.12],
    [100800, 0.22],
    [211400, 0.24],
    [403550, 0.32],
    [512450, 0.35],
    [768700, 0.37],
  ],
};

/** Annual federal income tax on gross ordinary income, after the standard deduction. */
export function federalTax(annualIncome: number, status: FilingStatus): number {
  const taxable = Math.max(0, annualIncome - STANDARD_DEDUCTION[status]);
  const brackets = BRACKETS[status];
  let tax = 0;
  for (let i = 0; i < brackets.length; i += 1) {
    const [floor, rate] = brackets[i];
    const ceiling = i + 1 < brackets.length ? brackets[i + 1][0] : Infinity;
    if (taxable > floor) tax += (Math.min(taxable, ceiling) - floor) * rate;
  }
  return Math.round(tax * 100) / 100;
}

/**
 * The federal tax that one slice of income adds on top of the household's
 * other taxable income. Retired pay stacks on top of a civilian salary, so it
 * is taxed at the rates that salary has already reached.
 */
export function federalTaxOnAddedIncome(addedAnnual: number, otherAnnual: number, status: FilingStatus): number {
  if (addedAnnual <= 0) return 0;
  return Math.round((federalTax(otherAnnual + addedAnnual, status) - federalTax(otherAnnual, status)) * 100) / 100;
}
