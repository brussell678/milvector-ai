import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";

const features = [
  "Transition planning tools built for military-to-civilian moves",
  "MOS Translator for role mapping and civilian career pathways",
  "Job Description Decoder for must-haves, risks, and application prep",
  "Resume, document, and decision-support workflows in one place",
];

const workflowSteps = [
  {
    step: "1",
    title: "Upload your military records",
    detail: "Bring FITREPs, EVALs, JST, VMET, and other source documents into one workspace.",
  },
  {
    step: "2",
    title: "Build your career foundation",
    detail: "Turn military experience into civilian-ready resume language and reusable master material.",
  },
  {
    step: "3",
    title: "Target real opportunities",
    detail: "Use job descriptions, interview prep, and decision-support tools to sharpen each next move.",
  },
  {
    step: "4",
    title: "Track the transition timeline",
    detail: "Stay oriented by phase, milestone, and readiness instead of rebuilding the plan from scratch.",
  },
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; token_hash?: string; type?: string; next?: string; error?: string; error_code?: string; error_description?: string }>;
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
    const message = authErrorDescription ?? authErrorCode ?? authError ?? "Authentication link is invalid or expired. Request a new magic link.";
    query.set("error", message);
    redirect(`/login?${query.toString()}`);
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
    <main className="mx-auto max-w-6xl px-6 py-10 md:px-8">
      <section className="panel overflow-hidden">
        <div className="grid gap-8 p-8 md:grid-cols-[1.2fr_0.8fr] md:p-12">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <Image
                src="/assets/milvector-ai-logo-transparent.png"
                alt="MILVECTOR AI logo"
                width={56}
                height={56}
                className="object-contain"
              />
              <p className="inline-flex rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold tracking-wide text-[var(--accent)]">
                MILVECTOR AI
              </p>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-balance md:text-5xl">
              Find the vector to your next career.
            </h1>
            <p className="max-w-2xl text-lg text-[var(--muted)]">
              AI tools designed to help service members navigate the full transition to civilian life and work, from career translation and job targeting to documents, planning, and decision support.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/login" className="btn btn-primary">
                Lets Go!
              </Link>
              <Link href="#how-it-works" className="btn btn-secondary">
                Learn How It Works
              </Link>
            </div>
          </div>
          <div className="panel hero-outcomes p-6">
            <p className="hero-outcomes-title text-xs font-semibold tracking-widest">WHAT YOU GET</p>
            <ul className="mt-4 space-y-3 text-sm">
              <li>Actionable transition support in under 10 minutes</li>
              <li>Career translation tools built from your service records</li>
              <li>Job-targeting workflows for resumes and applications</li>
              <li>Saved documents, outputs, and support tools in one library</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        {features.map((feature) => (
          <article key={feature} className="panel p-5">
            <p className="font-semibold">{feature}</p>
          </article>
        ))}
      </section>

      <section id="how-it-works" className="section-card mt-6 scroll-mt-28">
        <p className="section-title">How It Works</p>
        <p className="section-description">
          MilVector is designed as a connected transition system, so each step strengthens the next instead of forcing you to start over.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {workflowSteps.map((item) => (
            <article key={item.step} className="subtle-panel p-5">
              <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)]">STEP {item.step}</p>
              <h2 className="mt-2 text-lg font-bold">{item.title}</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-card mt-6">
        <p className="section-title">Example Transformation</p>
        <p className="section-description">
          The goal is not to erase military experience. It is to translate it into civilian language that hiring managers can understand quickly.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <article className="subtle-panel p-5">
            <p className="text-xs font-semibold tracking-[0.18em] text-[var(--muted)]">MILITARY VERSION</p>
            <p className="mt-3 text-base font-semibold">Led 24 Marines maintaining a 100 vehicle fleet with 96% readiness.</p>
          </article>
          <article className="subtle-panel p-5">
            <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)]">CIVILIAN VERSION</p>
            <p className="mt-3 text-base font-semibold">
              Managed a 24-person operations team responsible for fleet sustainment of 100 vehicles while maintaining 96% operational readiness.
            </p>
          </article>
        </div>
      </section>

      <section className="section-card mt-6">
        <p className="section-title">Mission</p>
        <p className="section-description">
          MilVector AI was created to help service members translate military experience into civilian careers with more clarity, less repetition, and better continuity between planning, documents, and action.
        </p>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Built by Marines for service members. The goal is a trust-first workspace that feels closer to mission planning software than a generic job site.
        </p>
      </section>
    </main>
  );
}

