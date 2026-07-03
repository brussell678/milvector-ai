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
    title: "Master Resume Builder",
    desc: "Turn your uploaded military records into one master resume — the base every other tool builds on.",
    requirements: [
      "Upload records like FITREPs, EVALs, JST, or VMET first.",
      "Review the result and save the best version.",
    ],
    gptHref: "https://chatgpt.com/g/g-69d5982e578c819184c2e96ec1c81bbb-milvector-master-resume-generator",
  },
  {
    href: "/app/tools/linkedin-builder",
    title: "LinkedIn Profile Builder",
    desc: "Turn your master resume into a complete LinkedIn profile — headline, sections, career suggestions, and a banner.",
    requirements: [
      "Have a master resume saved, or be ready to paste one.",
      "Know roughly what role and industry you want.",
    ],
  },
];

const applicationTools: ToolCard[] = [
  {
    href: "/app/tools/resume-targeter",
    title: "Targeted Resume Builder",
    desc: "Build a resume aimed at one specific job, using your master resume plus the real job posting.",
    requirements: [
      "Have a saved master resume.",
      "Save your Profile so your contact info appears on the resume.",
      "Copy the full job posting so you can paste it in.",
    ],
    gptHref: "https://chatgpt.com/g/g-697c169088588191bce63407d421f5b0-milvector-ai-targeted-resume-builder",
  },
  {
    href: "/app/tools/jd-decoder",
    title: "Job Description Decoder",
    desc: "Paste a job posting and see what they really want, what to watch out for, and how well you fit — before you apply.",
  },
  {
    href: "https://chatgpt.com/g/g-69b9fc23c88c81919a3cd53ffcbe1b1a-milvector-ai-interview-strategist",
    title: "Job Interview Strategist",
    desc: "Practice interviews for a real job with feedback. Turn on voice mode for a realistic mock interview.",
    requirements: [
      "Have the job title and full job posting ready.",
      "Know the company name.",
      "Bring the resume you're applying with.",
    ],
    isExternal: true,
  },
];

const translationTools: ToolCard[] = [
  {
    href: "/app/tools/mos-translator",
    title: "MOS Translator",
    desc: "Enter your MOS and see which civilian jobs match your experience — with the words hiring managers use for it.",
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
  fitrep_bullets: "Master Resume Builder",
  mos_translator: "MOS Translator",
  jd_decoder: "Job Description Decoder",
  resume_targeter: "Targeted Resume Builder",
  linkedin_builder: "LinkedIn Profile Builder",
};

// ─── Sub-components ───────────────────────────────────────────────────

function ToolCardUI({ tool }: { tool: ToolCard }) {
  return (
    <article className="subtle-panel flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-bold text-base leading-tight">{tool.title}</h3>
        {tool.isExternal && (
          <span className="tool-badge tool-badge-warn" style={{ fontSize: "0.65rem" }}>
            Opens in ChatGPT
          </span>
        )}
      </div>
      <p className="text-sm text-[var(--muted)] leading-relaxed">{tool.desc}</p>
      {tool.requirements?.length ? (
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
          <p className="text-xs font-bold tracking-[0.12em] uppercase text-[var(--muted)]">You&apos;ll need</p>
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
      {tool.isExternal && (
        <p className="text-xs text-[var(--muted)]">
          Needs a free ChatGPT account. Results are not saved to MilVector — copy anything you want to keep.
        </p>
      )}
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        {tool.isExternal ? (
          <a href={tool.href} className="btn btn-secondary text-sm" target="_blank" rel="noreferrer">
            Open in ChatGPT
          </a>
        ) : (
          <Link href={tool.href} className="btn btn-primary text-sm">
            Open Tool
          </Link>
        )}
        {tool.gptHref && (
          <a
            href={tool.gptHref}
            className="btn btn-secondary text-sm"
            target="_blank"
            rel="noreferrer"
            title="A chat version of this tool. Results are not saved to MilVector."
          >
            ChatGPT version
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
      title: "Upload Your Records",
      description: "Add FITREPs, EVALs, JST, and VMET so the AI has your real experience to work from.",
      href: "/app/documents",
      status: hasSources ? "complete" : "active",
      ctaLabel: hasSources ? `${extractedDocCount} ready — manage` : "Upload Records",
    },
    {
      phase: "Step 2",
      title: "Build Your Master Resume",
      description: "Turn your records into one master resume that every other tool builds on.",
      href: "/app/tools/fitrep-bullets",
      status: hasMasterResume ? "complete" : hasSources ? "active" : "pending",
      ctaLabel: hasMasterResume ? "Open Tool" : "Build Master Resume",
    },
    {
      phase: "Step 3",
      title: "Target a Real Job",
      description: "Research the title, analyze the posting, and decide go or no-go before building the resume.",
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
              <li>Upload your records first — the AI works from your real experience</li>
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
            Do the steps in order — each one makes the next one better.
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

      {/* ── Tool groups ────────────────────────────────────────────── */}
      <ToolGroup
        kicker="STEP 1 + 2"
        title="Build Your Base"
        description="Start here. These build the master resume and LinkedIn profile that everything else uses."
        tools={foundationTools}
      />
      <ToolGroup
        kicker="STEP 3"
        title="Go After Real Jobs"
        description="Use these when you've found a job you want — to understand the posting, build the resume, and prep for the interview."
        tools={applicationTools}
      />
      <ToolGroup
        kicker="EXPLORE"
        title="Figure Out What's Next"
        description="Not sure what civilian job fits? Start here to see your options in plain language."
        tools={translationTools}
      />
      <ToolGroup
        kicker="DECIDE"
        title="Make the Big Calls"
        description="Support for benefits and retirement decisions with long-term consequences — VA ratings and the Survivor Benefit Plan."
        tools={decisionTools}
      />
    </main>
  );
}
