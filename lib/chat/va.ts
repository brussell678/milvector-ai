import { combineRatings, type CombinedResult } from "@/lib/va/combined";
import { withBilateralFlags, type Limb, type Side } from "@/lib/va/bilateral";

// The VA Rating Navigator's shapes, shared by the classic page, the chat, and
// the follow-up endpoint (docs/CHAT_TOOLS_PLAN.md, Phase 4). The request
// bodies come from these functions, so the chat sends what the page sends.

// Kept in step with lib/validators/advisors.ts
export const VA_BATCH = 20;
export const VA_MAX = 60;

export type Candidate = { code: string; title: string; why: string; ratings: number[]; limb: Limb | null; analogous?: boolean };
export type Dbq = { title: string; url: string };
export type Identified = { input: string; plainLanguage: string; candidates: Candidate[]; dbq: Dbq[]; note: string };

export type Analysis = {
  condition: string;
  crisisNote: string;
  codes: { code: string; title: string; section: string; why: string }[];
  breakdown: { code: string; rating: number; criteria: string; evidence: string; examiner: string }[];
  checklist: { form: string; items: { item: string; status: string }[] };
  criteriaLanguage: { lower: string[]; middle: string[]; higher: string[] };
  gaps: { described: string[]; missing: string[]; weak: string[]; strengthen: string[] };
  likelyRange: { low: number | null; high: number | null; why: string; up: string; down: string; confidence: string };
  secondary: { condition: string; relationship: string; note: string }[];
  examPrep: string[];
  allowedRatings: number[];
};

export type Row = Identified & {
  code: string;
  // The member's own description of the condition. Sent only with its
  // analysis; never kept by MilVector and never sent to the chat model.
  details: string;
  analysis: Analysis | null;
  loading: boolean;
  error: string | null;
  rating: string; // rating used in the combined estimate, "" = leave out
  side: Side;
};

export type Source = { asOf: string; url: string };

/** The identify body /api/tools/va-rating-navigator takes, for one batch. */
export function vaIdentifyBody(batch: string[]) {
  return { stage: "identify" as const, conditions: batch };
}

/** The analyze body, for one condition with its chosen code and description. */
export function vaAnalyzeBody(row: Pick<Row, "input" | "code" | "dbq" | "details">) {
  return {
    stage: "analyze" as const,
    condition: row.input.slice(0, 160),
    codes: [row.code],
    dbqTitles: row.dbq.map((d) => d.title),
    details: row.details || null,
  };
}

/** A new row for a condition just identified. */
export function rowFrom(identified: Identified): Row {
  return { ...identified, code: identified.candidates[0]?.code ?? "", details: "", analysis: null, loading: false, error: null, rating: "", side: "" as Side };
}

/** The combined estimate from the ratings the member picked, or null with none picked. */
export function vaCombined(rows: Pick<Row, "rating" | "side">[]): (CombinedResult & { rated: number }) | null {
  const rated = rows.filter((row) => row.rating !== "").map((row) => ({ rating: Number(row.rating), side: row.side }));
  return rated.length > 0 ? { ...combineRatings(withBilateralFlags(rated)), rated: rated.length } : null;
}

/** The conditions the member typed, one per line, as the page sends them. */
export function conditionLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length >= 2);
}

export type VaChatContext = {
  asOf: string | null;
  conditions: {
    input: string;
    code: string;
    rating: number | null;
    side: string;
    analysis: {
      low: number | null;
      high: number | null;
      confidence: string;
      why: string;
      up: string;
      down: string;
      described: string[];
      missing: string[];
      weak: string[];
      strengthen: string[];
      checklistOpen: string[];
      examPrep: string[];
      secondary: string[];
    } | null;
  }[];
  combined: { rating: number; value: number; rated: number; steps: string[] } | null;
};

export const EMPTY_VA_CONTEXT: VaChatContext = { asOf: null, conditions: [], combined: null };

/**
 * The conditions, their codes and picked ratings, each analysis, and the
 * combined estimate, for a follow-up. The member's own descriptions are not
 * in it: they go only to each condition's analysis.
 */
export function vaContext(rows: Row[], source: Source | null): VaChatContext {
  const combined = vaCombined(rows);
  return {
    asOf: source?.asOf ?? null,
    conditions: rows.slice(0, VA_MAX).map((row) => ({
      input: row.input,
      code: row.code,
      rating: row.rating === "" ? null : Number(row.rating),
      side: row.side,
      analysis: row.analysis
        ? {
            low: row.analysis.likelyRange.low,
            high: row.analysis.likelyRange.high,
            confidence: row.analysis.likelyRange.confidence,
            why: row.analysis.likelyRange.why,
            up: row.analysis.likelyRange.up,
            down: row.analysis.likelyRange.down,
            described: row.analysis.gaps.described,
            missing: row.analysis.gaps.missing,
            weak: row.analysis.gaps.weak,
            strengthen: row.analysis.gaps.strengthen,
            checklistOpen: row.analysis.checklist.items.filter((i) => i.status !== "covered").map((i) => i.item),
            examPrep: row.analysis.examPrep,
            secondary: row.analysis.secondary.map((s) => `${s.condition} (${s.relationship})`),
          }
        : null,
    })),
    combined: combined ? { rating: combined.combinedRating, value: combined.combinedValue, rated: combined.rated, steps: combined.steps } : null,
  };
}

/** Three questions to tap once there are conditions: the model's own first, then the page's list. */
export function vaSuggestions(args: { fromModel: string[]; analyzed: boolean; analogous: boolean; asked: string[] }): string[] {
  const pool = [
    ...args.fromModel,
    "How does VA combine my ratings?",
    ...(args.analyzed ? ["What evidence would help most?"] : []),
    "What happens at the exam?",
    ...(args.analogous ? ["What does rated by analogy mean?"] : []),
    "Where can I get free help filing?",
  ];
  const seen = new Set(args.asked.map((q) => q.trim().toLowerCase()));
  const out: string[] = [];
  for (const q of pool) {
    const key = q.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(q);
    if (out.length === 3) break;
  }
  return out;
}

/** What the chat asks the member to cover when they describe a condition (D16). */
export const DESCRIBE_PROMPTS = [
  "How often it happens, and how long it lasts",
  "How bad it gets on a typical day, and on your worst days",
  "What you cannot do, or have to stop doing, because of it",
  "Treatment and medication, and whether they help",
  "Tests, imaging, or a diagnosis you have had",
  "How it affects your work and daily life",
];
