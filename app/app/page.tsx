import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { daysUntilDate, phaseFromDays, phaseMonthFromDays } from "@/lib/timeline";
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

  const [profileRes, artifactsRes, docsCountRes, sourceDocsCountRes, toolRunsCountRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("resume_artifacts").select("artifact_type").eq("user_id", user.id),
    supabase.from("documents").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .in("doc_type", ["FITREP", "EVAL", "VMET", "JST", "LINKEDIN_PROFILE", "OTHER"]),
    supabase.from("tool_runs").select("*", { count: "exact", head: true }).eq("user_id", user.id),
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

  const artifactRows = artifactsRes.data ?? [];
  const artifactTypes = new Set(artifactRows.map((row) => row.artifact_type));
  const hasMasterResume = artifactTypes.has("master_resume") || artifactTypes.has("master_bullets");
  const hasTargetedResume = artifactTypes.has("targeted_resume");
  const sourceDocumentsCount = sourceDocsCountRes.count ?? 0;
  const hasSourceDocuments = sourceDocumentsCount > 0;
  const step = nextStep(!!profileRes.data, hasSourceDocuments, hasMasterResume, hasTargetedResume);
  const educationProfileSignals =
    (profileRes.data?.off_duty_education?.length ?? 0) +
    (profileRes.data?.civilian_certifications?.length ?? 0) +
    (profileRes.data?.additional_training?.length ?? 0);
  const masterResumeCount = artifactRows.filter((x) => x.artifact_type === "master_resume").length;
  const targetedResumesCount = artifactRows.filter((x) => x.artifact_type === "targeted_resume").length;
  const documentsCount = docsCountRes.count ?? 0;
  const toolRunsCount = toolRunsCountRes.count ?? 0;
  const tasksDoneCount = completedTaskIds.length;

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
        <section className="page-hero-dark">
          <div className="page-hero-grid">
            <div className="relative z-10">
              <p className="page-kicker-pill">WELCOME ABOARD</p>
              <h1 className="page-title">Your next career starts with one click.</h1>
              <p className="page-description">
                No forms, no homework — start by seeing what your military experience is worth in the civilian world. The rest of the path builds from there.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href={translatorHref} className="btn btn-primary">
                  Translate my experience
                </Link>
                <Link href="/app/timeline" className="btn btn-hero-ghost">
                  See my timeline
                </Link>
              </div>
            </div>
            <aside className="page-hero-aside relative z-10">
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

  // ── Returning user ──────────────────────────────────────────────

  const journeySteps = [
    {
      step: "1",
      title: "Upload Your Records",
      href: "/app/documents",
      status: hasSourceDocuments ? "complete" : "active",
    },
    {
      step: "2",
      title: "Build Your Master Resume",
      href: "/app/tools/fitrep-bullets",
      status: hasMasterResume ? "complete" : hasSourceDocuments ? "active" : "pending",
    },
    {
      step: "3",
      title: "Target a Real Job",
      href: "/app/tools/resume-targeter",
      status: hasTargetedResume ? "complete" : hasMasterResume ? "active" : "pending",
    },
    {
      step: "4",
      title: "Build Your LinkedIn",
      href: "/app/tools/linkedin-builder",
      status: hasMasterResume ? "active" : "pending",
    },
  ] as const;

  const progressItems = [
    { label: "Records uploaded", value: documentsCount },
    { label: "Master resumes", value: masterResumeCount },
    { label: "Targeted resumes", value: targetedResumesCount },
    { label: "Timeline tasks done", value: tasksDoneCount },
    { label: "Education & certs on file", value: educationProfileSignals },
  ];

  return (
    <main className="page-shell">

      {/* ── Hero: the one answer ──────────────────────────────────── */}
      <section className="page-hero-dark">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker-pill">MISSION CONTROL</p>
            <h1 className="page-title">
              Do this next: <span className="gradient-text">{step.label}</span>
            </h1>
            <p className="page-description">
              You&apos;re in the {currentPhase.toLowerCase()} phase. One step at a time — this is the one that moves you forward right now.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={step.href} className="btn btn-primary">
                {step.label}
              </Link>
              <Link href="/app/tools" className="btn btn-hero-ghost">
                Open the tools
              </Link>
            </div>
          </div>
          <aside className="page-hero-aside relative z-10">
            <p className="page-hero-aside-title">{daysUntilEas !== null ? "DAYS UNTIL EAS" : "SET YOUR DATE"}</p>
            {daysUntilEas !== null ? (
              <>
                <p className="mt-3 text-4xl font-extrabold leading-tight text-[var(--accent)]">{daysUntilEas}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {currentPhase} phase · <Link href="/app/timeline" className="font-semibold text-[var(--accent)] underline">see your timeline</Link>
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-[var(--muted)]">
                Add your EAS date in your <Link href="/app/profile" className="font-semibold text-[var(--accent)] underline">Profile</Link> to unlock the countdown and your phase-by-phase plan.
              </p>
            )}
          </aside>
        </div>
      </section>

      {/* ── Journey pipeline ──────────────────────────────────────── */}
      <section className="section-card">
        <h2 className="section-title">Where you are in the four steps</h2>
        <p className="section-description">Do the steps in order — each one makes the next one better.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {journeySteps.map((item, idx) => (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "group flex items-center gap-3 rounded-xl border p-4 transition-all duration-150",
                "hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5",
                item.status === "complete"
                  ? "border-[color-mix(in_oklab,var(--accent)_40%,var(--line)_60%)] bg-[color-mix(in_oklab,var(--accent-soft)_35%,var(--surface)_65%)]"
                  : item.status === "active"
                  ? "border-[var(--accent)] bg-[var(--panel)] shadow-[var(--shadow-sm)]"
                  : "border-[var(--line)] bg-[var(--surface)] opacity-60",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  item.status === "complete" || item.status === "active"
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--line)] text-[var(--muted)]",
                ].join(" ")}
                aria-hidden
              >
                {item.status === "complete" ? "✓" : idx + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold leading-tight">{item.title}</p>
                <p className="mt-0.5 text-xs font-semibold text-[var(--muted)]">
                  {item.status === "complete" ? "Done" : item.status === "active" ? "Up next" : "Later"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── My progress ───────────────────────────────────────────── */}
      <section className="section-card">
        <h2 className="section-title">My Progress</h2>
        <p className="section-description">What you&apos;ve built so far.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {progressItems.map((item) => (
            <article key={item.label} className="stat-card">
              <p className="stat-label">{item.label}</p>
              <p className="stat-value">{item.value}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── This phase's tasks ────────────────────────────────────── */}
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
