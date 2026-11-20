import { ResumeTargeterClassic } from "@/components/tools/resume-targeter-classic";
import { TargetedResumeBuilder } from "@/components/tools/targeted-resume-builder";
import { targetedResumeV2Enabled } from "@/lib/resume/studio-access";
import { supabaseServer } from "@/lib/supabase/server";

// The Targeted Resume Builder. The rebuilt version (docs/TARGETED_RESUME_PLAN.md)
// shows to admins, or to everyone once TARGETED_RESUME_V2_PUBLIC=true; every
// other member keeps the classic flow until then.
export default async function ResumeTargeterPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!targetedResumeV2Enabled(user?.email)) return <ResumeTargeterClassic />;

  return (
    <main className="page-shell">
      <section className="page-hero-dark">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker-pill">TARGETED RESUME BUILDER</p>
            <h1 className="page-title">
              A resume for one job, <span className="gradient-text">written only from your master.</span>
            </h1>
            <p className="page-description">
              See how you fit before anything is written. Then get a resume tailored to the posting, with every line, figure, and credential checked
              against the master resume you chose.
            </p>
          </div>
          <aside className="page-hero-aside relative z-10">
            <p className="page-hero-aside-title">WHAT IS CHECKED</p>
            <ul className="page-hero-list">
              <li>Every bullet comes from a line in your master</li>
              <li>Every figure matches your master, and you confirm each one</li>
              <li>No degree, certification, or clearance you do not hold</li>
              <li>No tool or system your master never mentions</li>
            </ul>
          </aside>
        </div>
      </section>

      <TargetedResumeBuilder />
    </main>
  );
}
