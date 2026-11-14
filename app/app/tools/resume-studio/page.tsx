import { notFound } from "next/navigation";
import { ResumeStudio } from "@/components/resume-studio";
import { resumeStudioEnabled } from "@/lib/resume/studio-access";
import { supabaseServer } from "@/lib/supabase/server";

export default async function ResumeStudioPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !resumeStudioEnabled(user.email)) notFound();

  return (
    <main className="page-shell">
      <section className="page-hero-dark">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker-pill">RESUME STUDIO · PREVIEW</p>
            <h1 className="page-title">
              A resume where every line <span className="gradient-text">traces back to your record.</span>
            </h1>
            <p className="page-description">
              The next version of the Master and Targeted Resume Builders. It reads every document you uploaded, records each
              accomplishment with its source, and checks every bullet and figure in your resume against that record.
            </p>
          </div>
          <aside className="page-hero-aside relative z-10">
            <p className="page-hero-aside-title">WHAT IS CHECKED</p>
            <ul className="page-hero-list">
              <li>Every bullet cites an accomplishment in your record</li>
              <li>Every number matches the source document</li>
              <li>No clearance, degree, or certification you do not hold</li>
              <li>No tools or systems your record never mentions</li>
            </ul>
          </aside>
        </div>
      </section>

      <ResumeStudio />
    </main>
  );
}
