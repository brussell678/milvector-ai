import Link from "next/link";
import { ResumeChat } from "@/components/chat/resume-chat";
import { TargetedResumeBuilder } from "@/components/tools/targeted-resume-builder";
import { ToolAlert } from "@/components/tools/tool-alert";
import { chatEnabled } from "@/lib/chat/access";
import { CHAT_TOOLS } from "@/lib/chat/tools";
import { loadSavedBuild } from "@/lib/resume/saved-build";
import { supabaseServer } from "@/lib/supabase/server";
import type { SavedFit } from "@/lib/resume/fit-check";

// The Targeted Resume Builder (docs/TARGETED_RESUME_PLAN.md): a resume for one
// job, written only from the member's own master and checked line by line.
//
// Links from other tools land here prefilled: ?title= from the MOS Translator
// sets the job title; ?jd=<run id> from the JD Decoder sets the posting it
// decoded, its job title, and its fit (the member's own run only). ?review=
// <resume id> reopens a saved resume at its line review: a locked download
// sends the member here (docs/CHAT_TOOLS_PLAN.md, D15).
//
// Whoever the chat is open to (the admin first, then members
// once the admin portal opens it) gets the chat view; everyone else gets this
// page, which stays at ?view=classic.
export default async function ResumeTargeterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const params = { title: one(raw.title), jd: one(raw.jd), review: one(raw.review), view: one(raw.view) };
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let initialPosting = "";
  let decodedTitle = "";
  let initialFit: SavedFit | null = null;
  if (user && params.jd && /^[0-9a-f-]{36}$/i.test(params.jd)) {
    const { data } = await supabase.from("tool_runs").select("output_json").eq("id", params.jd).eq("user_id", user.id).maybeSingle<{ output_json: Record<string, unknown> | null }>();
    const out = data?.output_json;
    if (typeof out?._jdText === "string") initialPosting = out._jdText;
    if (typeof out?.job_title === "string") decodedTitle = out.job_title;
    // The JD Decoder's fit, shown again rather than checked twice (one fit answer).
    const fit = out?._fit as SavedFit | undefined;
    if (initialPosting && fit && typeof fit.sourceRef === "string" && Array.isArray(fit.fitMap?.requirements)) initialFit = fit;
  }
  const initialTitle = (typeof params.title === "string" ? params.title : decodedTitle).slice(0, 200);
  const savedReview = user && params.review ? await loadSavedBuild(supabase, user.id, params.review) : null;
  const chat = !!user && (await chatEnabled(CHAT_TOOLS.resume_targeter.key, user.email));

  if (chat && user && params.view !== "classic") {
    return <ResumeChat userId={user.id} initialTitle={initialTitle} initialPosting={initialPosting} initialFit={initialFit} initialReview={savedReview} />;
  }

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

      {chat && (
        <ToolAlert variant="info" title="Try the chat view">
          <p className="text-sm">
            The same builder, as a chat you can ask questions in.{" "}
            <Link href="/app/tools/resume-targeter" className="font-semibold underline">
              Open the chat view
            </Link>
          </p>
        </ToolAlert>
      )}

      <TargetedResumeBuilder
        initialTitle={savedReview?.jobTitle ?? initialTitle}
        initialPosting={savedReview?.posting ?? initialPosting}
        initialCompany={savedReview?.company ?? ""}
        initialFit={initialFit}
        initialBuild={savedReview ? { built: savedReview.built, review: savedReview.review } : null}
      />
    </main>
  );
}
