import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import {
  type LucideIcon,
  Zap, ArrowRightLeft, Target, FolderOpen,
  Layers, Compass, Search, FileText,
  Upload, Hammer, Crosshair, ListChecks,
} from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";

// ── Types ─────────────────────────────────────────────────────────

type OutcomeItem = {
  Icon: LucideIcon;
  label: string;
  detail: string;
};

type WorkflowStep = {
  step: string;
  Icon: LucideIcon;
  title: string;
  detail: string;
};

// ── Data ──────────────────────────────────────────────────────────

const outcomeItems: OutcomeItem[] = [
  {
    Icon: Zap,
    label: "Quick Start",
    detail: "Transition support ready in under 10 minutes",
  },
  {
    Icon: ArrowRightLeft,
    label: "Career Translation",
    detail: "Civilian language built from your service records",
  },
  {
    Icon: Target,
    label: "Job Targeting",
    detail: "Resumes and applications sharpened per role",
  },
  {
    Icon: FolderOpen,
    label: "Saved Library",
    detail: "Outputs, documents, and tools all in one place",
  },
];

const trustPoints = [
  { label: "Free for service members" },
  { label: "No data sold" },
  { label: "AI-powered workflows" },
  { label: "Built by Marines" },
];

const workflowSteps: WorkflowStep[] = [
  {
    step: "1",
    Icon: Upload,
    title: "Upload your military records",
    detail: "Bring FITREPs, EVALs, JST, VMET, and other source documents into one workspace.",
  },
  {
    step: "2",
    Icon: Hammer,
    title: "Build your career foundation",
    detail: "Turn military experience into civilian-ready resume language and reusable master material.",
  },
  {
    step: "3",
    Icon: Crosshair,
    title: "Target real opportunities",
    detail: "Use job descriptions, interview prep, and decision-support tools to sharpen each next move.",
  },
  {
    step: "4",
    Icon: ListChecks,
    title: "Track the transition timeline",
    detail: "Stay oriented by phase, milestone, and readiness instead of rebuilding the plan from scratch.",
  },
];

