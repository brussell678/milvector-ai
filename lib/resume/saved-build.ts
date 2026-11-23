import type { SupabaseClient } from "@supabase/supabase-js";
import { summarize, type Finding } from "@/lib/resume/gates";
import { splitProjects } from "@/lib/resume/targeting";
import type { TargetedResume } from "@/lib/resume/build";
import { savedReview, type BuildResult, type ReviewState } from "@/lib/resume/build-result";

// A saved targeted resume reopened at its review (?review=<artifact id>,
// docs/CHAT_TOOLS_PLAN.md 3.6). A locked download sends the member here, so
// the review picks up with the marks already made. The member's own resume
// only, built by the current engine.

export type SavedBuild = {
  built: BuildResult;
  review: Record<number, ReviewState>;
  jobTitle: string;
  company: string;
  posting: string;
};

export async function loadSavedBuild(supabase: SupabaseClient, userId: string, artifactId: string): Promise<SavedBuild | null> {
  if (!/^[0-9a-f-]{36}$/i.test(artifactId)) return null;
  const { data } = await supabase
    .from("resume_artifacts")
    .select("id,structured_output,rendered_document_id,job_title_target,company_target,job_description")
    .eq("id", artifactId)
    .eq("user_id", userId)
    .eq("artifact_type", "targeted_resume")
    .maybeSingle<{ id: string; structured_output: Record<string, unknown> | null; rendered_document_id: string | null; job_title_target: string | null; company_target: string | null; job_description: string | null }>();
  const saved = data?.structured_output;
  const checked = saved?.checked as { resume?: TargetedResume; findings?: Finding[]; figures?: BuildResult["figures"] } | undefined;
  if (!data || !saved || saved.engine !== "master-v2" || !checked?.resume || !data.rendered_document_id) return null;

  const [{ data: doc }, { data: profile }] = await Promise.all([
    supabase.from("documents").select("filename").eq("id", data.rendered_document_id).eq("user_id", userId).maybeSingle<{ filename: string }>(),
    supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle<{ full_name: string | null }>(),
  ]);
  const findings = checked.findings ?? [];
  const figures = checked.figures ?? [];
  const { jobs, projects } = splitProjects(checked.resume);
  return {
    built: {
      master: { name: "your master resume", origin: "", roles: 0, lines: 0, dropped: 0, notes: [] },
      resume: { ...checked.resume, jobs, projects },
      findings,
      gateSummary: summarize(findings),
      figures,
      notes: { summaryRewritten: false, filled: 0, closedGaps: 0 },
      contactMissing: !profile?.full_name?.trim(),
      fileName: doc?.filename ?? "your targeted resume",
      documentId: data.rendered_document_id,
      artifactId: data.id,
    },
    review: savedReview(figures),
    jobTitle: data.job_title_target ?? "",
    company: data.company_target ?? "",
    posting: data.job_description ?? "",
  };
}
