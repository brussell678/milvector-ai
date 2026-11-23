export type LlmJsonResult<T> = {
  ok: true;
  data: T;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs?: number;
} | {
  ok: false;
  error: string;
  // The raw provider message, for the run log only (it can mention billing).
  detail?: string;
  latencyMs?: number;
};

export type LlmImageResult = {
  ok: true;
  b64Json: string;
  revisedPrompt?: string;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs?: number;
} | {
  ok: false;
  error: string;
  // The raw provider message, for the run log only (it can mention billing).
  detail?: string;
  latencyMs?: number;
};

import OpenAI from "openai";
import { jsonrepair } from "jsonrepair";
import { getEnv } from "@/lib/env";
import { MILVECTOR_SYSTEM_PROMPT } from "@/lib/llm/prompts";

export const AI_MESSAGES = {
  paused: "MilVector's AI tools are paused for a moment on our end. What you entered is still here. Please try again later today.",
  busy: "The AI service is busy right now. Wait a minute and try again. What you entered is still here.",
  outage: "The AI service had a problem on its end. Try again in a minute. What you entered is still here.",
} as const;

/**
 * What a member sees when OpenAI refuses a call. OpenAI's own message can name
 * quotas and billing ("429 You exceeded your current quota..."), so it goes to
 * the run log as detail, never to the page. Null leaves the message as is.
 */
export function memberMessageFor(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const { status, code } = error as { status?: unknown; code?: unknown };
  const message = error instanceof Error ? error.message : "";
  if (status === 429 && (code === "insufficient_quota" || /quota|billing/i.test(message))) return AI_MESSAGES.paused;
  if (status === 429) return AI_MESSAGES.busy;
  if (status === 401 || status === 403) return AI_MESSAGES.paused;
  if (typeof status === "number" && status >= 500) return AI_MESSAGES.outage;
  return null;
}

const JSON_INSTRUCTION =
  "Return valid JSON only. Do not wrap in markdown code fences. Do not include extra commentary.";

function extractJson(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);

  throw new Error("Model response did not contain JSON");
}

function extractBalancedJsonObjects(text: string) {
  const results: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }

    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }
    if (ch === "}") {
      if (depth > 0) depth -= 1;
      if (depth === 0 && start >= 0) {
        results.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return results;
}

function parseCandidate<T>(candidate: string): T {
  try {
    return JSON.parse(candidate) as T;
  } catch {
    const repaired = jsonrepair(candidate);
    return JSON.parse(repaired) as T;
  }
}

function parsePossiblyMalformedJson<T>(text: string): T {
  const trimmed = text.trim();
  const candidates: string[] = [];

  const fencedJsonMatches = trimmed.match(/```json\s*([\s\S]*?)```/gi) ?? [];
  for (const block of fencedJsonMatches) {
    const inner = block.replace(/```json/i, "").replace(/```$/, "").trim();
    if (inner) candidates.push(inner);
  }

  const genericFences = trimmed.match(/```[\s\S]*?```/g) ?? [];
  for (const block of genericFences) {
    const inner = block.replace(/^```[a-zA-Z]*\s*/, "").replace(/```$/, "").trim();
    if (inner) candidates.push(inner);
  }

  candidates.push(trimmed);

  try {
    candidates.push(extractJson(trimmed));
  } catch {
    // ignore
  }

  for (const obj of extractBalancedJsonObjects(trimmed)) {
    candidates.push(obj);
  }

  const uniq = Array.from(new Set(candidates)).sort((a, b) => b.length - a.length);
  const errors: string[] = [];
  for (const candidate of uniq) {
    try {
      return parseCandidate<T>(candidate);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "unknown parse error");
    }
  }

  throw new Error(errors[0] ?? "Unable to parse model JSON output");
}

