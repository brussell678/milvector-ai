import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { monthsUntilDate, phaseAnchorMonth, phaseFromMonths, TIMELINE_MARKERS } from "@/lib/timeline";
import { TransitionTaskList } from "@/components/transition-task-list";

function nextStep(profileExists: boolean, hasMasterResume: boolean, hasTargetedResume: boolean) {
  if (!profileExists) return { href: "/app/profile", label: "Complete profile" };
  if (!hasMasterResume) return { href: "/app/tools/fitrep-bullets", label: "Build master resume" };
  if (!hasTargetedResume) return { href: "/app/tools/resume-targeter", label: "Create targeted resume" };
  return { href: "/app/library", label: "Review your library" };
}

type SupportingTaskRow = {
  id: string;
  title: string;
  description: string | null;
  order_index: number;
};

type TransitionTaskRow = {
  id: string;
  title: string;
  description: string | null;
  tool_link: string | null;
  knowledge_article: string | null;
  assistance_type: "tool" | "doc" | "none";
  assistance_ref: string | null;
  assistance_notes: string | null;
  transition_supporting_tasks: SupportingTaskRow[];
};

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
  const monthsUntilEas = monthsUntilDate(easDate);
  const currentPhase = phaseFromMonths(monthsUntilEas);
  const currentPhaseAnchor = phaseAnchorMonth(currentPhase);

  const [tasksRes, completedRes] = await Promise.all([
    supabase
      .from("transition_tasks")
      .select(
        "id,title,description,tool_link,knowledge_article,assistance_type,assistance_ref,assistance_notes,transition_supporting_tasks(id,title,description,order_index)"
      )
      .eq("phase_month", currentPhaseAnchor)
      .eq("task_type", "milestone")
      .order("title", { ascending: true }),
    supabase.from("transition_task_completions").select("task_id").eq("user_id", user.id),
  ]);

  const tasks = (tasksRes.data ?? []) as TransitionTaskRow[];
  const completedTaskIds = (completedRes.data ?? []).map((x) => x.task_id);

  const artifactTypes = new Set((artifactsRes.data ?? []).map((row) => row.artifact_type));
  const hasMasterResume = artifactTypes.has("master_resume") || artifactTypes.has("master_bullets");
  const step = nextStep(!!profileRes.data, hasMasterResume, artifactTypes.has("targeted_resume"));
  const artifactRows = artifactsRes.data ?? [];
  const masterResumeCount = artifactRows.filter((x) => x.artifact_type === "master_resume").length;
  const targetedResumesCount = artifactRows.filter((x) => x.artifact_type === "targeted_resume").length;
  const documentsCount = docsCountRes.count ?? 0;
  const toolRunsCount = toolRunsCountRes.count ?? 0;
  const toolSuccessCount = toolSuccessCountRes.count ?? 0;
  const toolErrorCount = toolErrorCountRes.count ?? 0;

  return (
    <main className="space-y-4">
      <section className="panel p-6">
        <p className="text-xs font-semibold tracking-widest text-[var(--accent)]">MISSION</p>
        <h1 className="mt-1 text-2xl font-bold">Translate your military experience into a civilian career before EAS.</h1>
        <p className="mt-2 text-[var(--muted)]">
          Current Phase: <span className="font-semibold text-[var(--fg)]">{currentPhase}</span>
          {monthsUntilEas === null ? " - set your EAS date in profile to activate timeline guidance." : ` - ${monthsUntilEas} months until EAS`}
        </p>
        <Link className="btn btn-primary mt-4 inline-flex" href={step.href}>
          Next Objective: {step.label}
        </Link>
      </section>

      <section className="panel p-5">
        <h2 className="font-bold">Transition Timeline</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-7">
          {TIMELINE_MARKERS.map((marker) => {
            const active = monthsUntilEas !== null && monthsUntilEas <= marker;
            return (
              <article
                key={marker}
                className={`rounded-md border p-3 text-center ${active ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)]"}`}
              >
                <p className="text-lg font-bold">{marker}</p>
                <p className="text-xs text-[var(--muted)]">Months</p>
              </article>
            );
          })}
        </div>
      </section>

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

      <section className="grid gap-4 md:grid-cols-2">
        <TransitionTaskList tasks={tasks} initialCompletedTaskIds={completedTaskIds} />
        <article className="panel p-5">
          <h2 className="font-bold">Core Workflow</h2>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-[var(--muted)]">
            <li>Complete profile with EAS date</li>
            <li>Upload/extract military source documents</li>
            <li>Build master resume</li>
            <li>Analyze job descriptions</li>
            <li>Create targeted resume</li>
          </ol>
          <h2 className="mt-5 font-bold">Tools</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link className="btn btn-secondary text-sm" href="/app/tools/fitrep-bullets">Master Resume Generator</Link>
            <Link className="btn btn-secondary text-sm" href="/app/tools/mos-translator">MOS Translator</Link>
            <Link className="btn btn-secondary text-sm" href="/app/tools/jd-decoder">Job Description Decoder</Link>
            <Link className="btn btn-secondary text-sm" href="/app/tools/resume-targeter">Targeted Resume Engine</Link>
          </div>
        </article>
      </section>
    </main>
  );
}
