import type { SupabaseClient } from "@supabase/supabase-js";
import { redactPII } from "@/lib/redact";

export type ResumeSourceArgs = {
  resumeArtifactId?: string;
  resumeDocumentId?: string;
  pastedResumeText?: string;
};

export type ResumeSourceResult = { ok: true; text: string } | { ok: false; error: string; status: number };

/**
 * Resolves the resume a tool should work from: pasted text, a chosen saved
 * resume, a chosen uploaded document, or (when nothing is chosen) the user's
 * most recent targeted resume, falling back to their master resume.
 * The text is PII-scrubbed before it is returned.
 */
export async function loadResumeText(supabase: SupabaseClient, userId: string, args: ResumeSourceArgs): Promise<ResumeSourceResult> {
  let text = args.pastedResumeText ?? "";

  if (!text && args.resumeArtifactId) {
    const { data, error } = await supabase
      .from("resume_artifacts")
      .select("content")
      .eq("id", args.resumeArtifactId)
      .eq("user_id", userId)
      .single();
    if (error || !data) return { ok: false, error: "That saved resume could not be found.", status: 404 };
    text = data.content ?? "";
  }

  if (!text && args.resumeDocumentId) {
    const { data, error } = await supabase
      .from("documents")
      .select("extracted_text,text_extracted")
      .eq("id", args.resumeDocumentId)
      .eq("user_id", userId)
      .single();
    if (error || !data) return { ok: false, error: "That document could not be found.", status: 404 };
    if (!data.text_extracted || !data.extracted_text) {
      return { ok: false, error: "That document is still being read. Try again in a moment.", status: 400 };
    }
    text = data.extracted_text;
  }

  if (!text) {
    for (const types of [["targeted_resume"], ["master_resume", "master_bullets"]]) {
      const { data } = await supabase
        .from("resume_artifacts")
        .select("content")
        .eq("user_id", userId)
        .in("artifact_type", types)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.content && data.content.trim().length >= 100) {
        text = data.content;
        break;
      }
    }
  }

  if (!text || text.trim().length < 100) {
    return { ok: false, error: "Choose a saved resume or paste the resume you are applying with.", status: 400 };
  }

  return { ok: true, text: redactPII(text).text.slice(0, 40000) };
}