async function repairJsonWithModel(args: {
  client: OpenAI;
  model: string;
  brokenText: string;
  timeoutMs: number;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    const response = await args.client.responses.create(
      {
        model: args.model,
        ...samplingFor(args.model, 0, "low"),
        store: false,
        text: { format: { type: "json_object" } },
        input: [
          {
            role: "system",
            content:
              "You fix malformed JSON. Return only valid JSON, no markdown, no commentary, no surrounding text.",
          },
          {
            role: "user",
            content: `Repair this JSON-like content into strict valid JSON while preserving fields and values:\n\n${args.brokenText}`,
          },
        ],
      },
      { signal: controller.signal }
    );
    return response.output_text ?? "";
  } finally {
    clearTimeout(timeout);
  }
}

export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

// Reasoning models (GPT-5 and later, o-series) reject a temperature setting
// and take a reasoning effort instead; left out, the model's default applies.
type Sampling = Partial<Pick<OpenAI.Responses.ResponseCreateParamsNonStreaming, "temperature" | "reasoning">>;
export function samplingFor(model: string, temperature: number, effort?: ReasoningEffort): Sampling {
  if (!/^(?:gpt-[5-9]|o[0-9])/.test(model)) return { temperature };
  // The SDK's types predate the "none" and "xhigh" efforts the API accepts.
  return effort ? { reasoning: { effort: effort as NonNullable<NonNullable<Sampling["reasoning"]>["effort"]> } } : {};
}

type GenerateOptions = {
  timeoutMs?: number;
  model?: string;
  temperature?: number;
  reasoningEffort?: ReasoningEffort;
  // Extra task-specific system guidance appended after the shared guardrail.
  system?: string;
};

export async function generateJson<T>(prompt: string, options?: GenerateOptions): Promise<LlmJsonResult<T>> {
  const env = getEnv();
  if (!env.OPENAI_API_KEY) return { ok: false, error: "OPENAI_API_KEY is not configured" };

  const client = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL,
  });

  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? env.LLM_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  try {
    const response = await client.responses.create(
      {
        model: options?.model ?? env.OPENAI_MODEL,
        ...samplingFor(options?.model ?? env.OPENAI_MODEL, options?.temperature ?? 0.2, options?.reasoningEffort ?? env.LLM_REASONING_EFFORT),
        // MilVector never chains responses, so OpenAI need not keep them (see /privacy).
        store: false,
        // JSON mode: one JSON object, never a list or prose around it.
        text: { format: { type: "json_object" } },
        input: [
          {
            role: "system",
            content: [MILVECTOR_SYSTEM_PROMPT, options?.system, JSON_INSTRUCTION].filter(Boolean).join("\n\n"),
          },
          { role: "user", content: prompt },
        ],
      },
      { signal: controller.signal }
    );

    const outputText = response.output_text ?? "";
    let parsed: T;
    try {
      parsed = parsePossiblyMalformedJson<T>(outputText);
    } catch (firstParseError) {
      const repairedByModel = await repairJsonWithModel({
        client,
        model: options?.model ?? env.OPENAI_MODEL,
        brokenText: outputText,
        timeoutMs: Math.min(30000, timeoutMs),
      });
      try {
        parsed = parsePossiblyMalformedJson<T>(repairedByModel);
      } catch {
        throw firstParseError;
      }
    }
    return {
      ok: true,
      data: parsed,
      tokensIn: response.usage?.input_tokens,
      tokensOut: response.usage?.output_tokens,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "LLM request failed";
    if (message.toLowerCase().includes("aborted")) {
      return {
        ok: false,
        error: `The model request timed out after ${Math.ceil(timeoutMs / 1000)}s. Try again or reduce input size.`,
        latencyMs: Date.now() - started,
      };
    }
    return { ok: false, error: memberMessageFor(error) ?? message, detail: message, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timeout);
  }
}

export type ChatTurn = { role: "user" | "assistant"; content: string };
export type StreamPiece = { type: "delta"; text: string } | { type: "usage"; tokensIn?: number; tokensOut?: number };

/** A refused or failed stream: what the member sees, and the provider's own words for the log. */
export class ChatStreamError extends Error {
  constructor(
    public memberMessage: string,
    public detail: string,
  ) {
    super(detail);
  }
}

