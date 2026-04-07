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

export default async function AdminPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (!isAdminEmail(user.email)) redirect("/app");

  const [{ data: feedback }, { data: submissions }] = await Promise.all([
    supabase
      .from("feedback")
      .select("id,created_at,name,email,branch,mos,feedback_type,message,suggested_tool,status,attachment_url")
      .order("created_at", { ascending: false }),
    supabase
      .from("library_submissions")
      .select("id,created_at,title,description,category,file_url,approved")
      .order("created_at", { ascending: false }),
  ]);

  const feedbackRows = ((feedback ?? []) as FeedbackRow[]).slice();
  const submissionRows = ((submissions ?? []) as SubmissionRow[]).slice();

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

      <AdminPortal initialFeedback={feedbackWithUrls} initialSubmissions={submissionsWithUrls} />
    </main>
  );
}
