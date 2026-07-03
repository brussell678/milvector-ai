import { FeedbackForm } from "@/components/feedback-form";

const trustStrip = [
  { label: "Bug reports" },
  { label: "Feature ideas" },
  { label: "Tool requests" },
  { label: "Status tracked" },
];

export default function AppFeedbackPage() {
  return (
    <main className="page-shell">
      <section className="page-hero-dark">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker-pill">SUPPORT CENTER</p>
            <h1 className="page-title">
              Report issues, request features, and track every case to resolution.
            </h1>
            <p className="page-description">
              Submit bugs, product suggestions, and platform questions. The MilVector team responds
              within 48 hours — your case stays visible here so nothing gets lost.
            </p>
          </div>
          <aside className="page-hero-aside">
            <p className="page-hero-aside-title">BEST SUPPORT REQUESTS</p>
            <ul className="page-hero-list">
              <li>What you were trying to do</li>
              <li>What happened instead</li>
              <li>What outcome would have helped most</li>
              <li>Screenshots when they clarify the issue</li>
            </ul>
          </aside>
        </div>
        <div className="hero-trust-strip -mx-7 -mb-7 mt-6">
          <div className="grid grid-cols-2 sm:grid-cols-4">
            {trustStrip.map((item) => (
              <div key={item.label} className="hero-trust-item">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: "#39a67f" }}
                  aria-hidden="true"
                />
                <span className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.65)" }}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <FeedbackForm />
    </main>
  );
}
