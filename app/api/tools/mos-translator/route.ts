import { NextResponse } from "next/server";
import { authReplies, requireUser } from "@/lib/auth";
import { enforceAiUsageLimit } from "@/lib/usage-limit";
import { supabaseServer } from "@/lib/supabase/server";
import { MosTranslatorInputSchema } from "@/lib/validators/tools";
import { generateJson } from "@/lib/llm/client";
import { promptMosTranslator } from "@/lib/llm/prompts";
import { getEnv } from "@/lib/env";

// Room for the slowest model call (tool timeouts run up to 150 s), as on the other tool routes.
export const maxDuration = 300;

type MosTranslatorOutput = {
  civilian_roles: { title: string; match_strength?: string; why_fit: string; common_industries: string[]; keywords: string[] }[];
  recommended_certs: { name: string; why: string; time_to_get: string }[];
};

async function handlePOST(req: Request) {
  const { userId, email } = await requireUser();
  const supabase = await supabaseServer();
  const overLimit = await enforceAiUsageLimit({ supabase, userId, email });
  if (overLimit) return overLimit;


  const body = await req.json();
  const parsed = MosTranslatorInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter your MOS (at least two characters) and try again.", details: parsed.error.flatten() }, { status: 400 });
  }

  const prompt = promptMosTranslator(parsed.data);
  const started = Date.now();
  const llm = await generateJson<MosTranslatorOutput>(prompt, { model: getEnv().TOOLS_MODEL });
  const latency = Date.now() - started;

  const baseRun = {
    user_id: userId,
    tool_name: "mos_translator" as const,
    input_json: parsed.data,
    latency_ms: latency,
  };

  if (!llm.ok) {
    await supabase.from("tool_runs").insert({ ...baseRun, status: "error", error_message: llm.error });
    return NextResponse.json({ error: llm.error }, { status: 500 });
  }

  const { data: runData } = await supabase
    .from("tool_runs")
    .insert({
      ...baseRun,
      status: "success",
      output_json: llm.data as Record<string, unknown>,
      tokens_in: llm.tokensIn ?? null,
      tokens_out: llm.tokensOut ?? null,
    })
    .select("id")
    .single();

  return NextResponse.json({ ...(llm.data as object), runId: runData?.id ?? null });
}

export const POST = authReplies(handlePOST);
