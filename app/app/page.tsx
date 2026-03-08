import { supabaseServer } from "@/lib/supabase/server";
import { daysUntilDate, phaseFromDays, phaseMonthFromDays, TIMELINE_MARKERS } from "@/lib/timeline";
import { PhaseObjectives } from "@/components/dashboard/PhaseObjectives";
import type { DashboardLink, DashboardTask } from "@/components/dashboard/types";

function nextStep(profileExists: boolean, hasMasterResume: boolean, hasTargetedResume: boolean) {
  if (!profileExists) return { href: "/app/profile", label: "Complete profile" };
  if (!hasMasterResume) return { href: "/app/tools/fitrep-bullets", label: "Build master resume" };
  if (!hasTargetedResume) return { href: "/app/tools/resume-targeter", label: "Create targeted resume" };
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
    <main className="space-y-4">
      <section className="panel p-5">
        <h2 className="font-bold">Transition Timeline</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-7">
          {TIMELINE_MARKERS.map((marker) => {
            const active = daysUntilEas !== null && daysUntilEas <= marker * 30;
            return (
              <article
                key={marker}
                className={`rounded-md border p-3 text-center ${active ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)]"}`}
              >
                <p className="text-lg font-bold">{marker === 0 ? "Final" : `${marker}m`}</p>
                <p className="text-xs text-[var(--muted)]">Checkpoint</p>
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
        <article className="panel p-5">
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)]">Documents Uploaded</p>
          <p className="mt-2 text-3xl font-extrabold">{documentsCount}</p>
        </article>
        <article className="panel p-5">
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)]">Master Resumes</p>
          <p className="mt-2 text-3xl font-extrabold">{masterResumeCount}</p>
        </article>
        <article className="panel p-5">
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)]">Targeted Resumes</p>
          <p className="mt-2 text-3xl font-extrabold">{targetedResumesCount}</p>
        </article>
        <article className="panel p-5">
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)]">Tool Runs</p>
          <p className="mt-2 text-3xl font-extrabold">{toolRunsCount}</p>
        </article>
        <article className="panel p-5">
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)]">Tool Successes</p>
          <p className="mt-2 text-3xl font-extrabold text-[var(--accent)]">{toolSuccessCount}</p>
        </article>
        <article className="panel p-5">
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)]">Tool Errors</p>
          <p className="mt-2 text-3xl font-extrabold text-[#a33b3b]">{toolErrorCount}</p>
        </article>
      </section>
    </main>
  );
}
