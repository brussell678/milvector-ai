import Link from "next/link";

const principles = [
  {
    title: "Connected Workspace",
    detail: "MilVector is designed so your profile, documents, AI outputs, timeline, and saved artifacts reinforce each other instead of living in separate tools.",
  },
  {
    title: "Trust-First Access",
    detail: "The platform is free to use. Email sign-in helps protect the tools from bot abuse, control AI operating costs, and give members a secure way to return to saved work.",
  },
  {
    title: "Military-To-Civilian Translation",
    detail: "The goal is not to flatten service experience. It is to translate leadership, operations, and mission outcomes into language civilian employers understand quickly.",
  },
  {
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

export default function PlatformPage() {
  return (
    <main className="page-shell">
      <section className="page-hero">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker">WHY MILVECTOR</p>
            <h1 className="page-title">A transition workspace built to feel reliable, connected, and mission-oriented.</h1>
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
      </section>

      <section className="section-card">
        <h2 className="section-title">What Makes It Different</h2>
        <p className="section-description">MilVector is not meant to be a generic AI wrapper or another job board with military branding on top.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {principles.map((item) => (
            <article key={item.title} className="subtle-panel p-5">
              <h3 className="text-lg font-bold">{item.title}</h3>
              <p className="mt-2 text-sm text-[var(--muted)]">{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-card">
        <h2 className="section-title">How Access And AI Usage Work</h2>
        <p className="section-description">MilVector is designed to be transparent about how the platform works and why some workflows live inside the product while others open in ChatGPT.</p>
        <ul className="mt-4 space-y-3 text-sm text-[var(--muted)]">
          {trustPoints.map((point) => (
            <li key={point}>- {point}</li>
          ))}
        </ul>
      </section>

      <section className="section-card">
        <h2 className="section-title">Start With The Core System</h2>
        <p className="section-description">The best MilVector experience starts when your profile, source records, and foundation outputs are all in place before you begin targeting roles.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/login" className="btn btn-primary">
            Open Workspace
          </Link>
          <Link href="/tools" className="btn btn-secondary">
            Review Tools
          </Link>
          <Link href="/donate" className="btn btn-secondary">
            Support The Platform
          </Link>
        </div>
      </section>
    </main>
  );
}
