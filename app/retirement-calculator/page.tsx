import type { Metadata } from "next";
import { CalculatorPageActions } from "@/components/calculator-page-actions";
import { PageContainer } from "@/components/layout/page-container";
import { RetirementCalculator } from "@/components/retirement-calculator";
import { RetirementCalculatorHero, RetirementPayRules } from "@/components/retirement-calculator-page";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  ...pageMetadata({
    title: "Military Retirement Pay Calculator with VA Disability",
    description:
      "Estimate your full monthly income after military retirement: High-3 or BRS retired pay, VA disability compensation, CRDP and CRSC, SBP, and taxes. Free, no sign-up.",
    path: "/retirement-calculator",
  }),
};

// The public page, for visitors and search. Members use the same calculator
// inside the workspace at /app/tools/retirement-calculator.
export default function RetirementCalculatorPage() {
  return (
    <PageContainer className="flex flex-col gap-8" size="lg">
      <RetirementCalculatorHero />
      <RetirementCalculator />
      <RetirementPayRules actions={<CalculatorPageActions />} />
    </PageContainer>
  );
}
