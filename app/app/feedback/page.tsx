import { FeedbackForm } from "@/components/feedback-form";

export default function AppFeedbackPage() {
  return (
    <main className="page-shell">
      <section className="page-hero">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker">SUPPORT CENTER</p>
            <h1 className="page-title">Report issues, suggest improvements, and track what happens next.</h1>
            <p className="page-description">
              Use the support center to submit bugs, product suggestions, and mission-impact feedback. Your submissions stay visible here so you can track status and review any follow-up from the MilVector team.
            </p>
          </div>
          <aside className="page-hero-aside">
            <p className="page-hero-aside-title">BEST SUPPORT REQUESTS</p>
            <ul className="page-hero-list">
              <li>What you were trying to do</li>
              <li>What happened instead</li>
              <li>What outcome would have helped most</li>
              <li>Attach screenshots when they clarify the issue</li>
            </ul>
          </aside>
        </div>
      </section>
      <FeedbackForm />
    </main>
  );
}
