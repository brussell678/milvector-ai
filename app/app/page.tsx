import { supabaseServer } from "@/lib/supabase/server";
import { daysUntilDate, phaseFromDays, phaseMonthFromDays, TIMELINE_MARKERS } from "@/lib/timeline";
import { PhaseObjectives } from "@/components/dashboard/PhaseObjectives";
import type { DashboardLink, DashboardTask } from "@/components/dashboard/types";

function nextStep(profileExists: boolean, hasMasterResume: boolean, hasTargetedResume: boolean) {
  if (!profileExists) return { href: "/app/profile", label: "Complete profile" };
  if (!hasMasterResume) return { href: "/app/tools/fitrep-bullets", label: "Build career foundation" };
  if (!hasTargetedResume) return { href: "/app/tools/resume-targeter", label: "Build job-targeted application" };
  return { href: "/app/library", label: "Review your library" };
}

export default async function DashboardPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [profileRes, artifactsRes, docsCountRes, toolRunsCountRes, toolSuccessCountRes, toolErrorCountRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("resume_artifacts").select("artifact_type").eq("user_id", user.id),
    supabase.from("documents").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("tool_runs").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("tool_runs").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "success"),
    supabase.from("tool_runs").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "error"),
  ]);

  const easDate = profileRes.data?.eas_date ?? profileRes.data?.separation_date ?? null;
  const daysUntilEas = daysUntilDate(easDate);
  const currentPhase = phaseFromDays(daysUntilEas);
  const currentPhaseMonth = phaseMonthFromDays(daysUntilEas);

  const [tasksRes, completedRes, linksRes] = await Promise.all([
    supabase
      .from("transition_tasks")
      .select(
        "id,title,description,category,phase_month,tool_link,knowledge_article,assistance_type,assistance_ref,assistance_notes,transition_supporting_tasks(id,title,description,order_index)"
      )
      .eq("task_type", "milestone")
      .order("days_before_event", { ascending: false, nullsFirst: false }),
    supabase.from("transition_task_completions").select("task_id").eq("user_id", user.id),
    supabase.from("library_links").select("id,title,category,description,url").eq("review_status", "ready").order("title", { ascending: true }),
  ]);

  const allMilestoneTasks = (tasksRes.data ?? []) as DashboardTask[];
  const phaseTasks = allMilestoneTasks.filter((task) => task.phase_month === currentPhaseMonth);
  const completedTaskIds = (completedRes.data ?? []).map((x) => x.task_id);
  const links = (linksRes.data ?? []) as DashboardLink[];

  const artifactTypes = new Set((artifactsRes.data ?? []).map((row) => row.artifact_type));
  const hasMasterResume = artifactTypes.has("master_resume") || artifactTypes.has("master_bullets");
  const step = nextStep(!!profileRes.data, hasMasterResume, artifactTypes.has("targeted_resume"));
  const educationProfileSignals =
    (profileRes.data?.off_duty_education?.length ?? 0) +
    (profileRes.data?.civilian_certifications?.length ?? 0) +
    (profileRes.data?.additional_training?.length ?? 0);
  const artifactRows = artifactsRes.data ?? [];
  const masterResumeCount = artifactRows.filter((x) => x.artifact_type === "master_resume").length;
  const targetedResumesCount = artifactRows.filter((x) => x.artifact_type === "targeted_resume").length;
  const documentsCount = docsCountRes.count ?? 0;
  const toolRunsCount = toolRunsCountRes.count ?? 0;
  const toolSuccessCount = toolSuccessCountRes.count ?? 0;
  const toolErrorCount = toolErrorCountRes.count ?? 0;

  return (
    <main className="page-shell">
      <section className="page-hero">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker">MISSION CONTROL</p>
            <h1 className="page-title">Track your transition, tools, and next best move.</h1>
            <p className="page-description">
              Use the dashboard to stay oriented across your timeline, generated outputs, uploaded documents, and tool activity.
              MilVector works best when your profile, source records, and next step stay connected.
            </p>
          </div>
          <aside className="page-hero-aside">
            <p className="page-hero-aside-title">NEXT PRIORITY</p>
            <p className="mt-3 text-xl font-extrabold">{step.label}</p>
            <ul className="page-hero-list">
              <li>Current phase: {currentPhase}</li>
              <li>{daysUntilEas === null ? "Add an EAS date in Profile to activate the timeline." : `${daysUntilEas} days until EAS`}</li>
              <li>{hasMasterResume ? "Career foundation in place." : "Build your career foundation to unlock stronger outputs."}</li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="section-card">
        <h2 className="section-title">Transition Timeline</h2>
        <p className="section-description">Use these checkpoints to stay oriented as you move toward separation.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-7">
          {TIMELINE_MARKERS.map((marker) => {
            const isCurrent = currentPhaseMonth === marker;
            const isPast = currentPhaseMonth !== null && marker > currentPhaseMonth;
            const isFuture = currentPhaseMonth !== null && marker < currentPhaseMonth;

            return (
              <article
                key={marker}
                className={[
                  "stat-card relative text-center transition-colors",
                  isCurrent ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-[0_0_0_1px_var(--accent)]" : "",
                  isPast ? "opacity-80" : "",
                  isFuture ? "bg-[var(--panel)]" : "",
                ].join(" ")}
              >
                {isCurrent && (
                  <span className="absolute right-3 top-3 rounded-full bg-[var(--accent)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white">
                    Current
                  </span>
                )}
                <p className="text-lg font-bold">{marker === 0 ? "Final" : `${marker}m`}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Checkpoint</p>
              </article>
            );
          })}
        </div>
      </section>

      <PhaseObjectives
        currentPhase={currentPhase}
        daysUntilEas={daysUntilEas}
        nextObjective={step}
        phaseTasks={phaseTasks}
        allMilestoneTasks={allMilestoneTasks}
        initialCompletedTaskIds={completedTaskIds}
        links={links}
        educationProfileSignals={educationProfileSignals}
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <article className="stat-card">
          <p className="stat-label">Documents Uploaded</p>
          <p className="stat-value">{documentsCount}</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">Master Resumes</p>
          <p className="stat-value">{masterResumeCount}</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">Targeted Resumes</p>
          <p className="stat-value">{targetedResumesCount}</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">Tool Runs</p>
          <p className="stat-value">{toolRunsCount}</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">Tool Successes</p>
          <p className="stat-value text-[var(--accent)]">{toolSuccessCount}</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">Tool Errors</p>
          <p className="stat-value text-[#a33b3b]">{toolErrorCount}</p>
        </article>
      </section>
    </main>
  );
}
