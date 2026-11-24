import type { SupabaseClient } from "@supabase/supabase-js";

// Deleting a member's account, in this order:
//   1. their files in storage, which the database cannot remove,
//   2. prepare_account_deletion (migration 0040): Community posts and
//      support tickets,
//   3. the sign-in record, which removes everything else they own through
//      "on delete cascade" (profile, uploads, resumes, tool history, Timeline
//      progress, business card, invitations with their guests, and the rest).
// It stops at the first failure and says which step failed, so a retry
// starts over cleanly; every step is safe to run twice.

// Buckets that file things under the member's id: <userId>/... (uploads and
// generated resumes, LinkedIn banners, library submissions).
export const USER_FOLDER_BUCKETS = ["documents", "linkedin-banners", "library-submissions"] as const;
const TICKET_BUCKET = "feedback-attachments";
export const REMOVE_BATCH = 100;
const MAX_DEPTH = 3;

// What the member types to confirm. Works for every member, including those
// who only sign in with an emailed link and have no password.
export const CONFIRM_WORD = "DELETE";

export type DeleteStage = "setup" | "files" | "records" | "account";

// A user id that never exists, for checking the cleanup function is installed.
const NOBODY = "00000000-0000-0000-0000-000000000000";
export type DeleteResult = { ok: true; files: number } | { ok: false; stage: DeleteStage; error: string };

/** Every file under a folder in a bucket, a few levels deep. Also used to clear transition records (lib/admin/clear-records.ts). */
export async function listFiles(admin: SupabaseClient, bucket: string, prefix: string, depth = 0): Promise<string[]> {
  if (depth > MAX_DEPTH) return [];
  const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw new Error(`${bucket}: ${error.message}`);
  const out: string[] = [];
  for (const entry of data ?? []) {
    const path = `${prefix}/${entry.name}`;
    // A folder comes back without an id.
    if (entry.id) out.push(path);
    else out.push(...(await listFiles(admin, bucket, path, depth + 1)));
  }
  return out;
}

/** Every stored file that belongs to the member, by bucket. */
export async function collectFiles(admin: SupabaseClient, userId: string): Promise<Record<string, string[]>> {
  const files = new Map<string, Set<string>>([...USER_FOLDER_BUCKETS, TICKET_BUCKET].map((bucket) => [bucket, new Set<string>()]));

  const docs = await admin.from("documents").select("storage_path").eq("user_id", userId);
  if (docs.error) throw new Error(`documents: ${docs.error.message}`);
  for (const row of (docs.data ?? []) as { storage_path: string | null }[]) if (row.storage_path) files.get("documents")!.add(row.storage_path);

  const tickets = await admin.from("feedback").select("attachment_url").eq("user_id", userId);
  if (tickets.error) throw new Error(`feedback: ${tickets.error.message}`);
  for (const row of (tickets.data ?? []) as { attachment_url: string | null }[]) if (row.attachment_url) files.get(TICKET_BUCKET)!.add(row.attachment_url);

  // A sweep of the member's own folders also catches files no row points at.
  for (const bucket of USER_FOLDER_BUCKETS) {
    for (const path of await listFiles(admin, bucket, userId)) files.get(bucket)!.add(path);
  }

  return Object.fromEntries([...files].map(([bucket, paths]) => [bucket, [...paths]]));
}

export async function deleteAccount(admin: SupabaseClient, userId: string): Promise<DeleteResult> {
  // Before touching anything: is migration 0040 installed? Running the cleanup
  // for a user who does not exist changes nothing, and fails if it is missing.
  const probe = await admin.rpc("prepare_account_deletion", { p_user_id: NOBODY });
  if (probe.error) return { ok: false, stage: "setup", error: probe.error.message };

  let files: Record<string, string[]>;
  try {
    files = await collectFiles(admin, userId);
  } catch (error) {
    return { ok: false, stage: "files", error: error instanceof Error ? error.message : String(error) };
  }

  let removed = 0;
  for (const [bucket, paths] of Object.entries(files)) {
    for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
      const batch = paths.slice(i, i + REMOVE_BATCH);
      const { error } = await admin.storage.from(bucket).remove(batch);
      if (error) return { ok: false, stage: "files", error: `${bucket}: ${error.message}` };
      removed += batch.length;
    }
  }

  const prepared = await admin.rpc("prepare_account_deletion", { p_user_id: userId });
  if (prepared.error) return { ok: false, stage: "records", error: prepared.error.message };

  const gone = await admin.auth.admin.deleteUser(userId);
  if (gone.error) return { ok: false, stage: "account", error: gone.error.message };

  return { ok: true, files: removed };
}
