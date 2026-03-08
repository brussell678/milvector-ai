import { supabaseServer } from "@/lib/supabase/server";
import { TimelinePhaseBoard } from "@/components/dashboard/TimelinePhaseBoard";
import type { DashboardLink, DashboardTask } from "@/components/dashboard/types";

export default async function TimelinePage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [tasksRes, completedRes, linksRes] = await Promise.all([
    supabase
      .from("transition_tasks")
      .select(
        "id,title,description,category,phase_month,days_before_event,tool_link,knowledge_article,assistance_type,assistance_ref,assistance_notes,transition_supporting_tasks(id,title,description,order_index)"
      )
      .eq("task_type", "milestone")
      .order("phase_month", { ascending: false })
      .order("days_before_event", { ascending: false, nullsFirst: false })
      .order("title", { ascending: true }),
    supabase.from("transition_task_completions").select("task_id").eq("user_id", user.id),
    supabase.from("library_links").select("id,title,category,description,url").eq("review_status", "ready").order("title", { ascending: true }),
  ]);

  const tasks = (tasksRes.data ?? []) as DashboardTask[];
  const completedTaskIds = (completedRes.data ?? []).map((x) => x.task_id);
  const links = (linksRes.data ?? []) as DashboardLink[];

  return (
    <main className="space-y-4">
      <section className="panel p-6">
        <h1 className="text-2xl font-bold">Mission Timeline</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          All milestones grouped by phase. Check off completed requirements from any phase to calibrate readiness.
        </p>
      </section>

      <TimelinePhaseBoard tasks={tasks} initialCompletedTaskIds={completedTaskIds} links={links} />
    </main>
  );
}
