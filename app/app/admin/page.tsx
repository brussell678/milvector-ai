import { redirect } from "next/navigation";
import { AdminPortal } from "@/components/admin/admin-portal";
import { isAdminEmail } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

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

  if (!user) redirect("/login");
  if (!isAdminEmail(user.email)) redirect("/app");

  const [{ data: feedback }, { data: submissions }, { data: reports }, { data: blockedUsers }] = await Promise.all([
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
  ]);

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
      <section className="page-hero">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker">ADMIN</p>
            <h1 className="page-title">Review platform feedback and community submissions.</h1>
            <p className="page-description">
              This portal is restricted to your company account so you can triage user input, review uploaded files, and publish approved library submissions from inside MilVector.
            </p>
          </div>
          <aside className="page-hero-aside">
            <p className="page-hero-aside-title">ADMIN ACCESS</p>
            <ul className="page-hero-list">
              <li>Restricted to {user.email}</li>
              <li>Feedback can be marked new, reviewing, resolved, or archived</li>
              <li>Library submissions can be reviewed and published</li>
            </ul>
          </aside>
        </div>
      </section>

      <AdminPortal
        initialFeedback={feedbackWithUrls}
        initialSubmissions={submissionsWithUrls}
        initialMessageBoardReports={reportRows}
        initialBlockedUsers={blockedRows}
      />
    </main>
  );
}
