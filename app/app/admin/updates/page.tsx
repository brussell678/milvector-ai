import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdminEmail } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { UpdatesManager, type ExistingUpdate, type FeedbackOption } from "@/components/admin/updates-manager";

export default async function AdminUpdatesPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");
  if (!isAdminEmail(user.email)) redirect("/app");

  const [{ data: updates }, { data: feedback }] = await Promise.all([
    supabase
      .from("product_updates")
      .select("id,title,body,category,is_user_requested,linked_feedback_id,published,published_at")
      .order("published_at", { ascending: false })
      .limit(50),
    supabase
      .from("feedback")
      .select("id,message,feedback_type,email,status,created_at")
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const feedbackOptions: FeedbackOption[] = ((feedback ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    label: `${String(row.feedback_type ?? "general")} · ${String(row.message ?? "").slice(0, 70)}${
      String(row.message ?? "").length > 70 ? "…" : ""
    }`,
    hasEmail: !!row.email,
    status: String(row.status ?? "new"),
  }));

  return (
    <main className="page-shell">
      <section className="section-card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold">What&apos;s New — Composer</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Post a product update. It appears on the announcement bar (for 21 days) and the What&apos;s New page.
              Linking a support case marks it resolved and emails the reporter that their request is live.
            </p>
          </div>
          <Link href="/app/admin" className="btn btn-secondary text-sm">
            Back to Admin
          </Link>
        </div>

        <UpdatesManager
          initialUpdates={(updates ?? []) as ExistingUpdate[]}
          feedbackOptions={feedbackOptions}
        />
      </section>
    </main>
  );
}
