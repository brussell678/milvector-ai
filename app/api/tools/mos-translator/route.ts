import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { MosTranslatorInputSchema } from "@/lib/validators/tools";
import { generateJson } from "@/lib/llm/client";
import { promptMosTranslator } from "@/lib/llm/prompts";
import { getEnv } from "@/lib/env";

type MosTranslatorOutput = {
  civilian_roles: { title: string; match_strength?: string; why_fit: string; common_industries: string[]; keywords: string[] }[];
  recommended_certs: { name: string; why: string; time_to_get: string }[];
};

export async function POST(req: Request) {
  const { userId } = await requireUser();
  const supabase = await supabaseServer();

  const body = await req.json();
  const parsed = MosTranslatorInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
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
