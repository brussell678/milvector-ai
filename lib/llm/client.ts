export type LlmJsonResult<T> = {
  ok: true;
  data: T;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs?: number;
} | {
  ok: false;
  error: string;
  latencyMs?: number;
};

export async function generateJson<T>(_prompt: string): Promise<LlmJsonResult<T>> {
  // STUB: Replace with OpenAI/Anthropic call.
  // For now, return error to confirm wiring.
  return { ok: false, error: "LLM not configured" };
}

export async function generateText(_prompt: string): Promise<LlmJsonResult<string>> {
  return { ok: false, error: "LLM not configured" };
}