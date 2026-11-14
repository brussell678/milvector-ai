import Link from "next/link";
import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page-container";
import { RetirementCalculator } from "@/components/retirement-calculator";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  ...pageMetadata({
    title: "Military Retirement Pay Calculator with VA Disability",
    description:
      "Estimate your full monthly income after military retirement: High-3 or BRS retired pay, VA disability compensation, CRDP and CRSC, SBP, and taxes. Free, no sign-up.",
    path: "/retirement-calculator",
  }),
};

export default function RetirementCalculatorPage() {
  return (
    <PageContainer className="flex flex-col gap-8" size="lg">
      <section className="page-hero-dark">
        <div className="page-hero-grid">
          <div>
            <p className="page-kicker-pill">RETIREMENT PAY CALCULATOR</p>
            <h1 className="page-title">
              Know your real monthly income <span className="gradient-text">before you retire.</span>
            </h1>
            <p className="page-description">
              Retired pay and VA disability together, the way they are actually paid: what gets waived, what comes back through CRDP
              or CRSC, what SBP costs, and what is left after tax.
            </p>
          </div>
          <aside className="page-hero-aside">
            <p className="page-hero-aside-title">WHAT IT COVERS</p>
            <ul className="page-hero-list">
              <li>High-3 and Blended Retirement, active and reserve</li>
              <li>VA disability pay with dependents</li>
              <li>CRDP, CRSC, and the VA waiver</li>
              <li>SBP premium and a federal tax estimate</li>
            </ul>
          </aside>
        </div>
      </section>

      <RetirementCalculator />

      <section className="section-card">
        <p className="section-kicker">HOW RETIRED PAY AND VA PAY FIT TOGETHER</p>
        <h2 className="section-title">Three rules decide your total</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="subtle-panel p-5">
            <h3 className="font-bold">Under 50 percent: an offset</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              Your retired pay is reduced by the amount of your VA compensation. The total stays about the same, but the VA part is
              tax free, so you keep more of it.
            </p>
          </div>
          <div className="subtle-panel p-5">
            <h3 className="font-bold">50 percent or more: both in full</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              With a 20-year retirement and a combined rating of 50 percent or higher, Concurrent Retirement and Disability Pay
              (CRDP) restores your full retired pay on top of VA compensation. It is automatic.
            </p>
          </div>
          <div className="subtle-panel p-5">
            <h3 className="font-bold">Combat related: CRSC</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              Combat-Related Special Compensation replaces waived retired pay with a tax-free payment for disabilities tied to
              combat, hazardous duty, or training for war. You apply for it through your branch.
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/auth" className="btn btn-primary">
            Open a Free Workspace
          </Link>
          <Link href="/platform" className="btn btn-secondary">
            See What Else MilVector Does
          </Link>
        </div>
      </section>
    </PageContainer>
  );
}
