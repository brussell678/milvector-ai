import type { SupabaseClient } from "@supabase/supabase-js";
import { generateJson } from "@/lib/llm/client";

type RunArgs<T> = {
  supabase: SupabaseClient;
  userId: string;
  toolName: string;
  // Logged with the run. Keep it to metadata: no document text, no health detail.
  inputJson: Record<string, unknown>;
  prompt: string;
  model: string;
  timeoutMs?: number;
  temperature?: number;
  // What to keep in tool_runs.output_json. Defaults to the full model output;
  // pass a reducer to store less (or null to store nothing).
  storeOutput?: (data: T) => Record<string, unknown> | null;
};

export type RunResult<T> = { ok: true; data: T; runId: string | null } | { ok: false; error: string };

/**
 * One AI call, logged to tool_runs whether it succeeds or fails. tool_runs is
 * what the usage limit counts, so every AI call must go through a logged path.
 */
export async function runLoggedJson<T>(args: RunArgs<T>): Promise<RunResult<T>> {
  const started = Date.now();
  const llm = await generateJson<T>(args.prompt, {
    model: args.model,
    timeoutMs: args.timeoutMs,
    temperature: args.temperature,
  });

  const baseRun = {
    user_id: args.userId,
    tool_name: args.toolName,
    input_json: args.inputJson,
    latency_ms: Date.now() - started,
  };

  if (!llm.ok) {
    await args.supabase.from("tool_runs").insert({ ...baseRun, status: "error", error_message: llm.error });
    return { ok: false, error: llm.error };
  }

  const stored = args.storeOutput ? args.storeOutput(llm.data) : (llm.data as unknown as Record<string, unknown>);
  const { data: run } = await args.supabase
    .from("tool_runs")
    .insert({
      ...baseRun,
      status: "success",
      output_json: stored,
      tokens_in: llm.tokensIn ?? null,
      tokens_out: llm.tokensOut ?? null,
    })
    .select("id")
    .single();

  return { ok: true, data: llm.data, runId: run?.id ?? null };
}
