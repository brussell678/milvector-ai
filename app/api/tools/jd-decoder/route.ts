import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { JdDecoderInputSchema } from "@/lib/validators/tools";
import { generateJson } from "@/lib/llm/client";
import { promptJdDecoder } from "@/lib/llm/prompts";

type JdDecoderOutput = {
  plain_english_summary: string;
  role_mission_summary: string;
  role_level_guess: "Entry" | "Mid" | "Senior" | "Lead" | "Manager" | "Director";
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
  return {
    plain_english_summary: String(data.plain_english_summary ?? ""),
    role_mission_summary: String(data.role_mission_summary ?? ""),
    role_level_guess: (data.role_level_guess as JdDecoderOutput["role_level_guess"]) ?? "Mid",
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

export async function POST(req: Request) {
  const { userId } = await requireUser();
  const supabase = await supabaseServer();

  const body = await req.json();
  const parsed = JdDecoderInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const prompt = promptJdDecoder(parsed.data.jobDescriptionText);

  const started = Date.now();
  const llm = await generateJson<JdDecoderOutput>(prompt);
  const latency = Date.now() - started;

  const baseRun = {
    user_id: userId,
    tool_name: "jd_decoder" as const,
    input_json: { jobDescriptionTextLen: parsed.data.jobDescriptionText.length },
    latency_ms: latency,
  };

  if (!llm.ok) {
    await supabase.from("tool_runs").insert({ ...baseRun, status: "error", error_message: llm.error });
    return NextResponse.json({ error: llm.error }, { status: 500 });
  }

  const normalized = normalizeOutput(llm.data);

  await supabase.from("tool_runs").insert({
    ...baseRun,
    status: "success",
    output_json: normalized as unknown as Record<string, unknown>,
    tokens_in: llm.tokensIn ?? null,
    tokens_out: llm.tokensOut ?? null,
  });

  return NextResponse.json(normalized);
}