/**
 * A chat answer, streamed as it is written (docs/CHAT_TOOLS_PLAN.md, D7). The
 * whole conversation goes with each turn and OpenAI keeps nothing, the same
 * as every other call here. Yields the text as it arrives, then the usage.
 */
export async function* streamChat(args: {
  system: string;
  turns: ChatTurn[];
  model: string;
  reasoningEffort?: ReasoningEffort;
  signal: AbortSignal;
}): AsyncGenerator<StreamPiece> {
  const env = getEnv();
  if (!env.OPENAI_API_KEY) throw new ChatStreamError(AI_MESSAGES.paused, "OPENAI_API_KEY is not configured");
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY, baseURL: env.OPENAI_BASE_URL });

  try {
    const stream = await client.responses.create(
      {
        model: args.model,
        ...samplingFor(args.model, 0.3, args.reasoningEffort),
        store: false,
        stream: true,
        input: [{ role: "system", content: args.system }, ...args.turns],
      },
      { signal: args.signal },
    );
    for await (const event of stream) {
      if (event.type === "response.output_text.delta") yield { type: "delta", text: event.delta };
      else if (event.type === "response.completed") yield { type: "usage", tokensIn: event.response.usage?.input_tokens, tokensOut: event.response.usage?.output_tokens };
      else if (event.type === "response.failed" || event.type === "error") throw new Error("message" in event && typeof event.message === "string" ? event.message : "The answer failed on the AI service.");
    }
    // The SDK ends an aborted stream quietly instead of throwing; a stopped or
    // timed-out answer must not be logged as finished.
    if (args.signal.aborted) throw new ChatStreamError("Stopped.", "aborted: the stream was stopped before it finished");
  } catch (error) {
    if (error instanceof ChatStreamError) throw error;
    const message = error instanceof Error ? error.message : "LLM request failed";
    if (args.signal.aborted) throw new ChatStreamError("Stopped.", `aborted: ${message}`);
    throw new ChatStreamError(memberMessageFor(error) ?? AI_MESSAGES.outage, message);
  }
}

export async function generateText(prompt: string): Promise<LlmJsonResult<string>> {
  const env = getEnv();
  if (!env.OPENAI_API_KEY) return { ok: false, error: "OPENAI_API_KEY is not configured" };

  const client = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.LLM_TIMEOUT_MS);
  const started = Date.now();

  try {
    const response = await client.responses.create(
      {
        model: env.OPENAI_MODEL,
        ...samplingFor(env.OPENAI_MODEL, 0.2, env.LLM_REASONING_EFFORT),
        store: false,
        input: prompt,
      },
      { signal: controller.signal }
    );

    return {
      ok: true,
      data: response.output_text ?? "",
      tokensIn: response.usage?.input_tokens,
      tokensOut: response.usage?.output_tokens,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "LLM request failed";
    return { ok: false, error: memberMessageFor(error) ?? message, detail: message, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateImage(args: {
  prompt: string;
  size?: "1024x1024" | "1024x1536" | "1536x1024" | "auto";
  quality?: "low" | "medium" | "high" | "auto";
}): Promise<LlmImageResult> {
  const env = getEnv();
  if (!env.OPENAI_API_KEY) return { ok: false, error: "OPENAI_API_KEY is not configured" };

  const client = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.LLM_TIMEOUT_MS);
  const started = Date.now();

  try {
    const response = await client.images.generate(
      {
        model: "gpt-image-1",
        prompt: args.prompt,
        size: args.size ?? "1536x1024",
        quality: args.quality ?? "medium",
        output_format: "png",
      },
      { signal: controller.signal }
    );

    const image = response.data?.[0];
    if (!image?.b64_json) {
      return { ok: false, error: "Image generation did not return image data.", latencyMs: Date.now() - started };
    }

    return {
      ok: true,
      b64Json: image.b64_json,
      revisedPrompt: image.revised_prompt,
      tokensIn: response.usage?.input_tokens,
      tokensOut: response.usage?.output_tokens,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image generation failed";
    return { ok: false, error: memberMessageFor(error) ?? message, detail: message, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timeout);
  }
}
