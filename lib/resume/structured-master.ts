// The member's master resume, structured for checking: from the store when
// this version of its text has been structured before (migration 0038),
// otherwise structured now and stored. Server only.

import type { SupabaseClient } from "@supabase/supabase-js";
import { promptMasterStructure } from "@/lib/llm/prompts-resume";
import { recordFromMaster } from "@/lib/resume/master-record";
import { isEvidenceRecord, type EvidenceRecord, type EvidenceSource } from "@/lib/resume/record";
import { contentHash } from "@/lib/resume/targeting";
import { runLoggedJson } from "@/lib/tools/run";

export type StructuredMaster = { record: EvidenceRecord; support: string; supportLines: string[]; dropped: string[]; cached: boolean };

export async function structuredMaster(args: {
  supabase: SupabaseClient;
  userId: string;
  // Already PII-scrubbed.
  text: string;
  sourceRef: string;
  source: EvidenceSource;
  model: string;
  toolName: string;
}): Promise<{ ok: true; master: StructuredMaster } | { ok: false; error: string; status: number }> {
  const hash = contentHash(args.text);
  const { data: stored } = await args.supabase
    .from("master_resume_structures")
    .select("record,support_lines,dropped")
    .eq("user_id", args.userId)
    .eq("content_hash", hash)
    .maybeSingle<{ record: unknown; support_lines: unknown; dropped: unknown }>();
  if (stored && isEvidenceRecord(stored.record)) {
    const supportLines = Array.isArray(stored.support_lines) ? stored.support_lines.map(String) : [];
    return {
      ok: true,
      master: { record: stored.record, support: supportLines.join(" "), supportLines, dropped: Array.isArray(stored.dropped) ? stored.dropped.map(String) : [], cached: true },
    };
  }

  const run = await runLoggedJson<Record<string, unknown>>({
    supabase: args.supabase,
    userId: args.userId,
    toolName: args.toolName,
    inputJson: { engine: "master-v2", stage: "structure", chars: args.text.length },
    // Part of the member's fit or build, not an action of its own.
    step: true,
    prompt: promptMasterStructure({ masterText: args.text }),
    model: args.model,
    timeoutMs: 240000,
    temperature: 0,
    storeOutput: () => null,
  });
  if (!run.ok) return { ok: false, error: run.error, status: 500 };

  const built = recordFromMaster({ raw: run.data, masterText: args.text, source: args.source, builtAt: new Date().toISOString() });
  if (built.record.roles.length === 0) {
    return { ok: false, error: "No jobs could be read from your master resume. Check that it lists your roles with their bullets, then try again.", status: 422 };
  }
  // Best effort: before migration 0038 there is nowhere to keep it, and the
  // next request structures it again.
  await args.supabase.from("master_resume_structures").upsert(
    { user_id: args.userId, content_hash: hash, source_ref: args.sourceRef.slice(0, 80), record: built.record, support_lines: built.supportLines, dropped: built.dropped },
    { onConflict: "user_id,content_hash" },
  );
  return { ok: true, master: { record: built.record, support: built.support, supportLines: built.supportLines, dropped: built.dropped, cached: false } };
}
