import Link from "next/link";
import { RetirementCalculator } from "@/components/retirement-calculator";
import { RetirementCalculatorHero, RetirementPayRules } from "@/components/retirement-calculator-page";

// The calculator inside the workspace, so a signed-in member keeps the
// workspace menus and is never offered an account they already have. The
// public page at /retirement-calculator serves visitors and search.
export default function WorkspaceRetirementCalculatorPage() {
  return (
    <main className="page-shell">
      <RetirementCalculatorHero />
      <RetirementCalculator />
      <RetirementPayRules
        actions={
          <>
            <Link href="/app/tools/sbp-advisor" className="btn btn-primary">
              Compare your SBP options
            </Link>
            <Link href="/app/tools/va-rating-navigator" className="btn btn-secondary">
              Estimate your VA rating
            </Link>
            <Link href="/app/tools" className="btn btn-secondary">
              Back to Tools
            </Link>
          </>
        }
      />
    </main>
  );
}
