import type { SupabaseClient } from "@supabase/supabase-js";

// The Targeted Resume Builder's review, as a real lock (docs/CHAT_TOOLS_PLAN.md,
// D15). A resume built from now on is saved with reviewRequired, and every
// line with a figure, or with wording its master does not use, carries a
// reviewed mark once the member marks it Correct or fixes it. Until every
// line is marked, the resume does not download (the builder, My Files, the
// library) and does not go on a business card. Resumes built before this
// change have no reviewRequired and are never locked.

/** Lines still to check in a saved targeted resume; 0 when it is unlocked. */
export function reviewPending(structured: unknown): number {
  const saved = structured && typeof structured === "object" ? (structured as Record<string, unknown>) : null;
  if (!saved || saved.reviewRequired !== true) return 0;
  const checked = saved.checked && typeof saved.checked === "object" ? (saved.checked as { figures?: unknown }) : null;
  const figures = Array.isArray(checked?.figures) ? (checked.figures as { reviewed?: unknown }[]) : [];
  return figures.filter((f) => !f || typeof f.reviewed !== "string" || !f.reviewed).length;
}

/** Where a locked resume sends the member: the builder, open at its review. */
export const reviewPath = (artifactId: string) => `/app/tools/resume-targeter?review=${artifactId}`;

export const REVIEW_LOCKED =
  "Check every line of this resume first. It opens in the Targeted Resume Builder at its review; the Word file downloads once each line is marked.";

/**
 * The reply for a locked download. A link clicked in the browser goes to the
 * resume's review; anything else gets a plain message.
 */
export function lockedReply(req: Request, artifactId: string): Response {
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("text/html")) return Response.redirect(new URL(reviewPath(artifactId), req.url), 303);
  return Response.json({ error: REVIEW_LOCKED, code: "review_locked", review: reviewPath(artifactId) }, { status: 423 });
}

/** Of these targeted resume files, the ones still waiting on their review: document id to artifact id. */
export async function lockedTargetedDocs(supabase: SupabaseClient, userId: string, documentIds: string[]): Promise<Map<string, string>> {
  const locked = new Map<string, string>();
  if (documentIds.length === 0) return locked;
  const { data } = await supabase.from("resume_artifacts").select("id,rendered_document_id,structured_output").eq("user_id", userId).in("rendered_document_id", documentIds);
  for (const row of (data ?? []) as { id: string; rendered_document_id: string | null; structured_output: unknown }[]) {
    if (row.rendered_document_id && reviewPending(row.structured_output) > 0) locked.set(row.rendered_document_id, row.id);
  }
  return locked;
}
