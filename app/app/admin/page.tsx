import { redirect } from "next/navigation";
import Link from "next/link";
import { AdminPortal } from "@/components/admin/admin-portal";
import { ChatAccessPanel } from "@/components/admin/chat-access-panel";
import { chatSwitches } from "@/lib/chat/access";
import { UsagePanel } from "@/components/admin/usage-panel";
import { summarizeUsage, type ProfileRow, type RunRow, type UsageSummary } from "@/lib/admin/usage";
import { isAdminEmail } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { toolLabels } from "@/lib/tools/registry";

const PAGE = 1000;
const MAX_ROWS = 50_000;

// Every row of a query, a page at a time (Supabase returns at most 1000 per request).
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// Usage across every member needs the service role: tool_runs and profiles
// are each member's own rows otherwise.
async function loadUsage(adminUserId: string): Promise<{ summary: UsageSummary | null; note?: string }> {
  const admin = supabaseAdmin();
  if (!admin) return { summary: null, note: "Usage needs SUPABASE_SERVICE_ROLE_KEY on the server." };
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const [runs, profiles] = await Promise.all([
      allRows<RunRow>((from, to) =>
        admin
          .from("tool_runs")
          .select("user_id,tool_name,status,latency_ms,tokens_in,tokens_out,created_at,input_json")
          .gte("created_at", since)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to)
      ),
      allRows<ProfileRow>((from, to) => admin.from("profiles").select("id,created_at").order("id", { ascending: true }).range(from, to)),
    ]);
    const env = getEnv();
    return {
      summary: summarizeUsage({
        runs,
        profiles,
        now,
        excludeUserId: adminUserId,
        labels: toolLabels,
        models: { tools: env.TOOLS_MODEL, masterResume: env.MASTER_RESUME_MODEL, targetedResume: env.TARGETED_RESUME_MODEL },
      }),
    };
  } catch (error) {
    console.error("[admin] usage could not be loaded:", error);
    return { summary: null, note: "Usage could not be loaded. The server log has the reason." };
  }
}

type FeedbackRow = {
  id: string;
  created_at: string;
  name: string | null;
  email: string | null;
  branch: string | null;
  mos: string | null;
  feedback_type: string;
  message: string;
  suggested_tool: string | null;
  status: "new" | "reviewing" | "resolved" | "archived";
  attachment_url: string | null;
  admin_response: string | null;
  admin_response_updated_at: string | null;
  attachment_signed_url?: string | null;
};

type SubmissionRow = {
  id: string;
  created_at: string;
  title: string;
  description: string | null;
  category: string;
  file_url: string;
  approved: boolean;
  review_url?: string | null;
};

type MessageBoardReportRow = {
  id: string;
  created_at: string;
  reason: string;
  details: string | null;
  status: "open" | "reviewed" | "dismissed" | "actioned";
  moderator_notes: string | null;
  post_id: string;
  reported_by_user_id: string;
  post?: {
    user_id: string;
    title: string | null;
    body: string;
    author_label: string;
    parent_post_id: string | null;
  } | null;
};

type MessageBoardReportQueryRow = Omit<MessageBoardReportRow, "post"> & {
  post?: {
    user_id: string;
    title: string | null;
    body: string;
    author_label: string;
    parent_post_id: string | null;
  }[] | null;
};

type MessageBoardBlockedUserRow = {
  user_id: string;
  reason: string | null;
  created_at: string;
};

export default async function AdminPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");
  if (!isAdminEmail(user.email)) redirect("/app");
  const [usage, switches] = await Promise.all([loadUsage(user.id), chatSwitches()]);

  const [{ data: feedback }, { data: submissions }, { data: reports }, { data: blockedUsers }, { data: draftUpdates }] = await Promise.all([
    supabase
      .from("feedback")
      .select("id,created_at,name,email,branch,mos,feedback_type,message,suggested_tool,status,attachment_url,admin_response,admin_response_updated_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("library_submissions")
      .select("id,created_at,title,description,category,file_url,approved")
      .order("created_at", { ascending: false }),
    supabase
      .from("message_board_reports")
      .select("id,created_at,reason,details,status,moderator_notes,post_id,reported_by_user_id,post:message_board_posts(user_id,title,body,author_label,parent_post_id)")
      .order("created_at", { ascending: false }),
    supabase
      .from("message_board_blocked_users")
      .select("user_id,reason,created_at")
      .order("created_at", { ascending: false }),
    // What's New drafts (WHATSNEW.md entries tagged {draft}) waiting to be published.
    supabase.from("product_updates").select("id,title").eq("published", false).order("published_at", { ascending: false }),
  ]);
  const drafts = (draftUpdates ?? []) as Array<{ id: string; title: string }>;

  const feedbackRows = ((feedback ?? []) as FeedbackRow[]).slice();
  const submissionRows = ((submissions ?? []) as SubmissionRow[]).slice();
  const reportRows = ((reports ?? []) as MessageBoardReportQueryRow[]).map((item) => ({
    ...item,
    post: item.post?.[0] ?? null,
  }));
  const blockedRows = ((blockedUsers ?? []) as MessageBoardBlockedUserRow[]).slice();

  const feedbackWithUrls = await Promise.all(
    feedbackRows.map(async (item) => {
      if (!item.attachment_url) return item;
      const { data } = await supabase.storage
        .from("feedback-attachments")
        .createSignedUrl(item.attachment_url, 60 * 60);
      return { ...item, attachment_signed_url: data?.signedUrl ?? null };
    })
  );

  const submissionsWithUrls = await Promise.all(
    submissionRows.map(async (item) => {
      const { data } = await supabase.storage
        .from("library-submissions")
        .createSignedUrl(item.file_url, 60 * 60);
      return { ...item, review_url: data?.signedUrl ?? null };
    })
  );

  return (
    <main className="page-shell">
      <section className="page-hero-dark">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker-pill">ADMIN PORTAL</p>
            <h1 className="page-title">Triage feedback, moderate community, review submissions.</h1>
            <p className="page-description">
              Restricted to {user.email}. Respond to user support cases, publish library submissions,
              action community reports, and manage posting blocks, all in one place.
            </p>
            <div className="mt-5">
              <Link href="/app/admin/updates" className="btn btn-primary text-sm">
                Post a What&apos;s New update →
              </Link>
            </div>
          </div>
          <aside className="page-hero-aside">
            <p className="page-hero-aside-title">ADMIN CAPABILITIES</p>
            <ul className="page-hero-list">
              <li>Respond to support tickets with email notification</li>
              <li>Move tickets from new to in-review to resolved</li>
              <li>Review and publish community library submissions</li>
              <li>Action board reports and manage posting blocks</li>
              <li>Open each chat tool to members when it is ready</li>
            </ul>
          </aside>
        </div>
      </section>

      {drafts.length > 0 && (
        <div className="alert-base alert-info mt-6 flex flex-wrap items-center justify-between gap-3" role="status">
          <p className="min-w-0">
            <strong>
              {drafts.length === 1 ? "1 What's New draft is" : `${drafts.length} What's New drafts are`} waiting for you.
            </strong>{" "}
            Members see nothing until you publish.
          </p>
          <Link href="/app/admin/updates" className="btn btn-primary shrink-0 text-sm">
            Review drafts
          </Link>
        </div>
      )}

      <ChatAccessPanel switches={switches} />

      <UsagePanel summary={usage.summary} note={usage.note} />

      <AdminPortal
        initialFeedback={feedbackWithUrls}
        initialSubmissions={submissionsWithUrls}
        initialMessageBoardReports={reportRows}
        initialBlockedUsers={blockedRows}
      />
    </main>
  );
}
