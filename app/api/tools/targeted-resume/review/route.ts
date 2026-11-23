// The Targeted Resume Builder's review step: the member marks a line wrong
// and says which kind of wrong. The line is replaced in the saved resume,
// the Word file is rebuilt, and the correction or report is kept (migration
// 0039). No AI call.
//
//   outdated:  "My master is out of date." The member's corrected line goes
//              in, and every later build applies it until their uploaded
//              master says the same.
//   misstated: "The resume says something my master does not." The master's
//              own line goes back in, and the report is kept for the admin.
//   remove:    a summary sentence the member wants out.
//   correct:   the line is right as it stands. Only the mark is saved, so the
//              review is kept and the resume unlocks when every line has one
//              (lib/resume/review-lock.ts, D15). Nothing else changes.

import { NextResponse } from "next/server";
import { z } from "zod";
import { authReplies, requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { replaceLine } from "@/lib/resume/corrections";
import { cleanPunctuation, pastTense } from "@/lib/resume/gates";
import { figuresIn, type FigureCheck } from "@/lib/resume/targeting";
import { buildTargetedResumeText, isStructuredTargetedResume, renderTargetedResumeDocx } from "@/lib/resume-template";

// Room for the slowest model call (tool timeouts run up to 150 s), as on the other tool routes.
export const maxDuration = 300;

const InputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("correct"), artifactId: z.string().uuid(), text: z.string().min(1).max(2000) }),
  z.object({ action: z.literal("outdated"), artifactId: z.string().uuid(), text: z.string().min(1).max(2000), sourceLine: z.string().min(1).max(2000), newLine: z.string().trim().min(10).max(1000) }),
  z.object({ action: z.literal("misstated"), artifactId: z.string().uuid(), text: z.string().min(1).max(2000), sourceLine: z.string().min(1).max(2000) }),
  z.object({ action: z.literal("remove"), artifactId: z.string().uuid(), text: z.string().min(1).max(2000) }),
]);

async function handlePOST(req: Request) {
  const { userId } = await requireUser();
  const parsed = InputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return NextResponse.json({ error: field === "newLine" ? "Write the corrected line in full (at least a few words)." : "That request was not understood. Refresh the page and try again." }, { status: 400 });
  }
  const input = parsed.data;
  const supabase = await supabaseServer();

  const { data: artifact } = await supabase
    .from("resume_artifacts")
    .select("id,structured_output,rendered_document_id,created_at")
    .eq("id", input.artifactId)
    .eq("user_id", userId)
    .eq("artifact_type", "targeted_resume")
    .maybeSingle<{ id: string; structured_output: Record<string, unknown> | null; rendered_document_id: string | null; created_at: string }>();
  const saved = artifact?.structured_output;
  const sourceRef = typeof saved?.sourceRef === "string" ? saved.sourceRef.slice(0, 80) : null;
  if (!artifact || !saved || saved.engine !== "master-v2" || !isStructuredTargetedResume(saved)) {
    return NextResponse.json({ error: "That resume could not be found. Build it again." }, { status: 404 });
  }

  const same = (a: string, b: string) => a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();
  if (input.action === "correct") {
    const checkedNow = ((artifact.structured_output as Record<string, unknown>).checked ?? {}) as { figures?: (FigureCheck & { reviewed?: string })[] };
    let marked: (FigureCheck & { reviewed?: string }) | null = null;
    const figures = (checkedNow.figures ?? []).map((f) => {
      if (marked || !same(f.text, input.text)) return f;
      marked = { ...f, reviewed: "correct" };
      return marked;
    });
    if (!marked) return NextResponse.json({ error: "That line is no longer in this resume. Refresh the page." }, { status: 409 });
    const { error: markError } = await supabase
      .from("resume_artifacts")
      .update({ structured_output: { ...saved, checked: { ...checkedNow, figures } } })
      .eq("id", artifact.id)
      .eq("user_id", userId);
    if (markError) return NextResponse.json({ error: "That did not save. Try again." }, { status: 500 });
    return NextResponse.json({ ok: true, text: input.text, item: marked, kept: false });
  }

  const replacement =
    input.action === "outdated" ? pastTense(cleanPunctuation(input.newLine)) : input.action === "misstated" ? pastTense(cleanPunctuation(input.sourceLine)) : "";
  const { next, found } = replaceLine(saved, input.text, replacement);
  if (!found) return NextResponse.json({ error: "That line is no longer in this resume. Refresh the page." }, { status: 409 });

  // The checklist item follows the line: its new text, figures, and source.
  const checked = (next.checked ?? {}) as { figures?: FigureCheck[] };
  let item: (FigureCheck & { reviewed?: string }) | null = null;
  checked.figures = (checked.figures ?? []).flatMap((f) => {
    if (!same(f.text, input.text)) return [f];
    if (input.action === "remove") return [];
    item = { place: f.place, text: replacement, figures: figuresIn(replacement), sources: [input.action === "outdated" ? replacement : input.sourceLine], reviewed: input.action };
    return [item];
  });
  next.checked = { ...(next.checked ?? {}), figures: checked.figures };

  // Keep the correction or report. Before migration 0039 there is nowhere to
  // keep it; the resume in hand is still fixed.
  let kept = false;
  if (input.action !== "remove") {
    const { error } = await supabase.from("master_corrections").insert({
      user_id: userId,
      kind: input.action,
      old_line: input.sourceLine,
      new_line: input.action === "outdated" ? cleanPunctuation(input.newLine) : null,
      resume_line: input.text,
      source_ref: sourceRef,
      artifact_id: artifact.id,
    });
    kept = !error;
  }

  // Rebuild the Word file and the saved text from the corrected resume.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,phone_number,professional_email,linkedin_url,location,location_pref,security_clearance")
    .eq("id", userId)
    .maybeSingle();
  const contact = {
    full_name: profile?.full_name ?? null,
    phone_number: profile?.phone_number ?? null,
    professional_email: profile?.professional_email ?? null,
    linkedin_url: profile?.linkedin_url ?? null,
    location: profile?.location ?? profile?.location_pref ?? null,
    security_clearance: profile?.security_clearance ?? null,
  };
  if (!isStructuredTargetedResume(next)) return NextResponse.json({ error: "That change would leave the resume empty." }, { status: 409 });
  const previewText = buildTargetedResumeText({ contact, resume: next });
  if (artifact.rendered_document_id) {
    const { data: doc } = await supabase.from("documents").select("storage_path").eq("id", artifact.rendered_document_id).eq("user_id", userId).maybeSingle<{ storage_path: string }>();
    if (doc?.storage_path) {
      const buffer = await renderTargetedResumeDocx({ contact, resume: next });
      await supabase.storage.from("documents").upload(doc.storage_path, buffer, { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", upsert: true });
      await supabase.from("documents").update({ size_bytes: buffer.byteLength, extracted_text: previewText }).eq("id", artifact.rendered_document_id).eq("user_id", userId);
    }
  }
  const { error: saveError } = await supabase.from("resume_artifacts").update({ content: previewText, structured_output: next }).eq("id", artifact.id).eq("user_id", userId);
  if (saveError) return NextResponse.json({ error: "The change could not be saved. Try again." }, { status: 500 });

  return NextResponse.json({ ok: true, text: replacement, item, kept });
}

export const POST = authReplies(handlePOST);
