import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { previewEnabled, toolLinkVisible } from "@/lib/tools/preview";
import { toolGroups, toolLabels, type ChecksState, type ToolCard } from "@/lib/tools/registry";

// ─── Types ────────────────────────────────────────────────────────────

type ArtifactRow = { artifact_type: string };
type RunRow = { tool_name: string; status: string; created_at: string };

type PipelineStep = {
  phase: string;
  title: string;
  description: string;
  href: string;
  status: "complete" | "active" | "pending";
  ctaLabel: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ─── Sub-components ───────────────────────────────────────────────────

function ToolCardUI({ tool, checks }: { tool: ToolCard; checks: ChecksState }) {
  return (
    <article className="subtle-panel flex flex-col gap-3 p-5">
      <h3 className="font-bold text-base leading-tight">{tool.title}</h3>
      <p className="text-sm text-[var(--muted)] leading-relaxed">{tool.desc}</p>
      {tool.requirements?.length ? (
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
          <p className="text-xs font-bold tracking-[0.12em] uppercase text-[var(--muted)]">You&apos;ll need</p>
          <ul className="mt-2 space-y-1.5 text-sm text-[var(--muted)]">
            {tool.requirements.map((r) => {
              const met = r.check ? checks[r.check] : undefined;
              return (
                <li key={r.text} className="flex gap-2">
                  {met === undefined ? (
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden />
                  ) : met ? (
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-bold text-white" aria-label="Done">
                      ✓
                    </span>
                  ) : (
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--panel)]" aria-label="Not yet" />
                  )}
                  <span className={met ? "text-[var(--foreground)]" : undefined}>{r.text}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        <Link href={tool.href} className="btn btn-primary text-sm">
          Open Tool
        </Link>
      </div>
    </article>
  );
}

function ToolGroup({
  kicker,
  title,
  description,
  tools,
  checks,
}: {
  kicker: string;
  title: string;
  description: string;
  tools: ToolCard[];
  checks: ChecksState;
}) {
  return (
    <section className="tool-section">
      <div>
        <p className="tool-kicker">{kicker}</p>
        <h2 className="section-title mt-1">{title}</h2>
        <p className="section-description">{description}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {tools.map((tool) => (
          <ToolCardUI key={tool.href} tool={tool} checks={checks} />
        ))}
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────

export default async function ToolsPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [artifactsRes, recentRunsRes, docsRes, profileRes, uploadedMasterRes] = await Promise.all([
    supabase
      .from("resume_artifacts")
      .select("artifact_type")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("tool_runs")
      .select("tool_name, status, created_at")
      .eq("user_id", user.id)
      // One row per member action, not the internal calls inside it (see lib/usage-limit.ts)
      .is("input_json->>_step", null)
      // Chat follow-up questions are not tool runs (lib/chat/limit.ts)
      .is("input_json->>_chat", null)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("text_extracted", true)
      // A chat saved to My Files is not a record
      .neq("doc_type", "CHAT_TRANSCRIPT"),
    supabase.from("profiles").select("id, full_name, mos").eq("id", user.id).maybeSingle(),
    // An uploaded master resume counts the same as one MilVector built
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("doc_type", "MASTER_RESUME")
      .eq("text_extracted", true),
  ]);

  const artifacts: ArtifactRow[] = artifactsRes.data ?? [];
  const recentRuns: RunRow[] = recentRunsRes.data ?? [];
  const extractedDocCount = docsRes.count ?? 0;

  const uploadedMasterCount = uploadedMasterRes.count ?? 0;
  const masterResumeCount =
    artifacts.filter((a) => a.artifact_type === "master_resume" || a.artifact_type === "master_bullets").length +
    uploadedMasterCount;
  const targetedResumeCount = artifacts.filter((a) => a.artifact_type === "targeted_resume").length;

  const hasSources = extractedDocCount > 0;
  const hasMasterResume = masterResumeCount > 0;
  const hasTargetedResume = targetedResumeCount > 0;
  const checks: ChecksState = {
    sources: hasSources,
    master: hasMasterResume,
    profile: !!profileRes.data,
  };

  const pipelineSteps: PipelineStep[] = [
    {
      phase: "Step 1",
      title: "Upload Your Records",
      description: "Add FITREPs, EVALs, JST, VMET, and any award Summaries of Action so the AI has your real experience to work from.",
      href: "/app/documents",
      status: hasSources ? "complete" : "active",
      ctaLabel: hasSources ? `Manage your ${extractedDocCount} records` : "Upload Records",
    },
    {
      phase: "Step 2",
      title: "Build Your Master Resume",
      description:
        "Turn your records into one master resume that every other tool builds on. Already have one? Upload it in My Files as a Master Resume and it counts too.",
      href: "/app/tools/fitrep-bullets",
      status: hasMasterResume ? "complete" : hasSources ? "active" : "pending",
      ctaLabel: hasMasterResume ? "Open Tool" : "Build Master Resume",
    },
    {
      phase: "Step 3",
      title: "Target a Real Job",
      description: "See how you fit the posting first, then get a resume tailored to it from your master resume.",
      href: "/app/tools/resume-targeter",
      status: hasTargetedResume ? "complete" : hasMasterResume ? "active" : "pending",
      ctaLabel: hasTargetedResume ? "Run Again" : "Target a Job",
    },
    {
      phase: "Step 4",
      title: "Build Your LinkedIn",
      description: "Turn your master resume into a complete LinkedIn profile, section by section.",
      href: "/app/tools/linkedin-builder",
      status: hasMasterResume ? "active" : "pending",
      ctaLabel: "Open Builder",
    },
  ];

  const heroStrip = [
    { value: String(extractedDocCount), label: "Records ready to use" },
    { value: String(masterResumeCount), label: "Master resumes built" },
    { value: String(targetedResumeCount), label: "Targeted resumes saved" },
    { value: recentRuns.length > 0 ? "Active" : "Ready", label: "Workspace status" },
  ];

  return (
    <main className="page-shell">

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="page-hero-dark">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker-pill">TOOLS</p>
            <h1 className="page-title">
              Four steps from military record{" "}
              <span className="gradient-text">to civilian career.</span>
            </h1>
            <p className="page-description">
              Upload your records, build your master resume, then aim it at real jobs and LinkedIn. Each step makes the next one better.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/app/tools/fitrep-bullets" className="btn btn-primary text-sm">
                Build Master Resume
              </Link>
              <Link href="/app/documents" className="btn btn-hero-ghost text-sm">
                Upload Records
              </Link>
            </div>
          </div>
          <aside className="page-hero-aside relative z-10">
            <p className="page-hero-aside-title">THE ORDER THAT WORKS</p>
            <ul className="page-hero-list">
              <li>Upload your records first, so the AI works from your real experience</li>
              <li>Build your master resume before targeting jobs</li>
              <li>Then build targeted resumes and prep for interviews</li>
              <li>Use the decision tools for big benefits choices like SBP and VA ratings</li>
            </ul>
          </aside>
        </div>

        {/* Workspace stats strip */}
        <div className="hero-trust-strip -mx-7 -mb-7 mt-6">
          <div className="grid grid-cols-2 sm:grid-cols-4">
            {heroStrip.map((item) => (
              <div key={item.label} className="hero-trust-item flex-col items-start gap-0.5">
                <span className="text-base font-bold text-white">{item.value}</span>
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.50)" }}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Your progress ──────────────────────────────────────────── */}
      <section className="tool-section">
        <div>
          <p className="tool-kicker">YOUR PROGRESS</p>
          <h2 className="section-title mt-1">Where you are in the four steps</h2>
          <p className="section-description">
            Do the steps in order, because each one makes the next one better.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {pipelineSteps.map((step, idx) => (
            <Link
              key={step.href}
              href={step.href}
              className={[
                "group flex flex-col gap-3 rounded-xl border p-4 transition-all duration-150",
                "hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5",
                step.status === "complete"
                  ? "border-[color-mix(in_oklab,var(--accent)_40%,var(--line)_60%)] bg-[color-mix(in_oklab,var(--accent-soft)_35%,var(--surface)_65%)]"
                  : step.status === "active"
                  ? "border-[var(--accent)] bg-[var(--panel)] shadow-[var(--shadow-sm)]"
                  : "border-[var(--line)] bg-[var(--surface)] opacity-60 pointer-events-none",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-disabled={step.status === "pending"}
              tabIndex={step.status === "pending" ? -1 : undefined}
            >
              {/* Step header */}
              <div className="flex items-center justify-between gap-2">
                <span
                  className={[
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    step.status === "complete" || step.status === "active"
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--line)] text-[var(--muted)]",
                  ].join(" ")}
                  aria-hidden
                >
                  {step.status === "complete" ? "✓" : idx + 1}
                </span>
                {step.status === "active" && (
                  <span className="tool-badge tool-badge-success" style={{ fontSize: "0.65rem" }}>
                    Next Up
                  </span>
                )}
                {step.status === "complete" && (
                  <span className="tool-badge tool-badge-success" style={{ fontSize: "0.65rem" }}>
                    Done
                  </span>
                )}
              </div>

              {/* Step content */}
              <div>
                <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                  {step.phase}
                </p>
                <p className="mt-0.5 text-sm font-bold leading-tight">{step.title}</p>
              </div>
              <p className="text-sm leading-relaxed text-[var(--muted)]">{step.description}</p>

              {/* CTA label */}
              <span
                className={[
                  "mt-auto text-xs font-semibold",
                  step.status === "pending" ? "text-[var(--muted)]" : "text-[var(--accent)]",
                ].join(" ")}
              >
                {step.ctaLabel} →
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Recent Activity ────────────────────────────────────────── */}
      {recentRuns.length > 0 && (
        <section className="tool-section">
          <div className="flex items-center justify-between gap-4">
            <p className="tool-kicker">RECENT ACTIVITY</p>
            <span className="text-xs text-[var(--muted)]">Last {recentRuns.length} runs</span>
          </div>
          <div className="grid gap-0.5">
            {recentRuns.map((run, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-4 rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--surface)]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      run.status === "success" ? "bg-[var(--accent)]" : "bg-[#e85858]"
                    }`}
                    aria-hidden
                  />
                  <span className="truncate text-sm font-medium">
                    {toolLabels[run.tool_name] ?? run.tool_name}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={`tool-badge ${
                      run.status === "success" ? "tool-badge-success" : "tool-badge-error"
                    }`}
                  >
                    {run.status === "success" ? "Done" : "Failed"}
                  </span>
                  <span className="text-xs text-[var(--muted)]">{relativeTime(run.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Tool groups ────────────────────────────────────────────── */}
      {toolGroups.map((group) => (
        <ToolGroup
          key={group.kicker}
          {...group}
          tools={group.tools.filter((tool) => (tool.isPreview ? previewEnabled(tool.href, user.email) : toolLinkVisible(tool.href, user.email)))}
          checks={checks}
        />
      ))}
    </main>
  );
}
