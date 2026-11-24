import type { SupabaseClient } from "@supabase/supabase-js";
import { listFiles, REMOVE_BATCH } from "@/lib/account/delete";

// Clearing a member's transition records (migration 0046; the list Brandon
// approved 2026-11-24). Removed: uploaded records and every file MilVector made
// (My Files), master and targeted resumes, saved chats, tool history, Timeline
// progress, LinkedIn Builder drafts and banners, and the retirement invitation
// with everything on it. Kept: the account and profile, business cards with
// their contacts and attached resume (a copy stored on the card), Community
// posts, library submissions, support tickets, and the notice confirmations.
//
// Files go first, then rows; it stops at the first failure and says where, and
// every step is safe to run again.

// Rows that go, by table. Resumes before files: a resume points at its file
// (on delete set null), so either order works, but this keeps no dangling ids.
export const CLEARED_TABLES = [
  "master_corrections",
  "master_resume_structures",
  "resume_artifacts",
  "documents",
  "tool_runs",
  "transition_task_completions",
  "linkedin_profiles",
  "retirement_invites",
] as const;

// Storage that holds only transition records, in folders named for the member.
const CLEARED_BUCKETS = ["documents", "linkedin-banners"] as const;

export type ClearResult = { ok: true; files: number } | { ok: false; stage: "files" | "records" | "profile"; error: string };

export async function clearTransitionRecords(admin: SupabaseClient, userId: string): Promise<ClearResult> {
  const files = new Map<string, Set<string>>(CLEARED_BUCKETS.map((bucket) => [bucket, new Set<string>()]));
  try {
    const docs = await admin.from("documents").select("storage_path").eq("user_id", userId);
    if (docs.error) throw new Error(`documents: ${docs.error.message}`);
    for (const row of (docs.data ?? []) as Array<{ storage_path: string | null }>) if (row.storage_path) files.get("documents")!.add(row.storage_path);
    for (const bucket of CLEARED_BUCKETS) for (const path of await listFiles(admin, bucket, userId)) files.get(bucket)!.add(path);
  } catch (error) {
    return { ok: false, stage: "files", error: error instanceof Error ? error.message : String(error) };
  }

  let removed = 0;
  for (const [bucket, set] of files) {
    const paths = [...set];
    for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
      const batch = paths.slice(i, i + REMOVE_BATCH);
      const { error } = await admin.storage.from(bucket).remove(batch);
      if (error) return { ok: false, stage: "files", error: `${bucket}: ${error.message}` };
      removed += batch.length;
    }
  }

  for (const table of CLEARED_TABLES) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) return { ok: false, stage: "records", error: `${table}: ${error.message}` };
  }

  const { error } = await admin.from("profiles").update({ records_cleared_at: new Date().toISOString() }).eq("id", userId);
  if (error) return { ok: false, stage: "profile", error: error.message };

  return { ok: true, files: removed };
}
