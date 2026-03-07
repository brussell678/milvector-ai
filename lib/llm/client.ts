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

import OpenAI from "openai";
import { jsonrepair } from "jsonrepair";
import { getEnv } from "@/lib/env";

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
        temperature: 0,
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

type GenerateOptions = {
  timeoutMs?: number;
  model?: string;
  temperature?: number;
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
        temperature: options?.temperature ?? 0.2,
        input: [
          {
            role: "system",
            content:
              "Return valid JSON only. Do not wrap in markdown code fences. Do not include extra commentary.",
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
    return { ok: false, error: message, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timeout);
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
        temperature: 0.2,
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
    return { ok: false, error: message, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timeout);
  }
}
