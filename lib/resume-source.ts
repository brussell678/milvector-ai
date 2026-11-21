import type { SupabaseClient } from "@supabase/supabase-js";
import { masterOptions, type MasterOption } from "@/lib/master-resume";
import { applyCorrections, type MasterCorrection } from "@/lib/resume/corrections";
import { redactPII } from "@/lib/redact";

export { masterOptions, optionForDocument, parseMasterRef, type MasterOption } from "@/lib/master-resume";

// ─── The member's master resume ───────────────────────────────────────
// The choice logic lives in lib/master-resume.ts, which pages can import too.
// These functions read it from the database.

export async function listMasterOptions(supabase: SupabaseClient, userId: string): Promise<MasterOption[]> {
  const [artifacts, documents] = await Promise.all([
    supabase
      .from("resume_artifacts")
      .select("id,title,created_at")
      .eq("user_id", userId)
      .eq("artifact_type", "master_resume")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("documents")
      .select("id,filename,created_at,text_extracted")
      .eq("user_id", userId)
      .eq("doc_type", "MASTER_RESUME")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  return masterOptions((artifacts.data ?? []) as { id: string; title: string; created_at: string }[], (documents.data ?? []) as { id: string; filename: string; created_at: string; text_extracted: boolean }[]);
}

export type MasterChoice = {
  // False before migration 0037: there is nowhere to keep a choice yet.
  canSave: boolean;
  ref: string | null;
  option: MasterOption | null;
  options: MasterOption[];
};

export async function readMasterChoice(supabase: SupabaseClient, userId: string): Promise<MasterChoice> {
  const [profile, options] = await Promise.all([
    supabase.from("profiles").select("master_resume_ref").eq("id", userId).maybeSingle<{ master_resume_ref: string | null }>(),
    listMasterOptions(supabase, userId),
  ]);
  const canSave = !profile.error;
  const ref = canSave ? (profile.data?.master_resume_ref ?? null) : null;
  return { canSave, ref, option: options.find((option) => option.ref === ref) ?? null, options };
}

async function masterText(supabase: SupabaseClient, userId: string, option: MasterOption): Promise<string> {
  if (option.kind === "artifact") {
    const { data } = await supabase.from("resume_artifacts").select("content").eq("id", option.id).eq("user_id", userId).maybeSingle<{ content: string | null }>();
    return data?.content ?? "";
  }
  const { data } = await supabase
    .from("documents")
    .select("extracted_text,text_extracted")
    .eq("id", option.id)
    .eq("user_id", userId)
    .maybeSingle<{ extracted_text: string | null; text_extracted: boolean }>();
  return data?.text_extracted ? (data.extracted_text ?? "") : "";
}

// The member's corrections from the Targeted Resume Builder's review step:
// still open (applied to the text), and already reflected in the master
// they uploaded (resolved, safe to close).
export type MasterCorrections = { open: MasterCorrection[]; resolved: string[] };

export type ChosenMaster =
  | { ok: true; text: string; option: MasterOption; corrections?: MasterCorrections }
  // unsaved: before migration 0037; none: nothing chosen; missing: the chosen
  // one was deleted; not_ready: still being read, or empty.
  | { ok: false; reason: "unsaved" | "none" | "missing" | "not_ready" };

/** The member's open "my master is out of date" corrections, oldest first. Empty before migration 0039. */
export async function openCorrections(supabase: SupabaseClient, userId: string): Promise<MasterCorrection[]> {
  const { data, error } = await supabase
    .from("master_corrections")
    .select("id,kind,old_line,new_line")
    .eq("user_id", userId)
    .eq("kind", "outdated")
    .is("resolved_at", null)
    .order("created_at", { ascending: true });
  return error ? [] : ((data ?? []) as MasterCorrection[]);
}

/** A master's text with the member's open corrections applied, so every tool reads the corrected master. */
async function corrected(supabase: SupabaseClient, userId: string, text: string): Promise<{ text: string; corrections: MasterCorrections }> {
  const all = await openCorrections(supabase, userId);
  if (all.length === 0) return { text, corrections: { open: [], resolved: [] } };
  const result = applyCorrections(text, all);
  return { text: result.text, corrections: { open: all.filter((c) => !result.resolved.includes(c.id)), resolved: result.resolved } };
}

/** The member's chosen master resume, as text, with their corrections applied. Not PII-scrubbed. */
export async function loadChosenMaster(supabase: SupabaseClient, userId: string): Promise<ChosenMaster> {
  const choice = await readMasterChoice(supabase, userId);
  if (!choice.canSave) return { ok: false, reason: "unsaved" };
  if (!choice.ref) return { ok: false, reason: "none" };
  if (!choice.option) return { ok: false, reason: "missing" };
  if (!choice.option.ready) return { ok: false, reason: "not_ready" };
  const raw = await masterText(supabase, userId, choice.option);
  if (raw.trim().length < 100) return { ok: false, reason: "not_ready" };
  const { text, corrections } = await corrected(supabase, userId, raw);
  return { ok: true, text, option: choice.option, corrections };
}

/**
 * One of the member's masters by its ref, as the picker sends it. Lets a
 * tool use the picker's choice even before migration 0037 can save it.
 */
export async function loadMasterByRef(supabase: SupabaseClient, userId: string, ref: string): Promise<ChosenMaster> {
  const option = (await listMasterOptions(supabase, userId)).find((item) => item.ref === ref);
  if (!option) return { ok: false, reason: "missing" };
  if (!option.ready) return { ok: false, reason: "not_ready" };
  const raw = await masterText(supabase, userId, option);
  if (raw.trim().length < 100) return { ok: false, reason: "not_ready" };
  const { text, corrections } = await corrected(supabase, userId, raw);
  return { ok: true, text, option, corrections };
}

export const MASTER_PROBLEM: Record<Exclude<ChosenMaster, { ok: true }>["reason"], string> = {
  unsaved: "Choose a resume to work from.",
  none: "Choose your master resume first. Every resume tool works from the one you pick.",
  missing: "The master resume you chose has been deleted. Choose another one.",
  not_ready: "Your master resume is not ready to use yet. Check it in My Files.",
};

/**
 * Before migration 0037 there is no saved choice, so tools keep their old
 * behavior: the newest saved resume of the given kinds, then the newest
 * uploaded master resume.
 */
export async function newestResumeText(supabase: SupabaseClient, userId: string, artifactTypeGroups: string[][]): Promise<string> {
  for (const types of artifactTypeGroups) {
    const { data } = await supabase
      .from("resume_artifacts")
      .select("content")
      .eq("user_id", userId)
      .in("artifact_type", types)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ content: string | null }>();
    if (data?.content && data.content.trim().length >= 100) return data.content;
  }
  const { data: doc } = await supabase
    .from("documents")
    .select("extracted_text")
    .eq("user_id", userId)
    .eq("doc_type", "MASTER_RESUME")
    .eq("text_extracted", true)
    .not("extracted_text", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ extracted_text: string | null }>();
  return doc?.extracted_text ?? "";
}

// ─── A resume for one run of a tool ───────────────────────────────────

export type ResumeSourceArgs = {
  resumeArtifactId?: string;
  resumeDocumentId?: string;
  pastedResumeText?: string;
};

export type ResumeSourceResult = { ok: true; text: string } | { ok: false; error: string; status: number };

/**
 * Resolves the resume a tool should work from: pasted text, a chosen saved
 * resume, a chosen uploaded document, or, when nothing is given, the
 * member's chosen master resume. There is no silent fallback to whatever was
 * saved last. The text is PII-scrubbed before it is returned.
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
    const chosen = await loadChosenMaster(supabase, userId);
    if (chosen.ok) text = chosen.text;
    else if (chosen.reason === "unsaved") text = await newestResumeText(supabase, userId, [["targeted_resume"], ["master_resume", "master_bullets"]]);
    else return { ok: false, error: MASTER_PROBLEM[chosen.reason], status: 400 };
  }

  if (!text || text.trim().length < 100) {
    return { ok: false, error: "Choose a saved resume or paste the resume you are applying with.", status: 400 };
  }

  return { ok: true, text: redactPII(text).text.slice(0, 40000) };
}
