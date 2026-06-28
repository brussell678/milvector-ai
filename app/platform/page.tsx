import Link from "next/link";
import { type LucideIcon, Network, ShieldCheck, ArrowRightLeft, Route, Check } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";

type Principle = {
  Icon: LucideIcon;
  title: string;
  detail: string;
};

const principles: Principle[] = [
  {
    Icon: Network,
    title: "Connected Workspace",
    detail: "MilVector is designed so your profile, documents, AI outputs, timeline, and saved artifacts reinforce each other instead of living in separate tools.",
  },
  {
    Icon: ShieldCheck,
    title: "Trust-First Access",
    detail: "The platform is free to use. Email sign-in helps protect the tools from bot abuse, control AI operating costs, and give members a secure way to return to saved work.",
  },
  {
    Icon: ArrowRightLeft,
    title: "Military-To-Civilian Translation",
    detail: "The goal is not to flatten service experience. It is to translate leadership, operations, and mission outcomes into language civilian employers understand quickly.",
  },
  {
    Icon: Route,
    title: "Built For Continuity",
    detail: "MilVector is meant to feel closer to mission planning software than a generic job board, with one operating picture for documents, planning, applications, and support.",
  },
];

const trustPoints = [
  "MilVector is free to use.",
  "Your information is not sold.",
  "Integrated tools use MilVector-paid API calls so results can stay connected to your workspace.",
  "Custom GPT links open in your own ChatGPT account and do not automatically save back into MilVector workflows.",
  "Feedback, moderation, and admin review tools are built into the platform so issues can be tracked and resolved inside the workspace.",
];

const heroStrip = [
  { label: "Connected workspace" },
  { label: "Trust-first access" },
  { label: "MOS translation" },
  { label: "Built for continuity" },
];

export default function PlatformPage() {
  return (
    <PageContainer className="flex flex-col gap-8" size="md">

      {/* ── Dark Hero ──────────────────────────────────────────── */}
      <section className="page-hero-dark">
        <div className="page-hero-grid">
          <div>
            <p className="page-kicker-pill">WHY MILVECTOR</p>
            <h1 className="page-title">
              A transition workspace built to feel{" "}
              <span className="gradient-text">reliable, connected,</span>
              {" "}and mission-oriented.
            </h1>
            <p className="page-description">
              MilVector brings together planning, records, AI workflows, document outputs, community input, and decision support in one platform so service members do not have to rebuild the process from scratch at every step.
            </p>
          </div>
          <aside className="page-hero-aside">
            <p className="page-hero-aside-title">TRUST LAYER</p>
            <ul className="page-hero-list">
              <li>Free access for service members</li>
              <li>Email sign-in instead of passwords</li>
              <li>No selling user information</li>
              <li>Connected workflow between tools and saved outputs</li>
            </ul>
          </aside>
        </div>

        {/* 4-principle strip — negative margins cancel card padding, flush to edges */}
        <div className="hero-trust-strip -mx-7 -mb-7 mt-6">
          <div className="grid grid-cols-2 sm:grid-cols-4">
            {heroStrip.map((item) => (
              <div key={item.label} className="hero-trust-item">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: "#39a67f" }}
                  aria-hidden="true"
                />
                <span
                  className="text-sm font-medium"
                  style={{ color: "rgba(255,255,255,0.65)" }}
                >
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What Makes It Different ────────────────────────────── */}
      <section className="section-card observe-fade">
        <p className="section-kicker">THE DIFFERENCE</p>
        <h2 className="section-title mt-1">What Makes It Different</h2>
        <p className="section-description">
          MilVector is not meant to be a generic AI wrapper or another job board with military branding on top.
        </p>
      </section>

      {/* ── 4 Principles Grid ──────────────────────────────────── */}
      <section className="grid gap-4 md:grid-cols-2 observe-fade">
        {principles.map((item) => (
          <article key={item.title} className="section-card card-hover">
            <item.Icon size={20} className="text-[var(--accent)]" aria-hidden="true" />
            <h3 className="mt-3 text-lg font-bold" style={{ letterSpacing: "-0.015em" }}>
              {item.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{item.detail}</p>
          </article>
        ))}
      </section>

      {/* ── Access & AI Transparency ───────────────────────────── */}
      <section className="section-card observe-fade">
        <p className="section-kicker">TRANSPARENCY</p>
        <h2 className="section-title mt-1">How Access And AI Usage Work</h2>
        <p className="section-description">
          MilVector is designed to be transparent about how the platform works and why some workflows live inside the product while others open in ChatGPT.
        </p>
        <ul className="mt-5 space-y-2.5 text-sm text-[var(--muted)]">
          {trustPoints.map((point) => (
            <li key={point} className="flex items-start gap-2">
              <Check
                size={14}
                className="mt-0.5 shrink-0 text-[var(--accent)]"
                aria-hidden="true"
              />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Dark CTA Band ──────────────────────────────────────── */}
      <section className="cta-band observe-fade">
        <div className="relative z-10 flex flex-col gap-6 p-10 md:flex-row md:items-center md:justify-between md:p-12">
          <div>
            <p
              className="text-xs font-bold uppercase tracking-[0.2em]"
              style={{ color: "#39a67f" }}
            >
              GET STARTED
            </p>
            <h2
              className="mt-2 text-2xl font-extrabold text-white md:text-3xl"
              style={{ letterSpacing: "-0.025em", lineHeight: "1.1" }}
            >
              Ready to start your transition?
            </h2>
            <p
              className="mt-2 max-w-lg text-sm leading-relaxed md:text-base"
              style={{ color: "rgba(255,255,255,0.58)" }}
            >
              The best MilVector experience starts when your profile, records, and foundation outputs are all in one place before you begin targeting roles.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
            <Link href="/auth" className="btn btn-primary px-7 py-3">
              Open Workspace
            </Link>
            <Link href="/donate" className="btn btn-hero-ghost px-7 py-3">
              Support The Platform
            </Link>
          </div>
        </div>
      </section>

    </PageContainer>
  );
}
