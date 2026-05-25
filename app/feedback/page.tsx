import { FeedbackForm } from "@/components/feedback-form";
import { PageContainer } from "@/components/layout/page-container";

export default function FeedbackPage() {
  return (
    <PageContainer className="page-shell" size="lg">
      <section className="page-hero">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker">SUPPORT</p>
            <h1 className="page-title">Reach the MilVector support center without losing the case trail.</h1>
            <p className="page-description">
              Submit bugs, improvement ideas, and platform issues here. Your request stays visible so you can track status and review follow-up in one place.
            </p>
          </div>
          <aside className="page-hero-aside">
            <p className="page-hero-aside-title">BEST REQUESTS INCLUDE</p>
            <ul className="page-hero-list">
              <li>What you were trying to do</li>
              <li>What happened instead</li>
              <li>What outcome would have helped most</li>
              <li>Any screenshot that makes the issue clearer</li>
            </ul>
          </aside>
        </div>
      </section>
      <FeedbackForm />
    </PageContainer>
  );
}
