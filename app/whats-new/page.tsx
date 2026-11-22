import Link from "next/link";
import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page-container";
import { WhatsNewFeed, formatUpdateDate, loadPublishedUpdates } from "@/components/whats-new-feed";
import { pageMetadata } from "@/lib/seo";
import { supabaseServer } from "@/lib/supabase/server";

// The public What's New page: the same feed members see at /app/whats-new,
// open to anyone, and built to turn a visitor into a member. Members who land
// here are pointed back to their workspace instead.

export const metadata: Metadata = {
  ...pageMetadata({
    title: "What's New",
    description:
      "Every change shipped to MilVector, the free career transition workspace for service members, dated and in plain terms. Much of it comes from what members ask for.",
    path: "/whats-new",
  }),
};

const SIGN_UP = "/auth?mode=signup";

const freeTools = [
  "A master resume built from your evaluations and awards",
  "A resume for each job, written only from your own record",
  "How you fit a job posting, requirement by requirement",
  "Mock interviews, plus VA rating and SBP guidance",
];

function JoinCard() {
  return (
    <section className="cta-band">
      <div className="relative z-10 flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between md:p-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: "#39a67f" }}>
            FREE FOR SERVICE MEMBERS
          </p>
          <h2 className="mt-2 text-xl font-extrabold text-white md:text-2xl" style={{ letterSpacing: "-0.02em", lineHeight: "1.15" }}>
            Try what you are reading about.
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.62)" }}>
            Create an account with your email and the tools on this page are yours to use. No cost, and your information is never sold.
          </p>
        </div>
        <Link href={SIGN_UP} className="btn btn-primary w-full shrink-0 sm:w-auto">
          Create your free account
        </Link>
      </div>
    </section>
  );
}

export default async function PublicWhatsNewPage() {
  const supabase = await supabaseServer();
  const [
    {
      data: { user },
    },
    updates,
  ] = await Promise.all([supabase.auth.getUser(), loadPublishedUpdates(supabase)]);
  const latest = updates[0];

  return (
    <PageContainer className="flex flex-col gap-6" size="lg">
      <section className="page-hero-dark">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker-pill">WHAT&apos;S NEW</p>
            <h1 className="page-title">
              Built in the open, <span className="gradient-text">shaped by your feedback.</span>
            </h1>
            <p className="page-description">
              MilVector is a free workspace for service members moving into civilian careers. Here is every change we ship, dated and in plain
              terms. A lot of it comes straight from what members tell us.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              {user ? (
                <Link href="/app/tools" className="btn btn-primary w-full text-sm sm:w-auto">
                  Go to your tools
                </Link>
              ) : (
                <Link href={SIGN_UP} className="btn btn-primary w-full text-sm sm:w-auto">
                  Create your free account
                </Link>
              )}
              <Link href="/feedback" className="btn btn-hero-ghost w-full text-sm sm:w-auto">
                Send feedback
              </Link>
            </div>
            {latest && (
              <p className="mt-4 text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
                Last update: {formatUpdateDate(latest.published_at)}
              </p>
            )}
          </div>
          <aside className="page-hero-aside relative z-10">
            <p className="page-hero-aside-title">FREE WITH AN ACCOUNT</p>
            <ul className="page-hero-list">
              {freeTools.map((tool) => (
                <li key={tool}>{tool}</li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      <WhatsNewFeed updates={updates} insert={user ? undefined : <JoinCard />} />

      {!user && updates.length > 0 && <JoinCard />}
    </PageContainer>
  );
}
