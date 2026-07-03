import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { daysUntilDate, phaseFromDays, phaseMonthFromDays, TIMELINE_MARKERS } from "@/lib/timeline";
import { getLibraryLinkFallbacks, getTransitionTaskFallbacks, mergeDashboardTasks, mergeLibraryLinks } from "@/lib/transition-data";
import { PhaseObjectives } from "@/components/dashboard/PhaseObjectives";
import type { DashboardLink, DashboardTask } from "@/components/dashboard/types";

function nextStep(profileExists: boolean, hasSourceDocuments: boolean, hasMasterResume: boolean, hasTargetedResume: boolean) {
  if (!profileExists) return { href: "/app/profile", label: "Complete your profile" };
  if (!hasSourceDocuments) return { href: "/app/documents", label: "Upload your military records" };
  if (!hasMasterResume) return { href: "/app/tools/fitrep-bullets", label: "Build your master resume" };
  if (!hasTargetedResume) return { href: "/app/tools/resume-targeter", label: "Build a resume for a real job" };
  return { href: "/app/library", label: "Review your saved work" };
}

export default async function DashboardPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;
  if (!user.user_metadata?.onboarded) redirect("/welcome");

  const [profileRes, artifactsRes, docsCountRes, sourceDocsCountRes, toolRunsCountRes, toolSuccessCountRes, toolErrorCountRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("resume_artifacts").select("artifact_type").eq("user_id", user.id),
    supabase.from("documents").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .in("doc_type", ["FITREP", "EVAL", "VMET", "JST", "LINKEDIN_PROFILE", "OTHER"]),
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
  const sourceDocumentsCount = sourceDocsCountRes.count ?? 0;
  const hasSourceDocuments = sourceDocumentsCount > 0;
  const step = nextStep(!!profileRes.data, hasSourceDocuments, hasMasterResume, hasTargetedResume);
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
    hasSourceDocuments,
    hasMasterResume,
    hasTargetedResume,
    daysUntilEas !== null,
  ].filter(Boolean).length;
  const workflowHealthItems = [
    { label: "Profile saved", value: profileRes.data ? "Done" : "Not yet" },
    { label: "Military records uploaded", value: hasSourceDocuments ? "Done" : "Not yet" },
    { label: "Master resume built", value: hasMasterResume ? "Done" : "Not yet" },
    { label: "Targeted resume built", value: hasTargetedResume ? "Done" : "Not yet" },
    { label: "Education & certs added", value: String(educationProfileSignals) },
  ];
  const activityItems = [
    { label: "Documents", value: documentsCount },
    { label: "Master Resumes", value: masterResumeCount },
    { label: "Targeted Resumes", value: targetedResumesCount },
    { label: "Times Tools Used", value: toolRunsCount },
    { label: "Finished Successfully", value: toolSuccessCount, valueClass: "text-[var(--accent)]" },
    { label: "Didn't Finish", value: toolErrorCount, valueClass: "text-[#a33b3b]" },
  ];

  // Brand-new workspace: no uploads, no saved work, no tool runs yet.
  // Show the path forward instead of a wall of zeros.
  const isNewUser = documentsCount === 0 && artifactRows.length === 0 && toolRunsCount === 0;

  if (isNewUser) {
    const profileMos: string = profileRes.data?.mos ?? "";
    const translatorHref = profileMos
      ? `/app/tools/mos-translator?mos=${encodeURIComponent(profileMos)}`
      : "/app/tools/mos-translator";
    const startSteps = [
      {
        step: "1",
        title: "See your experience translated",
        detail: profileMos
          ? `Your MOS (${profileMos}) is already loaded. One click shows the civilian jobs that match it.`
          : "Enter your MOS and see the civilian jobs that match your experience.",
        href: translatorHref,
        cta: "Translate my experience",
        primary: true,
      },
      {
        step: "2",
        title: "Upload your records",
        detail: "FITREPs, EVALs, JST, or VMET — the AI builds from your real record, not a template.",
        href: "/app/documents",
        cta: "Upload records",
        primary: false,
      },
      {
        step: "3",
        title: "Build your master resume",
        detail: "One master resume, built from your records. Every other tool uses it.",
        href: "/app/tools/fitrep-bullets",
        cta: "Open the builder",
        primary: false,
      },
      {
        step: "4",
        title: "Go after a real job",
        detail: "Decode a posting, build a targeted resume, and prep for the interview.",
        href: "/app/tools/resume-targeter",
        cta: "Target a job",
        primary: false,
      },
    ];

    return (
      <main className="page-shell">
        <section className="page-hero">
          <div className="page-hero-grid">
            <div className="relative z-10">
              <p className="page-kicker">WELCOME ABOARD</p>
              <h1 className="page-title">Your next career starts with one click.</h1>
              <p className="page-description">
                No forms, no homework — start by seeing what your military experience is worth in the civilian world. The rest of the path builds from there.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href={translatorHref} className="btn btn-primary">
                  Translate my experience
                </Link>
                <Link href="/app/timeline" className="btn btn-secondary">
                  See my timeline
                </Link>
              </div>
            </div>
            <aside className="page-hero-aside">
              <p className="page-hero-aside-title">{daysUntilEas !== null ? "YOUR COUNTDOWN" : "ONE MORE THING"}</p>
              {daysUntilEas !== null ? (
                <>
                  <p className="mt-3 text-4xl font-extrabold leading-tight text-[var(--accent)]">{daysUntilEas}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">days until EAS. Your timeline is already tracking it.</p>
                </>
              ) : (
                <p className="mt-3 text-sm text-[var(--muted)]">
                  Add your EAS date in your <Link href="/app/profile" className="font-semibold text-[var(--accent)] underline">Profile</Link> and this becomes a live countdown with a phase-by-phase plan.
                </p>
              )}
            </aside>
          </div>
        </section>

        <section className="section-card">
          <h2 className="section-title">The path, start to finish</h2>
          <p className="section-description">Four steps. Do them in order — each one makes the next one better.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {startSteps.map((item) => (
              <article
                key={item.step}
                className={`flex flex-col gap-3 rounded-xl border p-4 ${
                  item.primary
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-[var(--shadow-sm)]"
                    : "border-[var(--line)] bg-[var(--surface)]"
                }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                    item.primary ? "bg-[var(--accent)] text-white" : "bg-[var(--line)] text-[var(--muted)]"
                  }`}
                  aria-hidden
                >
                  {item.step}
                </span>
                <div>
                  <p className="text-sm font-bold leading-tight">{item.title}</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">{item.detail}</p>
                </div>
                <Link
                  href={item.href}
                  className={`mt-auto text-xs font-semibold ${item.primary ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}
                >
                  {item.cta} →
                </Link>
              </article>
            ))}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="page-hero">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker">MISSION CONTROL</p>
            <h1 className="page-title">Your transition, one page: where you stand and what to do next.</h1>
            <p className="page-description">
              Check in here to see your progress, your next step, and where you are on the road to EAS.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={step.href} className="btn btn-primary">
                {step.label}
              </Link>
              <Link href="/app/tools" className="btn btn-secondary">
                Open the tools
              </Link>
            </div>
          </div>
          <aside className="page-hero-aside">
            <p className="page-hero-aside-title">DO THIS NEXT</p>
            <p className="mt-3 text-2xl font-extrabold leading-tight">{step.label}</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {hasMasterResume
                ? hasTargetedResume
                  ? "Your core documents are built. Keep working the timeline and check your saved work."
                  : "Your master resume is ready. Next: aim it at a real job."
                : hasSourceDocuments
                  ? "Your records are in. Now build the master resume everything else uses."
                  : "Start by uploading your records — FITREPs, EVALs, JST, or VMET — so the AI works from your real experience."}
            </p>
          </aside>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr,0.85fr]">
        <section className="section-card">
          <h2 className="section-title">Where You Stand</h2>
          <p className="section-description">Your phase, your countdown, and how much of the setup is done.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <article className="stat-card">
              <p className="stat-label">Current Phase</p>
              <p className="mt-3 text-2xl font-extrabold leading-tight">{currentPhase}</p>
            </article>
            <article className="stat-card">
              <p className="stat-label">Days Until EAS</p>
              <p className="mt-3 text-2xl font-extrabold leading-tight">{daysUntilEas === null ? "Set in Profile" : daysUntilEas}</p>
            </article>
            <article className="stat-card">
              <p className="stat-label">Setup Steps</p>
              <p className="mt-3 text-2xl font-extrabold leading-tight text-[var(--accent)]">{timelineReadiness}/5</p>
              <p className="mt-2 text-xs text-[var(--muted)]">steps done</p>
            </article>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1.1fr]">
            <article className="stat-card">
              <p className="stat-label">Do This Next</p>
              <p className="mt-3 text-2xl font-extrabold leading-tight">{step.label}</p>
              <Link href={step.href} className="btn btn-primary mt-4 w-full sm:w-auto">
                Start
              </Link>
            </article>
            <article className="stat-card">
              <p className="stat-label">Your Checklist</p>
              <div className="mt-4 grid gap-3">
                {workflowHealthItems.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
                    <span className="text-sm text-[var(--muted)]">{item.label}</span>
                    <span className="text-sm font-semibold">{item.value}</span>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>

        <section className="section-card">
          <h2 className="section-title">Your Saved Work</h2>
          <p className="section-description">What you&apos;ve built and saved so far.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {activityItems.map((item) => (
              <article key={item.label} className="stat-card">
                <p className="stat-label">{item.label}</p>
                <p className={`stat-value ${item.valueClass ?? ""}`}>{item.value}</p>
              </article>
            ))}
          </div>
        </section>
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
    </main>
  );
}
