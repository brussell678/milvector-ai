import { NextResponse } from "next/server";
import { enforceAiUsageLimit } from "@/lib/usage-limit";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { JdDecoderInputSchema } from "@/lib/validators/tools";
import { generateJson } from "@/lib/llm/client";
import { promptJdDecoder } from "@/lib/llm/prompts";
import { redactPII } from "@/lib/redact";
import { getEnv } from "@/lib/env";
import { loadChosenMaster, newestResumeText } from "@/lib/resume-source";

type PersonalizedFit = {
  assessed_against_resume: boolean;
  overall_fit: string;
  fit_summary: string;
  matched_strengths: string[];
  gaps_to_address: string[];
  honest_recommendation: string;
};

type JdDecoderOutput = {
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
  personalized_fit: PersonalizedFit;
};

function normalizeFit(data: Partial<JdDecoderOutput>, hasResume: boolean): PersonalizedFit {
  const arr = (value: unknown) => (Array.isArray(value) ? value.map((x) => String(x)) : []);
  const fit = (data.personalized_fit ?? {}) as Partial<PersonalizedFit>;
  return {
    assessed_against_resume: hasResume && fit.assessed_against_resume !== false,
    overall_fit: String(fit.overall_fit ?? ""),
    fit_summary: String(fit.fit_summary ?? ""),
    matched_strengths: hasResume ? arr(fit.matched_strengths) : [],
    gaps_to_address: hasResume ? arr(fit.gaps_to_address) : [],
    honest_recommendation: String(fit.honest_recommendation ?? ""),
  };
}

function normalizeOutput(data: Partial<JdDecoderOutput>, hasResume: boolean): JdDecoderOutput {
  const arr = (value: unknown) => (Array.isArray(value) ? value.map((x) => String(x)) : []);
  const confidence = data.role_level_confidence;
  return {
    plain_english_summary: String(data.plain_english_summary ?? ""),
    role_mission_summary: String(data.role_mission_summary ?? ""),
    role_level_guess: (data.role_level_guess as JdDecoderOutput["role_level_guess"]) ?? "Mid",
    role_level_confidence:
      confidence === "low" || confidence === "medium" || confidence === "high" ? confidence : "medium",
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
    personalized_fit: normalizeFit(data, hasResume),
  };
}

// The member's chosen master resume, so the fit read is about them. Returns
// "" when none is chosen (the posting analysis still works). Before migration
// 0037 there is no saved choice, so the newest master resume is used, as before.
async function loadMasterResumeText(supabase: Awaited<ReturnType<typeof supabaseServer>>, userId: string): Promise<string> {
  const chosen = await loadChosenMaster(supabase, userId);
  if (chosen.ok) return chosen.text;
  if (chosen.reason === "unsaved") return newestResumeText(supabase, userId, [["master_resume", "master_bullets"]]);
  return "";
}

export async function POST(req: Request) {
  const { userId, email } = await requireUser();
  const supabase = await supabaseServer();
  const overLimit = await enforceAiUsageLimit({ supabase, userId, email });
  if (overLimit) return overLimit;


  const body = await req.json();
  const parsed = JdDecoderInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const rawMaster = await loadMasterResumeText(supabase, userId);
  const candidateResumeText = rawMaster ? redactPII(rawMaster).text : "";
  const hasResume = candidateResumeText.trim().length >= 100;

  const prompt = promptJdDecoder({
    jobDescriptionText: parsed.data.jobDescriptionText,
    candidateResumeText: hasResume ? candidateResumeText : null,
  });

  const started = Date.now();
  const llm = await generateJson<JdDecoderOutput>(prompt, { model: getEnv().TOOLS_MODEL, timeoutMs: 90000 });
  const latency = Date.now() - started;

  const baseRun = {
    user_id: userId,
    tool_name: "jd_decoder" as const,
    input_json: { jobDescriptionTextLen: parsed.data.jobDescriptionText.length, personalizedFit: hasResume },
    latency_ms: latency,
  };

  if (!llm.ok) {
    await supabase.from("tool_runs").insert({ ...baseRun, status: "error", error_message: llm.error });
    return NextResponse.json({ error: llm.error }, { status: 500 });
  }

  const normalized = normalizeOutput(llm.data, hasResume);

  const { data: runData } = await supabase
    .from("tool_runs")
    .insert({
      ...baseRun,
      status: "success",
      output_json: {
        ...normalized,
        _jdText: parsed.data.jobDescriptionText,
      } as unknown as Record<string, unknown>,
      tokens_in: llm.tokensIn ?? null,
      tokens_out: llm.tokensOut ?? null,
    })
    .select("id")
    .single();

  return NextResponse.json({ ...normalized, runId: runData?.id ?? null });
}
