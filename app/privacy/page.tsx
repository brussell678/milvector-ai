import Link from "next/link";

const privacyPoints = [
  {
    title: "Free Access, Limited Data",
    detail:
      "MilVector is designed to stay free for service members. We only collect the information needed to operate the workspace, secure access, save outputs, and support follow-up inside the platform.",
  },
  {
    title: "No Selling User Information",
    detail:
      "MilVector is not built to sell service member information to recruiters, lenders, lead-generation networks, or other third parties. That trust line is intentional.",
  },
  {
    title: "Workspace-Based AI Use",
    detail:
      "Integrated tools use paid API calls so outputs can connect to your MilVector profile, documents, and saved artifacts. GPT links open in your own ChatGPT account and follow that environment instead.",
  },
  {
    title: "Admin Review And Support",
    detail:
      "Support cases, community moderation, and library submissions can be reviewed by the MilVector admin account so issues can be resolved and unsafe content can be managed inside the workspace.",
  },
];

const commitments = [
  "We use email sign-in to reduce bot abuse and protect platform operating costs.",
  "We do not sell your information.",
  "You control what you upload into your workspace.",
  "Community and support content may be reviewed when moderation or resolution is required.",
];

export default function PrivacyPage() {
  return (
    <main className="page-shell">
      <section className="page-hero">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker">PRIVACY</p>
            <h1 className="page-title">A simple privacy posture built around trust, not lead generation.</h1>
            <p className="page-description">
              MilVector exists to help service members transition with more continuity and less friction. The platform is designed to keep that mission ahead of monetizing user data.
            </p>
          </div>
          <aside className="page-hero-aside">
            <p className="page-hero-aside-title">CORE COMMITMENTS</p>
            <ul className="page-hero-list">
              {commitments.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      <section className="section-card">
        <h2 className="section-title">What This Means In Practice</h2>
        <p className="section-description">The goal is to be clear about how MilVector operates without burying people in legal-sounding language.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {privacyPoints.map((item) => (
            <article key={item.title} className="section-card">
              <h3 className="text-lg font-bold">{item.title}</h3>
              <p className="mt-2 text-sm text-[var(--muted)]">{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-card">
        <h2 className="section-title">Questions Before You Sign In?</h2>
        <p className="section-description">If you want the broader platform context first, start with the trust and product overview.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/platform" className="btn btn-secondary">
            How MilVector Works
          </Link>
          <Link href="/login" className="btn btn-primary">
            Open Workspace
          </Link>
        </div>
      </section>
    </main>
  );
}
