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
    <PageContainer className="py-6 sm:py-8 lg:py-10" size="lg">

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="panel overflow-hidden">
        <div className="grid gap-8 p-8 md:grid-cols-[1.2fr_0.8fr] md:p-12">

          {/* Left: headline + subhead + CTAs */}
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3 fade-up">
              <Image
                src="/assets/milvector-ai-logo-transparent.png"
                alt="MilVector AI logo"
                width={48}
                height={48}
                className="object-contain"
              />
              <span className="inline-flex rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold tracking-wide text-[var(--accent)]">
                MILVECTOR AI
              </span>
            </div>

            <h1
              className="text-4xl font-extrabold tracking-tight text-balance md:text-5xl fade-up"
              style={{ animationDelay: "60ms" }}
            >
              Find the vector to your next career.
            </h1>

            <p
              className="max-w-xl text-lg text-[var(--muted)] fade-up"
              style={{ animationDelay: "120ms" }}
            >
              Career translation, job targeting, and transition planning — AI-powered and built for service members.
            </p>

            <div
              className="flex flex-wrap gap-3 fade-up"
              style={{ animationDelay: "180ms" }}
            >
              <Link href="/auth" className="btn btn-primary w-full sm:w-auto">
                Open Workspace
              </Link>
              <Link href="#how-it-works" className="btn btn-secondary w-full sm:w-auto">
                How It Works
              </Link>
            </div>
          </div>

          {/* Right: 2×2 bento outcomes */}
          <aside aria-label="What you get" className="subtle-panel p-4">
            <p className="section-kicker">WHAT YOU GET</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {outcomeItems.map((item) => (
                <div key={item.label} className="panel flex flex-col gap-1.5 p-3">
                  <item.Icon size={18} className="text-[var(--accent)]" aria-hidden="true" />
                  <p className="text-sm font-bold leading-tight">{item.label}</p>
                  <p className="text-xs leading-snug text-[var(--muted)]">{item.detail}</p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      {/* ── Features: Diagonal Bento ───────────────────────────── */}
      <section className="mt-6 observe-fade" aria-label="Platform features">
        <div className="grid gap-3 md:grid-cols-3">

          {/* Hero tile: Connected system — spans 2 cols */}
          <article className="bento-hero-tile card-hover flex flex-col gap-4 p-6 md:col-span-2">
            <Layers size={22} className="text-[var(--accent)]" aria-hidden="true" />
            <div>
              <h3 className="text-base font-bold">Connected transition system</h3>
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

      {/* ── How It Works ───────────────────────────────────────── */}
      <section id="how-it-works" className="section-card mt-6 scroll-mt-28 observe-fade">
        <p className="section-kicker">THE PROCESS</p>
        <h2 className="section-title mt-1">How It Works</h2>
        <p className="section-description">
          MilVector is designed as a connected transition system — each step strengthens the next instead of forcing you to start over.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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

      {/* ── Example Transformation ─────────────────────────────── */}
      <section className="section-card mt-6 observe-fade">
        <p className="section-kicker">IN PRACTICE</p>
        <h2 className="section-title mt-1">Example Transformation</h2>
        <p className="section-description">
          The goal is not to erase military experience — it is to translate it into language hiring managers can understand quickly.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
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

      {/* ── Mission ────────────────────────────────────────────── */}
      <section className="section-card mt-6 observe-fade">
        <p className="section-kicker">WHY WE BUILT IT</p>
        <h2 className="section-title mt-1">Mission</h2>
        <p className="section-description">
          MilVector AI was created to help service members translate military experience into civilian careers with more clarity, less repetition, and better continuity between planning, documents, and action.
        </p>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Built by Marines for service members. The goal is a trust-first workspace that feels closer to mission planning software than a generic job site.
        </p>
      </section>

    </PageContainer>
  );
}