// ── Page ──────────────────────────────────────────────────────────

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    code?: string;
    token_hash?: string;
    type?: string;
    next?: string;
    error?: string;
    error_code?: string;
    error_description?: string;
  }>;
}) {
  const params = await searchParams;
  const code = params.code;
  const tokenHash = params.token_hash;
  const type = params.type;
  const next = params.next ?? "/app";
  const authError = params.error;
  const authErrorCode = params.error_code;
  const authErrorDescription = params.error_description;

  if (authError || authErrorCode || authErrorDescription) {
    const query = new URLSearchParams();
    const message =
      authErrorDescription ??
      authErrorCode ??
      authError ??
      "Authentication link is invalid or expired. Request a new magic link.";
    query.set("error", message);
    redirect(`/auth?${query.toString()}`);
  }

  if (code || (tokenHash && type)) {
    const query = new URLSearchParams();
    if (code) query.set("code", code);
    if (tokenHash) query.set("token_hash", tokenHash);
    if (type) query.set("type", type);
    query.set("next", next);
    redirect(`/auth/confirm?${query.toString()}`);
  }

  return (
    <>
      {/* ── Dark Full-Bleed Hero ──────────────────────────────── */}
      <section className="hero-dark">
        <div className="hero-dot-grid" aria-hidden="true" />
        <div className="hero-glow" aria-hidden="true" />
        <div className="hero-glow-2" aria-hidden="true" />

        <div className="relative z-10 mx-auto max-w-7xl px-6 pb-0 pt-12 sm:pt-16 lg:px-12 lg:pt-20">
          <div className="grid gap-10 md:grid-cols-[1.2fr_0.8fr] md:items-center">

            {/* Left: headline + subhead + CTAs */}
            <div className="flex flex-col gap-6">

              {/* Eyebrow pill */}
              <div className="hero-eyebrow-pill fade-up">
                <Image
                  src="/assets/milvector-ai-logo-transparent.png"
                  alt=""
                  width={18}
                  height={18}
                  className="object-contain opacity-90"
                  aria-hidden="true"
                />
                MILVECTOR AI
              </div>

              <h1
                className="fade-up text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl"
                style={{ animationDelay: "60ms", letterSpacing: "-0.03em", lineHeight: "1.04" }}
              >
                Find the vector to your{" "}
                <span className="gradient-text">next career.</span>
              </h1>

              <p
                className="fade-up max-w-xl text-lg leading-relaxed"
                style={{ animationDelay: "120ms", color: "rgba(255,255,255,0.62)" }}
              >
                Career translation, job targeting, and transition planning — AI-powered and built for service members.
              </p>

              <div
                className="fade-up flex flex-wrap gap-3"
                style={{ animationDelay: "180ms" }}
              >
                <Link href="/auth" className="btn btn-primary w-full sm:w-auto">
                  Open Workspace
                </Link>
                <Link href="#how-it-works" className="btn btn-hero-ghost w-full sm:w-auto">
                  How It Works
                </Link>
              </div>
            </div>

            {/* Right: outcome bento — dark-adapted */}
            <aside
              aria-label="What you get"
              className="relative z-10 rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4 fade-up"
              style={{ animationDelay: "90ms" }}
            >
              <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.38)" }}>
                WHAT YOU GET
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {outcomeItems.map((item) => (
                  <div
                    key={item.label}
                    className="flex flex-col gap-1.5 rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-3"
                  >
                    <item.Icon size={18} className="text-[#39a67f]" aria-hidden="true" />
                    <p className="text-sm font-bold leading-tight text-white">{item.label}</p>
                    <p className="text-xs leading-snug" style={{ color: "rgba(255,255,255,0.45)" }}>{item.detail}</p>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </div>

        {/* Trust strip at bottom of hero */}
        <div className="hero-trust-strip mt-10">
          <div className="mx-auto max-w-7xl px-6 lg:px-12">
            <div className="grid grid-cols-2 sm:grid-cols-4">
              {trustPoints.map((point) => (
                <div
                  key={point.label}
                  className="hero-trust-item"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: "#39a67f" }}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.62)" }}>
                    {point.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Below-fold content ────────────────────────────────── */}
      <PageContainer className="py-10 sm:py-12 lg:py-14" size="lg">

        {/* Features: Diagonal Bento */}
        <section className="observe-fade" aria-label="Platform features">
          <div className="grid gap-3 md:grid-cols-3">

            {/* Hero tile: Connected system — spans 2 cols */}
            <article className="bento-hero-tile card-hover flex flex-col gap-4 p-6 md:col-span-2">
              <Layers size={22} className="text-[var(--accent)]" aria-hidden="true" />
              <div>
                <h3 className="text-base font-bold tracking-tight">Connected transition system</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">
                  Your profile, service records, AI tools, and timeline all reinforce each other — no rebuilding the process from scratch at every step.
                </p>
              </div>
            </article>

            {/* MOS Translator */}
            <article className="subtle-panel card-hover flex flex-col gap-3 p-5">
              <Compass size={20} className="text-[var(--accent)]" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-bold">MOS Translator</h3>
                <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                  Map military roles to civilian job titles and career pathways.
                </p>
              </div>
            </article>

            {/* JD Decoder */}
            <article className="subtle-panel card-hover flex flex-col gap-3 p-5">
              <Search size={20} className="text-[var(--accent)]" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-bold">Job Description Decoder</h3>
                <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                  Break any job posting into must-haves, risks, and your application fit score.
                </p>
              </div>
            </article>

            {/* Document workflows — spans 2 cols, mirrors hero */}
            <article className="subtle-panel card-hover flex flex-col gap-3 p-5 md:col-span-2">
              <FileText size={20} className="text-[var(--accent)]" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-bold">Resume & document workflows</h3>
                <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                  Build a master resume, target it per role, and save every output and document to your library.
                </p>
              </div>
            </article>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="section-card mt-10 scroll-mt-28 observe-fade">
          <p className="section-kicker">THE PROCESS</p>
          <h2 className="section-title mt-1">How It Works</h2>
          <p className="section-description">
            MilVector is designed as a connected transition system — each step strengthens the next instead of forcing you to start over.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {workflowSteps.map((item) => (
              <article key={item.step} className="subtle-panel flex flex-col gap-3 p-5">
                {/* Step indicator row */}
                <div className="flex items-center gap-2.5">
                  <span className="step-circle" aria-label={`Step ${item.step}`}>
                    {item.step}
                  </span>
                  <item.Icon
                    size={18}
                    className="text-[var(--accent)] opacity-70"
                    aria-hidden="true"
                  />
                </div>
                {/* Content */}
                <div>
                  <h3 className="font-bold leading-snug">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">
                    {item.detail}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Example Transformation */}
        <section className="section-card mt-10 observe-fade">
          <p className="section-kicker">IN PRACTICE</p>
          <h2 className="section-title mt-1">Example Transformation</h2>
          <p className="section-description">
            The goal is not to erase military experience — it is to translate it into language hiring managers can understand quickly.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <article className="subtle-panel p-5">
              <p className="text-xs font-semibold tracking-[0.18em] text-[var(--muted)]">
                MILITARY VERSION
              </p>
              <p className="mt-3 text-base font-semibold">
                Led 24 Marines maintaining a 100 vehicle fleet with 96% readiness.
              </p>
            </article>
            <article className="subtle-panel border-l-2 border-l-[var(--accent)] p-5">
              <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)]">
                CIVILIAN VERSION
              </p>
              <p className="mt-3 text-base font-semibold">
                Managed a 24-person operations team responsible for fleet sustainment of 100 vehicles while maintaining 96% operational readiness.
              </p>
            </article>
          </div>
        </section>

        {/* Mission */}
        <section className="section-card mt-10 observe-fade">
          <p className="section-kicker">WHY WE BUILT IT</p>
          <h2 className="section-title mt-1">Mission</h2>
          <p className="section-description">
            MilVector AI was created to help service members translate military experience into civilian careers with more clarity, less repetition, and better continuity between planning, documents, and action.
          </p>
          <p className="mt-3 text-sm text-[var(--muted)]">
            Built by Marines for service members. The goal is a trust-first workspace that feels closer to mission planning software than a generic job site.
          </p>
        </section>

        {/* Dark CTA Band */}
        <section className="cta-band mt-10 observe-fade">
          <div className="relative z-10 flex flex-col gap-6 p-10 md:flex-row md:items-center md:justify-between md:p-12">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: "#39a67f" }}>
                GET STARTED
              </p>
              <h2
                className="mt-2 text-2xl font-extrabold text-white md:text-3xl"
                style={{ letterSpacing: "-0.025em", lineHeight: "1.1" }}
              >
                Ready to find your vector?
              </h2>
              <p className="mt-2 max-w-lg text-sm leading-relaxed md:text-base" style={{ color: "rgba(255,255,255,0.58)" }}>
                Connect your records, translate your experience, and build a transition plan that works — all in one workspace.
              </p>
            </div>
            <Link
              href="/auth"
              className="btn btn-primary shrink-0 px-8 py-4 text-base"
            >
              Open Workspace
            </Link>
          </div>
        </section>

      </PageContainer>
    </>
  );
}
