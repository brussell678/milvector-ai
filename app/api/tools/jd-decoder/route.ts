import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { JdDecoderInputSchema } from "@/lib/validators/tools";
import { generateJson } from "@/lib/llm/client";
import { promptJdDecoder } from "@/lib/llm/prompts";

type JdDecoderOutput = {
  plain_english_summary: string;
  must_haves: string[];
  nice_to_haves: string[];
  keywords: string[];
  role_level_guess: "Entry" | "Mid" | "Senior" | "Lead" | "Manager" | "Director";
  likely_interview_questions: string[];
};

export async function POST(req: Request) {
  const { userId } = await requireUser();
  const supabase = supabaseServer();

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

  await supabase.from("tool_runs").insert({
    ...baseRun,
    status: "success",
    output_json: llm.data as any,
    tokens_in: llm.tokensIn ?? null,
    tokens_out: llm.tokensOut ?? null,
  });

  return NextResponse.json(llm.data);
}