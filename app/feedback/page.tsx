import { FeedbackForm } from "@/components/feedback-form";
import { PageContainer } from "@/components/layout/page-container";

const heroStrip = [
  { label: "Bug reports" },
  { label: "Feature ideas" },
  { label: "Platform issues" },
  { label: "Tracked status" },
];

export default function FeedbackPage() {
  return (
    <PageContainer className="flex flex-col gap-6" size="lg">

      {/* ── Dark Hero ──────────────────────────────────────────── */}
      <section className="page-hero-dark">
        <div className="page-hero-grid">
          <div>
            <p className="page-kicker-pill">FEEDBACK & SUPPORT</p>
            <h1 className="page-title">
              Reach the MilVector support center{" "}
              <span className="gradient-text">without losing the case trail.</span>
            </h1>
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

        {/* Request type strip */}
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

      <FeedbackForm />

    </PageContainer>
  );
}
