import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { daysUntilDate, phaseFromDays, phaseMonthFromDays, TIMELINE_MARKERS } from "@/lib/timeline";
import { getLibraryLinkFallbacks, getTransitionTaskFallbacks, mergeDashboardTasks, mergeLibraryLinks } from "@/lib/transition-data";
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

  const [tasksRes, completedRes, linksRes, taskFallbacks, linkFallbacks] = await Promise.all([
    supabase
      .from("transition_tasks")
      .select(
        "id,external_id,title,description,category,phase_month,tool_link,knowledge_article,assistance_type,assistance_ref,assistance_notes,transition_supporting_tasks(id,title,description,order_index)"
      )
      .eq("task_type", "milestone")
      .order("days_before_event", { ascending: false, nullsFirst: false }),
    supabase.from("transition_task_completions").select("task_id").eq("user_id", user.id),
    supabase.from("library_links").select("id,external_id,title,category,description,url,source").eq("review_status", "ready").order("title", { ascending: true }),
    getTransitionTaskFallbacks(),
    getLibraryLinkFallbacks(),
  ]);

  const allMilestoneTasks = mergeDashboardTasks((tasksRes.data ?? []) as DashboardTask[], taskFallbacks);
  const phaseTasks = allMilestoneTasks.filter((task) => task.phase_month === currentPhaseMonth);
  const completedTaskIds = (completedRes.data ?? []).map((x) => x.task_id);
  const links = mergeLibraryLinks((linksRes.data ?? []) as DashboardLink[], linkFallbacks);

  const artifactTypes = new Set((artifactsRes.data ?? []).map((row) => row.artifact_type));
  const hasMasterResume = artifactTypes.has("master_resume") || artifactTypes.has("master_bullets");
  const hasTargetedResume = artifactTypes.has("targeted_resume");
  const step = nextStep(!!profileRes.data, hasMasterResume, hasTargetedResume);
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
  const timelineReadiness = [
    !!profileRes.data,
    hasMasterResume,
    hasTargetedResume,
    daysUntilEas !== null,
  ].filter(Boolean).length;

  return (
    <main className="page-shell">
      <section className="page-hero">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker">MISSION CONTROL</p>
            <h1 className="page-title">Keep your transition plan, work product, and next action in one operating picture.</h1>
            <p className="page-description">
              Use the dashboard to stay oriented across readiness, saved work, timeline state, and workflow activity. MilVector works best when your profile, source records, and next move stay connected.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={step.href} className="btn btn-primary">
                {step.label}
              </Link>
              <Link href="/app/tools" className="btn btn-secondary">
                Open toolset
              </Link>
            </div>
          </div>
          <aside className="page-hero-aside">
            <p className="page-hero-aside-title">CURRENT STATE</p>
            <div className="mt-3 grid gap-3">
              <div className="subtle-panel p-4">
                <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">Current Phase</p>
                <p className="mt-2 text-xl font-extrabold">{currentPhase}</p>
              </div>
              <div className="subtle-panel p-4">
                <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">Days Until EAS</p>
                <p className="mt-2 text-xl font-extrabold">{daysUntilEas === null ? "Set in Profile" : daysUntilEas}</p>
              </div>
              <div className="subtle-panel p-4">
                <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">Readiness Signals</p>
                <p className="mt-2 text-xl font-extrabold">{timelineReadiness}/4 core signals in place</p>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr,0.85fr]">
        <section className="section-card">
          <h2 className="section-title">Priority View</h2>
          <p className="section-description">Start with the next best move, then check the supporting signals underneath it.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <article className="stat-card">
              <p className="stat-label">Next Best Move</p>
              <p className="mt-4 text-2xl font-extrabold leading-tight">{step.label}</p>
              <p className="mt-3 text-sm text-[var(--muted)]">
                {hasMasterResume
                  ? hasTargetedResume
                    ? "Your foundation is in place. Stay oriented through the library and timeline."
                    : "Your foundation is ready. Move into job-specific application work next."
                  : "Build the baseline material that makes the rest of the system stronger."}
              </p>
            </article>
            <article className="stat-card">
              <p className="stat-label">Workflow Health</p>
              <div className="mt-4 grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-[var(--muted)]">Profile saved</span>
                  <span className="font-semibold">{profileRes.data ? "Yes" : "No"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-[var(--muted)]">Master resume</span>
                  <span className="font-semibold">{hasMasterResume ? "Ready" : "Missing"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-[var(--muted)]">Targeted resume</span>
                  <span className="font-semibold">{hasTargetedResume ? "Ready" : "Not yet"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-[var(--muted)]">Education signals</span>
                  <span className="font-semibold">{educationProfileSignals}</span>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section className="section-card">
          <h2 className="section-title">Activity Snapshot</h2>
          <p className="section-description">A cleaner view of saved work and workflow performance.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <article className="stat-card">
              <p className="stat-label">Documents</p>
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
              <p className="stat-label">Successful Runs</p>
              <p className="stat-value text-[var(--accent)]">{toolSuccessCount}</p>
            </article>
            <article className="stat-card">
              <p className="stat-label">Errors To Review</p>
              <p className="stat-value text-[#a33b3b]">{toolErrorCount}</p>
            </article>
          </div>
        </section>
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
    </main>
  );
}
