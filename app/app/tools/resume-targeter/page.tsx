import { TargetedResumeBuilder } from "@/components/tools/targeted-resume-builder";
import { supabaseServer } from "@/lib/supabase/server";

// The Targeted Resume Builder (docs/TARGETED_RESUME_PLAN.md): a resume for one
// job, written only from the member's own master and checked line by line.
//
// Links from other tools land here prefilled: ?title= from the MOS Translator
// sets the job title; ?jd=<run id> from the JD Decoder sets the posting it
// decoded (the member's own run only).
export default async function ResumeTargeterPage({ searchParams }: { searchParams: Promise<{ title?: string; jd?: string }> }) {
  const params = await searchParams;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let initialPosting = "";
  if (user && params.jd && /^[0-9a-f-]{36}$/i.test(params.jd)) {
    const { data } = await supabase.from("tool_runs").select("output_json").eq("id", params.jd).eq("user_id", user.id).maybeSingle<{ output_json: Record<string, unknown> | null }>();
    const text = data?.output_json?._jdText;
    if (typeof text === "string") initialPosting = text;
  }
  const initialTitle = typeof params.title === "string" ? params.title.slice(0, 200) : "";

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

      <TargetedResumeBuilder initialTitle={initialTitle} initialPosting={initialPosting} />
    </main>
  );
}
