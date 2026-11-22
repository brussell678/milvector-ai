import type { SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";
import { promptFitMap } from "@/lib/llm/prompts-resume";
import { redactPII } from "@/lib/redact";
import { buildFitMap, type FitMap } from "@/lib/resume/build";
import { recordForPrompt, type EvidenceRecord } from "@/lib/resume/record";
import { structuredMaster, type StructuredMaster } from "@/lib/resume/structured-master";
import type { ChosenMaster } from "@/lib/resume-source";
import { runLoggedJson } from "@/lib/tools/run";

// The fit check: one job posting mapped against the member's master, each
// requirement with the master lines that support it. The Targeted Resume
// Builder and the JD Decoder both use this, so a member gets one fit answer
// across the site (docs/TARGETED_RESUME_PLAN.md, D2). When the member goes
// from the Decoder to the builder, the builder reuses the Decoder's fit.

export type FitMasterInfo = { name: string; origin: string; roles: number; lines: number; dropped: number; notes: string[] };
export type FitCorrection = { id?: string; oldLine: string; newLine: string };
export type FitResult = { master: FitMasterInfo; fitMap: FitMap; cited: Record<string, string>; corrections?: FitCorrection[] };
/** A fit saved with a JD Decoder run, so the builder can reuse it for the same master and posting. */
export type SavedFit = FitResult & { sourceRef: string };

type Chosen = Extract<ChosenMaster, { ok: true }>;

/** The member's master split into roles and lines (cached per version; see structured-master.ts). */
export function structureChosen(args: { supabase: SupabaseClient; userId: string; chosen: Chosen; sourceRef: string; toolName: string }) {
  const { chosen } = args;
  return structuredMaster({
    supabase: args.supabase,
    userId: args.userId,
    text: redactPII(chosen.text).text,
    sourceRef: args.sourceRef,
    source: { documentId: chosen.option.id, filename: chosen.option.name, docType: chosen.option.kind === "document" ? "MASTER_RESUME" : "SAVED_MASTER" },
    model: getEnv().MASTER_STRUCTURE_MODEL,
    toolName: args.toolName,
  });
}

export function masterInfo(chosen: Chosen, structured: StructuredMaster): FitMasterInfo {
  const { record, dropped } = structured;
  return { name: chosen.option.name, origin: chosen.option.origin, roles: record.roles.length, lines: record.stats.accomplishments, dropped: dropped.length, notes: record.openQuestions };
}

export function openCorrectionList(chosen: ChosenMaster): FitCorrection[] {
  return (chosen.ok ? (chosen.corrections?.open ?? []) : []).map((c) => ({ id: c.id, oldLine: c.old_line, newLine: c.new_line ?? "" }));
}

/** The master's own words for each line a fit map cites, so the member sees evidence, not ids. */
export function citedLines(fitMap: FitMap, record: EvidenceRecord): Record<string, string> {
  const lines: Record<string, string> = {};
  for (const role of record.roles) {
    lines[role.id] = [role.title, role.organization, [role.start, role.end].filter(Boolean).join(" - ")].filter(Boolean).join(", ");
    for (const a of role.accomplishments) lines[a.id] = a.text;
  }
  for (const c of record.credentials) lines[c.id] = c.text;
  return Object.fromEntries(fitMap.requirements.flatMap((r) => r.evidence).filter((id) => lines[id]).map((id) => [id, lines[id]]));
}

/** Maps the posting against the record. step: true when it runs inside another tool's action. */
export async function runFitCheck(args: {
  supabase: SupabaseClient;
  userId: string;
  toolName: string;
  inputJson: Record<string, unknown>;
  record: EvidenceRecord;
  jobTitle: string;
  company?: string | null;
  jobDescriptionText: string;
  step?: boolean;
}): Promise<{ ok: true; fitMap: FitMap } | { ok: false; error: string }> {
  const env = getEnv();
  const run = await runLoggedJson<Record<string, unknown>>({
    supabase: args.supabase,
    userId: args.userId,
    toolName: args.toolName,
    inputJson: args.inputJson,
    step: args.step,
    prompt: promptFitMap({ jobTitle: args.jobTitle, company: args.company, jobDescriptionText: args.jobDescriptionText, recordText: recordForPrompt(args.record) }),
    model: env.FIT_CHECK_MODEL ?? env.TARGETED_RESUME_MODEL,
    reasoningEffort: env.FIT_CHECK_EFFORT ?? env.TARGETED_RESUME_EFFORT,
    timeoutMs: 120000,
    temperature: 0.1,
  });
  if (!run.ok) return { ok: false, error: run.error };
  return { ok: true, fitMap: buildFitMap(run.data, args.record) };
}
