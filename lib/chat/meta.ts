import { jsonrepair } from "jsonrepair";
import { z } from "zod";
import { tidyChatText } from "@/lib/chat/text";

// What follows the answer in a follow-up (lib/chat/stream.ts): up to three
// suggested next questions and, at most, one proposed run. Both come from the
// model, so both are checked here before a member sees them. A proposed run
// becomes a button; nothing runs until the member taps it.

export const MAX_SUGGESTIONS = 3;

function parseLoose(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  // An answer cut off before its closing brace is closed by the repair below.
  const end = raw.lastIndexOf("}");
  const text = end > start ? raw.slice(start, end + 1) : raw.slice(start);
  for (const attempt of [() => JSON.parse(text), () => JSON.parse(jsonrepair(text))]) {
    try {
      const value = attempt();
      if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
    } catch {
      // try the next way
    }
  }
  return null;
}

export function cleanSuggestions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const text = tidyChatText(String(item ?? "")).replace(/\s+/g, " ").trim();
    if (text.length < 3 || text.length > 90 || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
    if (out.length === MAX_SUGGESTIONS) break;
  }
  return out;
}

export function parseMeta<R>(raw: string | null, runSchema: z.ZodType<R> | null): { suggestions: string[]; run: R | null } {
  const value = raw ? parseLoose(raw) : null;
  if (!value) return { suggestions: [], run: null };
  let run: R | null = null;
  if (runSchema && value.run && typeof value.run === "object") {
    const parsed = runSchema.safeParse(value.run);
    if (parsed.success) run = parsed.data;
  }
  return { suggestions: cleanSuggestions(value.suggestions), run };
}

// The VA Rating Navigator's proposed run: conditions the member named, to look up.
export const VaRunSchema = z.object({
  conditions: z.array(z.coerce.string().trim().min(2).max(160)).min(1).max(20),
});

// The SBP Advisor's proposed what-if: the changed values only. The page
// recalculates the figures in the browser; nothing runs on the server.
export const SbpRunSchema = z
  .object({
    reducedBaseAmount: z.coerce.number().min(300).max(1_000_000).optional(),
    termQuote: z
      .object({ coverage: z.coerce.number().min(1000).max(100_000_000), monthlyPremium: z.coerce.number().min(1).max(100_000), termYears: z.coerce.number().int().min(1).max(40) })
      .optional(),
    grossRetiredPay: z.coerce.number().min(100).max(1_000_000).optional(),
    memberAgeAtRetirement: z.coerce.number().int().min(30).max(75).optional(),
    spouseAge: z.coerce.number().int().min(18).max(95).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined));

// The MOS Translator's proposed run: the same fields its form sends.
const shortList = z
  .array(z.coerce.string().trim().min(1).max(80))
  .max(10)
  .catch([]);

export const MosRunSchema = z.object({
  mos: z.coerce.string().trim().min(2).max(40),
  billets: shortList.default([]),
  yearsExp: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().int().min(0).max(60).nullable(),
  ).catch(null),
  interests: shortList.default([]),
});
