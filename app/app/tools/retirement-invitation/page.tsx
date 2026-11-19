import { notFound } from "next/navigation";
import { RetirementInvitationBuilder } from "@/components/retirement-invitation-builder";
import { inviteBuilderEnabled } from "@/lib/invites/access";
import { supabaseServer } from "@/lib/supabase/server";

export default async function RetirementInvitationPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !inviteBuilderEnabled(user.email)) notFound();

  return (
    <main className="page-shell">
      <section className="page-hero-dark">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker-pill">RETIREMENT INVITATION BUILDER · PREVIEW</p>
            <h1 className="page-title">
              One page for your retirement, <span className="gradient-text">shared with a link or a scan.</span>
            </h1>
            <p className="page-description">
              Build the invitation for your ceremony and the celebration after it. Guests get the times, places, dress, and directions on their phone,
              and add each event to their calendar.
            </p>
          </div>
          <aside className="page-hero-aside relative z-10">
            <p className="page-hero-aside-title">WHAT YOU GET</p>
            <ul className="page-hero-list">
              <li>The ceremony and up to two more events on one page</li>
              <li>Templates designed for a military retirement</li>
              <li>One QR code for every printed piece</li>
              <li>A private home address kept off the public page</li>
            </ul>
          </aside>
        </div>
      </section>

      <RetirementInvitationBuilder />
    </main>
  );
}
