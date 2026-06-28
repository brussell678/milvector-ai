import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

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

type ToolCard = {
  href: string;
  title: string;
  desc: string;
  requirements?: string[];
  gptHref?: string;
  isExternal?: boolean;
};

// ─── Static tool data ─────────────────────────────────────────────────

const foundationTools: ToolCard[] = [
  {
    href: "/app/tools/fitrep-bullets",
    title: "Master Resume Generator",
    desc: "Turn uploaded military records into a reusable civilian career foundation for applications, LinkedIn positioning, and planning.",
    requirements: [
      "Upload source records such as FITREPs, EVALs, JST, or VMET.",
      "Review the output and save the strongest version to your Library.",
    ],
    gptHref: "https://chatgpt.com/g/g-69d5982e578c819184c2e96ec1c81bbb-milvector-master-resume-generator",
  },
  {
    href: "/app/tools/linkedin-builder",
    title: "LinkedIn Profile Builder",
    desc: "Turn a master resume into a stronger LinkedIn presence with career-path suggestions, profile sections, networking guidance, and banner support.",
    requirements: [
      "Have a saved or pasted master resume available.",
      "Select target role, industry, and location strategy.",
      "Use this when you want positioning and networking support, not just resume output.",
    ],
  },
];

const applicationTools: ToolCard[] = [
  {
    href: "/app/tools/resume-targeter",
    title: "Targeted Resume Engine",
    desc: "Generate a role-specific resume and supporting application output from your career foundation plus a real job description.",
    requirements: [
      "Have a saved master resume in your Library.",
      "Complete and save your Profile.",
      "Paste the full target job posting before generating output.",
    ],
    gptHref: "https://chatgpt.com/g/g-697c169088588191bce63407d421f5b0-milvector-ai-targeted-resume-builder",
  },
  {
    href: "/app/tools/jd-decoder",
    title: "Job Description Decoder",
    desc: "Break a job posting into requirements, signals, decision points, and interview focus areas before you apply.",
  },
  {
    href: "https://chatgpt.com/g/g-69b9fc23c88c81919a3cd53ffcbe1b1a-milvector-ai-interview-strategist",
    title: "Job Interview Strategist",
    desc: "Prepare for interviews with structured role, company, and resume-based practice and feedback. Turn on voice mode for mock interview realism.",
    requirements: [
      "Bring the specific job title and full job description.",
      "Have the company name available.",
      "Provide the resume you want the interview prep based on.",
    ],
    isExternal: true,
  },
];

const translationTools: ToolCard[] = [
  {
    href: "/app/tools/mos-translator",
    title: "MOS Translator",
    desc: "Map MOS experience to civilian roles, language, and next-step career pathways.",
  },
];

const decisionTools: ToolCard[] = [
  {
    href: "https://chatgpt.com/g/g-69b6925c39308191b477586de0b7e6ac-va-c-p-rating-navigator-gpt",
    title: "VA C&P Rating Navigator",
    desc: "Guided disability rating walkthroughs with the VA C&P Rating Navigator GPT.",
    requirements: ["Bring your claimed conditions, symptoms, and any rating decisions or medical evidence you want to review."],
    isExternal: true,
  },
  {
    href: "https://chatgpt.com/g/g-69b75fcfb8d881918bd6c8a092bdb899-milvector-ai-military-sbp-decision-advisor",
    title: "Military SBP Decision Advisor",
    desc: "Guided Survivor Benefit Plan decision support with the SBP Decision Advisor GPT.",
    requirements: ["Have your retirement timing, family situation, and SBP decision factors available before you start."],
    isExternal: true,
  },
];

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

const toolLabels: Record<string, string> = {
  fitrep_bullets: "Master Resume",
  mos_translator: "MOS Translator",
  jd_decoder: "JD Decoder",
  resume_targeter: "Resume Targeter",
  linkedin_builder: "LinkedIn Builder",
};

// ─── Sub-components ───────────────────────────────────────────────────

