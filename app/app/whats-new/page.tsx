import Link from "next/link";
import { WhatsNewFeed, formatUpdateDate, loadPublishedUpdates } from "@/components/whats-new-feed";
import { supabaseServer } from "@/lib/supabase/server";

// The member view of What's New. The same feed is public at /whats-new.
export default async function WhatsNewPage() {
  const supabase = await supabaseServer();
  const updates = await loadPublishedUpdates(supabase);
  const latest = updates[0];

  return (
    <main className="page-shell">
      <section className="page-hero-dark">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker-pill">WHAT&apos;S NEW</p>
            <h1 className="page-title">
              Built in the open,{" "}
              <span className="gradient-text">shaped by your feedback.</span>
            </h1>
            <p className="page-description">
              Every change we ship to MilVector, dated and in plain terms. A lot of it comes straight from what users tell us. If something
              would help your transition, say so and it may end up here.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/app/feedback" className="btn btn-primary text-sm">
                Send an idea or issue
              </Link>
              <Link href="/app/tools" className="btn btn-hero-ghost text-sm">
                Back to tools
              </Link>
            </div>
            {latest && (
              <p className="mt-4 text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
                Last update: {formatUpdateDate(latest.published_at)}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="tool-section">
        <WhatsNewFeed updates={updates} />
      </section>
    </main>
  );
}
