import { FeedbackForm } from "@/components/feedback-form";

export default function AppFeedbackPage() {
  return (
    <main className="page-shell">
      <section className="page-hero">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker">FEEDBACK</p>
            <h1 className="page-title">Tell us what is helping, breaking, or missing.</h1>
            <p className="page-description">
              Share platform suggestions, bug reports, and mission-impact feedback so MilVector can improve where it matters most.
            </p>
          </div>
          <aside className="page-hero-aside">
            <p className="page-hero-aside-title">BEST FEEDBACK</p>
            <ul className="page-hero-list">
              <li>What you were trying to do</li>
              <li>What happened instead</li>
              <li>What outcome would have helped most</li>
            </ul>
          </aside>
        </div>
      </section>
      <FeedbackForm />
    </main>
  );
}