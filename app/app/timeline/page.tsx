import { supabaseServer } from "@/lib/supabase/server";
import { getLibraryLinkFallbacks, getTransitionTaskFallbacks, mergeDashboardTasks, mergeLibraryLinks } from "@/lib/transition-data";
import { TimelinePhaseBoard } from "@/components/dashboard/TimelinePhaseBoard";
import type { DashboardLink, DashboardTask } from "@/components/dashboard/types";

export default async function TimelinePage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [tasksRes, completedRes, linksRes, taskFallbacks, linkFallbacks] = await Promise.all([
    supabase
      .from("transition_tasks")
      .select(
        "id,external_id,title,description,category,phase_month,days_before_event,tool_link,knowledge_article,assistance_type,assistance_ref,assistance_notes,transition_supporting_tasks(id,title,description,order_index)"
      )
      .eq("task_type", "milestone")
      .order("phase_month", { ascending: false })
      .order("days_before_event", { ascending: false, nullsFirst: false })
      .order("title", { ascending: true }),
    supabase.from("transition_task_completions").select("task_id").eq("user_id", user.id),
    supabase.from("library_links").select("id,external_id,title,category,description,url,source").eq("review_status", "ready").order("title", { ascending: true }),
    getTransitionTaskFallbacks(),
    getLibraryLinkFallbacks(),
  ]);

  const tasks = mergeDashboardTasks((tasksRes.data ?? []) as DashboardTask[], taskFallbacks);
  const completedTaskIds = (completedRes.data ?? []).map((x) => x.task_id);
  const links = mergeLibraryLinks((linksRes.data ?? []) as DashboardLink[], linkFallbacks);

  return (
    <main className="page-shell">
      <section className="page-hero">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker">TIMELINE</p>
            <h1 className="page-title">See the full transition roadmap by phase.</h1>
            <p className="page-description">
              Review milestones across every phase, mark work complete, and calibrate readiness as your separation date gets closer.
            </p>
          </div>
          <aside className="page-hero-aside">
            <p className="page-hero-aside-title">USE THIS PAGE TO</p>
            <ul className="page-hero-list">
              <li>See all phases in one place</li>
              <li>Mark tasks complete as they happen</li>
              <li>Find links and support tied to each milestone</li>
            </ul>
          </aside>
        </div>
      </section>

      <TimelinePhaseBoard tasks={tasks} initialCompletedTaskIds={completedTaskIds} links={links} />
    </main>
  );
}
