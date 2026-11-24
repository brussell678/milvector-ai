import { redirect } from "next/navigation";
import Link from "next/link";
import { MemberRoster, type MemberView } from "@/components/admin/member-roster";
import { loadRoster } from "@/lib/admin/members";
import { isAdminEmail } from "@/lib/auth";
import { emailReady } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

// The admin's member roster (migration 0046; lib/admin/members.ts).
export default async function AdminMembersPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");
  if (!isAdminEmail(user.email)) redirect("/app");

  const admin = supabaseAdmin();
  const roster = admin ? await loadRoster(admin, new Date()) : null;
  const members: MemberView[] = roster?.ok
    ? roster.members.map((m) => ({
        id: m.user_id,
        email: m.email,
        name: m.full_name,
        branch: m.branch,
        rank: m.rank,
        joinedAt: m.joined_at,
        lastActive: m.state.lastActive.toISOString(),
        daysInactive: m.state.daysInactive,
        retirementDate: m.retirement_date,
        cards: m.cards,
        liveCards: m.live_cards,
        documents: m.documents,
        resumes: m.resumes,
        linkedin: m.linkedin,
        invites: m.invites,
        timelineDone: m.timeline_done,
        toolRuns: m.tool_runs,
        fileBytes: m.file_bytes,
        dataBytes: m.data_bytes,
        hasRecords: m.hasRecords,
        status: m.state.status,
        clearOn: m.state.clearOn,
        noticeSentAt: m.state.noticeSentAt,
        finalSentAt: m.state.finalSentAt,
        recordsClearedAt: m.records_cleared_at,
        noticeDue: !!m.state.due,
      }))
    : [];

  return (
    <main className="page-shell">
      <section className="section-card">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 grow basis-[240px]">
            <h1 className="text-lg font-bold">Members</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Everyone with an account, the longest since they last used MilVector first. Transition records are cleared after a long absence, with two
              email notices first; you approve each clear.
            </p>
          </div>
          <Link href="/app/admin" className="btn btn-secondary shrink-0 whitespace-nowrap text-sm">
            Back to Admin
          </Link>
        </div>
        {!admin ? (
          <p className="alert-base alert-error">The roster needs SUPABASE_SERVICE_ROLE_KEY on the server.</p>
        ) : roster && !roster.ok ? (
          <p className="alert-base alert-error">
            {roster.notReady ? "The roster needs migration 0046 run in Supabase first." : `The roster could not be loaded: ${roster.error}`}
          </p>
        ) : (
          <MemberRoster members={members} emailReady={emailReady()} cronReady={!!process.env.CRON_SECRET} />
        )}
      </section>
    </main>
  );
}
