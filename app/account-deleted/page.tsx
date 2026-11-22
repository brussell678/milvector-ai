import Link from "next/link";
import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page-container";

// Where a member lands after deleting their account (components/account/
// delete-account.tsx). Not indexed, and analytics never load here.
export const metadata: Metadata = {
  title: "Account deleted",
  robots: { index: false, follow: false },
};

export default function AccountDeletedPage() {
  return (
    <PageContainer className="flex flex-col gap-6 pb-12" size="md">
      <section className="section-card">
        <p className="section-kicker">ACCOUNT DELETED</p>
        <h1 className="section-title mt-1">Your account is deleted.</h1>
        <p className="section-description">
          Your profile, files, resumes, tool history, and Timeline progress are gone, and your business card and invitation pages are offline.
          You have been signed out.
        </p>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Thank you for using MilVector, and good luck with what comes next. If you ever want it again, you can make a new account at any
          time.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/" className="btn btn-primary w-full sm:w-auto">
            Back to MilVector
          </Link>
          <Link href="/retirement-calculator" className="btn btn-secondary w-full sm:w-auto">
            Retirement Pay Calculator
          </Link>
        </div>
      </section>
    </PageContainer>
  );
}
