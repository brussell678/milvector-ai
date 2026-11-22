import { NextResponse } from "next/server";
import { enforceAiUsageLimit } from "@/lib/usage-limit";
import { authReplies, requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { JdDecoderInputSchema } from "@/lib/validators/tools";
import { generateJson } from "@/lib/llm/client";
import { promptJdDecoder } from "@/lib/llm/prompts";
import { getEnv } from "@/lib/env";
import { loadChosenMaster, MASTER_PROBLEM } from "@/lib/resume-source";
import { citedLines, masterInfo, openCorrectionList, runFitCheck, structureChosen, type SavedFit } from "@/lib/resume/fit-check";

// The JD Decoder: the posting analysis, and beside it the same fit check the
// Targeted Resume Builder runs, against the member's chosen master. The fit is
// saved with the run so the builder reuses it (one fit answer, D2).
export const maxDuration = 300;
const TOOL = "jd_decoder";

type JdDecoderOutput = {
  job_title: string;
  plain_english_summary: string;
  role_mission_summary: string;
  role_level_guess: "Entry" | "Mid" | "Senior" | "Lead" | "Manager" | "Director";
  role_level_confidence: "low" | "medium" | "high";
  hard_requirements: string[];
  soft_requirements: string[];
  implied_expectations: string[];
  top_must_have_signals: string[];
  ats_keywords_priority: string[];
  company_context_signals: string[];
  fit_risks: string[];
  clarifying_questions: string[];
  interview_focus_areas: string[];
  likely_interview_questions: string[];
};

function normalizeOutput(data: Partial<JdDecoderOutput>): JdDecoderOutput {
  const arr = (value: unknown) => (Array.isArray(value) ? value.map((x) => String(x)) : []);
  const confidence = data.role_level_confidence;
  return {
    job_title: String(data.job_title ?? "").trim().slice(0, 200),
    plain_english_summary: String(data.plain_english_summary ?? ""),
    role_mission_summary: String(data.role_mission_summary ?? ""),
    role_level_guess: (data.role_level_guess as JdDecoderOutput["role_level_guess"]) ?? "Mid",
    role_level_confidence: confidence === "low" || confidence === "medium" || confidence === "high" ? confidence : "medium",
    hard_requirements: arr(data.hard_requirements),
    soft_requirements: arr(data.soft_requirements),
    implied_expectations: arr(data.implied_expectations),
    top_must_have_signals: arr(data.top_must_have_signals),
    ats_keywords_priority: arr(data.ats_keywords_priority),
    company_context_signals: arr(data.company_context_signals),
    fit_risks: arr(data.fit_risks),
    clarifying_questions: arr(data.clarifying_questions),
    interview_focus_areas: arr(data.interview_focus_areas),
    likely_interview_questions: arr(data.likely_interview_questions),
  };
}

// When there is no fit, note says why: NO_MASTER (the page offers to choose
// or build one), or a sentence to show as is.
const NO_MASTER = "no_master";
type FitOutcome = { fit: SavedFit; note: null } | { fit: null; note: string };

async function handlePOST(req: Request) {
  const { userId, email } = await requireUser();
  const supabase = await supabaseServer();
  const overLimit = await enforceAiUsageLimit({ supabase, userId, email });
  if (overLimit) return overLimit;

  const body = await req.json().catch(() => null);
  const parsed = JdDecoderInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Paste the full job posting, at least 100 characters, and try again.", details: parsed.error.flatten() }, { status: 400 });
  const jobDescriptionText = parsed.data.jobDescriptionText;

  // The fit check runs beside the analysis, inside this one action: its AI
  // calls are steps, so the daily limit counts a decode once.
  const fitting = (async (): Promise<FitOutcome> => {
    try {
      const chosen = await loadChosenMaster(supabase, userId);
      if (!chosen.ok) return { fit: null, note: chosen.reason === "none" || chosen.reason === "unsaved" ? NO_MASTER : MASTER_PROBLEM[chosen.reason] };
      const sourceRef = chosen.option.ref;
      const structured = await structureChosen({ supabase, userId, chosen, sourceRef, toolName: TOOL });
      if (!structured.ok) return { fit: null, note: structured.error };
      const { record } = structured.master;
      const fit = await runFitCheck({ supabase, userId, toolName: TOOL, inputJson: { stage: "fit", jdLen: jobDescriptionText.length }, step: true, record, jobTitle: "the job in this posting", jobDescriptionText });
      if (!fit.ok) return { fit: null, note: "Your fit could not be checked this time. The posting analysis is below; run it again to see your fit." };
      return { fit: { sourceRef, master: masterInfo(chosen, structured.master), fitMap: fit.fitMap, cited: citedLines(fit.fitMap, record), corrections: openCorrectionList(chosen) }, note: null };
    } catch {
      return { fit: null, note: "Your fit could not be checked this time. The posting analysis is below; run it again to see your fit." };
    }
  })();

  const started = Date.now();
  const [llm, outcome] = await Promise.all([generateJson<JdDecoderOutput>(promptJdDecoder({ jobDescriptionText }), { model: getEnv().TOOLS_MODEL, timeoutMs: 90000 }), fitting]);
  const latency = Date.now() - started;

  const baseRun = {
    user_id: userId,
    tool_name: TOOL,
    input_json: { jobDescriptionTextLen: jobDescriptionText.length, fitChecked: !!outcome.fit },
    latency_ms: latency,
  };

  if (!llm.ok) {
    await supabase.from("tool_runs").insert({ ...baseRun, status: "error", error_message: llm.error });
    return NextResponse.json({ error: llm.error }, { status: 500 });
  }

  const normalized = normalizeOutput(llm.data);
  const { data: runData } = await supabase
    .from("tool_runs")
    .insert({
      ...baseRun,
      status: "success",
      output_json: { ...normalized, _jdText: jobDescriptionText, ...(outcome.fit ? { _fit: outcome.fit } : {}) } as unknown as Record<string, unknown>,
      tokens_in: llm.tokensIn ?? null,
      tokens_out: llm.tokensOut ?? null,
    })
    .select("id")
    .single();

  return NextResponse.json({ ...normalized, fit: outcome.fit, fitNote: outcome.note, runId: runData?.id ?? null });
}

export const POST = authReplies(handlePOST);
