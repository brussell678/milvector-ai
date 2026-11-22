import { NextResponse } from "next/server";
import { PAY_TABLE_YEAR, PAY_TABLE_YEARS } from "@/lib/retirement/pay";
import { TAX_YEAR } from "@/lib/retirement/tax";
import { VA_PENDING_COLA, VA_RATES_EFFECTIVE, VA_RATES_LABEL, VA_RATES_SOURCE } from "@/lib/va/compensation";

// The official data the Retirement Pay Calculator holds right now. A weekly
// scheduled check reads this and compares it with what VA, DFAS, and the IRS
// have published, so it never needs updating by hand: when a refresh ships,
// this answer changes with it. Public; nothing here is about a member.
export function GET() {
  return NextResponse.json({
    calculator: "https://www.milvector.org/retirement-calculator",
    vaCompensationRates: {
      label: VA_RATES_LABEL,
      effective: VA_RATES_EFFECTIVE,
      source: VA_RATES_SOURCE,
      // An announced increase offered as a labeled estimate until VA publishes its table; null when none.
      pendingEstimate: VA_PENDING_COLA,
    },
    basicPayTables: {
      years: PAY_TABLE_YEARS,
      newest: PAY_TABLE_YEAR,
      // A High-3 is the 36 months before the retirement date, so a retirement
      // dated in year Y reaches back into year Y-3.
      high3Needs: "a table for every calendar year in the 36 months before a retirement date: Y-3 through Y for a retirement dated in year Y",
    },
    federalIncomeTax: { taxYear: TAX_YEAR },
  });
}