function ToolCardUI({ tool }: { tool: ToolCard }) {
  return (
    <article className="subtle-panel flex flex-col gap-3 p-5">
      <h3 className="font-bold text-base leading-tight">{tool.title}</h3>
      <p className="text-sm text-[var(--muted)] leading-relaxed">{tool.desc}</p>
      {tool.requirements?.length ? (
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
          <p className="text-xs font-bold tracking-[0.12em] uppercase text-[var(--muted)]">Before you start</p>
          <ul className="mt-2 space-y-1.5 text-sm text-[var(--muted)]">
            {tool.requirements.map((r) => (
              <li key={r} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden />
                {r}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        {tool.isExternal ? (
          <a href={tool.href} className="btn btn-secondary text-sm" target="_blank" rel="noreferrer">
            Open GPT
          </a>
        ) : (
          <Link href={tool.href} className="btn btn-primary text-sm">
            Open Tool
          </Link>
        )}
        {tool.gptHref && (
          <a href={tool.gptHref} className="btn btn-secondary text-sm" target="_blank" rel="noreferrer">
            GPT Link
          </a>
        )}
      </div>
    </article>
  );
}

function ToolGroup({
  kicker,
  title,
  description,
  tools,
}: {
  kicker: string;
  title: string;
  description: string;
  tools: ToolCard[];
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
          <ToolCardUI key={tool.href} tool={tool} />
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

  const [artifactsRes, recentRunsRes, docsRes] = await Promise.all([
    supabase
      .from("resume_artifacts")
      .select("artifact_type")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("tool_runs")
      .select("tool_name, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("text_extracted", true),
  ]);

  const artifacts: ArtifactRow[] = artifactsRes.data ?? [];
  const recentRuns: RunRow[] = recentRunsRes.data ?? [];
  const extractedDocCount = docsRes.count ?? 0;

  const masterResumeCount = artifacts.filter(
    (a) => a.artifact_type === "master_resume" || a.artifact_type === "master_bullets"
  ).length;
  const targetedResumeCount = artifacts.filter((a) => a.artifact_type === "targeted_resume").length;

  const hasSources = extractedDocCount > 0;
  const hasMasterResume = masterResumeCount > 0;
  const hasTargetedResume = targetedResumeCount > 0;

  const pipelineSteps: PipelineStep[] = [
    {
      phase: "Step 1",
      title: "Upload Source Records",
      description: "Extract FITREPs, EVALs, JST, and VMET so the AI has strong raw material to work from.",
      href: "/app/documents",
      status: hasSources ? "complete" : "active",
      ctaLabel: hasSources ? `${extractedDocCount} extracted — manage` : "Upload Records",
    },
    {
      phase: "Step 2",
      title: "Build Master Resume",
      description: "Turn your service records into a civilian career foundation every other tool pulls from.",
      href: "/app/tools/fitrep-bullets",
      status: hasMasterResume ? "complete" : hasSources ? "active" : "pending",
      ctaLabel: hasMasterResume ? "Open Tool" : "Generate Foundation",
    },
    {
      phase: "Step 3",
      title: "Target Roles",
      description: "Title research, posting analysis, and a go/no-go checkpoint before generating a targeted resume.",
      href: "/app/tools/resume-targeter",
      status: hasTargetedResume ? "complete" : hasMasterResume ? "active" : "pending",
      ctaLabel: hasTargetedResume ? "Run Again" : "Target a Role",
    },
    {
      phase: "Step 4",
      title: "Build LinkedIn Presence",
      description: "Convert your master resume into a targeted LinkedIn profile with headline and section drafts.",
      href: "/app/tools/linkedin-builder",
      status: hasMasterResume ? "active" : "pending",
      ctaLabel: "Open Builder",
    },
  ];

  const heroStrip = [
    { value: String(extractedDocCount), label: "Source records extracted" },
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
            <p className="page-kicker-pill">TOOLSET</p>
            <h1 className="page-title">
              Use MilVector as a guided workflow,{" "}
              <span className="gradient-text">not a pile of disconnected tools.</span>
            </h1>
            <p className="page-description">
              Start with source records, build your foundation, then move into targeted applications and LinkedIn. Every output feeds the next step.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/app/tools/fitrep-bullets" className="btn btn-primary text-sm">
                Build Foundation
              </Link>
              <Link href="/app/documents" className="btn btn-hero-ghost text-sm">
                Manage Documents
              </Link>
            </div>
          </div>
          <aside className="page-hero-aside relative z-10">
            <p className="page-hero-aside-title">RECOMMENDED FLOW</p>
            <ul className="page-hero-list">
              <li>Translate and organize your source material first</li>
              <li>Build your career foundation before targeting roles</li>
              <li>Move into job-specific application and interview tools next</li>
              <li>Use decision tools when a major life or benefits choice is on the table</li>
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

      {/* ── Your Workflow pipeline ─────────────────────────────────── */}
      <section className="tool-section">
        <div>
          <p className="tool-kicker">YOUR WORKFLOW</p>
          <h2 className="section-title mt-1">Where you are in the transition pipeline</h2>
          <p className="section-description">
            Complete steps in order for the strongest downstream results. Each step feeds the next.
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
              <p className="text-xs leading-relaxed text-[var(--muted)]">{step.description}</p>

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
                    {run.status}
                  </span>
                  <span className="text-xs text-[var(--muted)]">{relativeTime(run.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── How to choose ─────────────────────────────────────────── */}
      <details className="tool-section">
        <summary className="list-none cursor-pointer">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="tool-kicker">GUIDANCE</p>
              <h2 className="section-title mt-0.5">Integrated tools vs. GPT links</h2>
            </div>
            <svg
              className="details-chevron shrink-0 text-[var(--muted)]"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </summary>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <article className="subtle-panel p-5">
            <p className="tool-kicker">INTEGRATED MILVECTOR TOOLS</p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              These run inside MilVector using our API-backed workflow so outputs stay connected to your profile, documents, library, and export path.
            </p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden />
                Best when you want saved outputs, structured workflows, and cleaner exportable document handling.
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden />
                Strongest choice when continuity inside the MilVector workspace matters.
              </li>
            </ul>
          </article>
          <article className="subtle-panel p-5">
            <p className="tool-kicker">GPT LINKS</p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              These open custom GPTs in your own ChatGPT account — useful when you want a more conversational back-and-forth inside ChatGPT.
            </p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden />
                Uses your ChatGPT account rather than MilVector&apos;s API budget.
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden />
                Does not automatically save work into MilVector documents, library, or export flows.
              </li>
            </ul>
          </article>
        </div>
      </details>

      {/* ── Tool groups ────────────────────────────────────────────── */}
      <ToolGroup
        kicker="STEP 1 + 2"
        title="Build Your Foundation"
        description="Start here for the strongest overall system behavior. These tools create the baseline material that supports every later workflow."
        tools={foundationTools}
      />
      <ToolGroup
        kicker="STEP 3"
        title="Apply With Precision"
        description="Use these when you have a real job target, need role-specific materials, or are preparing for interviews."
        tools={applicationTools}
      />
      <ToolGroup
        kicker="EXPLORE"
        title="Translate And Explore"
        description="Use these when you are still clarifying target roles, civilian language, or the shape of your next move."
        tools={translationTools}
      />
      <ToolGroup
        kicker="DECIDE"
        title="Evaluate Major Decisions"
        description="These tools support benefits and retirement-related choices that have longer-term consequences."
        tools={decisionTools}
      />
    </main>
  );
}
