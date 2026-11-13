import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { enforceAiUsageLimit } from "@/lib/usage-limit";
import { supabaseServer } from "@/lib/supabase/server";
import { getEnv } from "@/lib/env";
import { VaNavigatorInputSchema } from "@/lib/validators/advisors";
import { promptVaAnalyze, promptVaIdentify } from "@/lib/llm/prompts-advisors";
import { allowedRatings, codeContext, codeIndexText, dbqForms, dbqIndexText, getCode, isValidCode, SCHEDULE_AS_OF, SCHEDULE_SOURCE_URL } from "@/lib/va/schedule";
import { runLoggedJson } from "@/lib/tools/run";
import { redactPII } from "@/lib/redact";

const TOOL = "va_rating_navigator";

const text = (value: unknown) => String(value ?? "").trim();
const list = (value: unknown) => (Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : []);
const rows = (value: unknown) => (Array.isArray(value) ? (value as Record<string, unknown>[]).filter((row) => row && typeof row === "object") : []);

type IdentifyOutput = {
  conditions: { input: string; plain_language: string; candidate_codes: { code: string; why: string }[]; dbq_numbers: number[]; note: string }[];
};

export async function POST(req: Request) {
  const { userId, email } = await requireUser();
  const supabase = await supabaseServer();

  const parsed = VaNavigatorInputSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "List at least one condition, one per line." }, { status: 400 });
  const input = parsed.data;

  const overLimit = await enforceAiUsageLimit({ supabase, userId, email });
  if (overLimit) return overLimit;

  const env = getEnv();
  const source = { asOf: SCHEDULE_AS_OF, url: SCHEDULE_SOURCE_URL };

  if (input.stage === "identify") {
    const run = await runLoggedJson<IdentifyOutput>({
      supabase,
      userId,
      toolName: TOOL,
      // Health information: the run log records how many conditions, not which.
      inputJson: { stage: input.stage, conditionCount: input.conditions.length },
      prompt: promptVaIdentify({
        conditionsText: input.conditions.map((c, i) => `${i + 1}. ${c}`).join("\n"),
        codeIndexText: codeIndexText(),
        dbqIndexText: dbqIndexText(),
      }),
      model: env.TOOLS_MODEL,
      timeoutMs: 90000,
      temperature: 0,
      storeOutput: () => null,
    });
    if (!run.ok) return NextResponse.json({ error: run.error }, { status: 500 });

    const forms = dbqForms();
    const byInput = new Map(rows(run.data.conditions).map((row) => [text(row.input).toLowerCase(), row]));
    const conditions = input.conditions.map((condition, index) => {
      const row = byInput.get(condition.toLowerCase()) ?? rows(run.data.conditions)[index] ?? {};
      // A code the model returns is kept only if it exists in the schedule.
      const candidates = rows(row.candidate_codes)
        .map((c) => ({ code: text(c.code), why: text(c.why) }))
        .filter((c) => isValidCode(c.code))
        .slice(0, 3)
        .map((c) => ({ ...c, title: getCode(c.code)!.title, ratings: allowedRatings(c.code) }));
      const dbq = (Array.isArray(row.dbq_numbers) ? row.dbq_numbers : [])
        .map((n) => forms[Number(n) - 1])
        .filter(Boolean)
        .slice(0, 2);
      return { input: condition, plainLanguage: text(row.plain_language), candidates, dbq, note: text(row.note) };
    });

    return NextResponse.json({ stage: input.stage, conditions, source });
  }

  const codes = input.codes.filter(isValidCode);
  if (codes.length === 0) return NextResponse.json({ error: "That diagnostic code is not in the rating schedule." }, { status: 400 });

  const regulationText = codes.map((code) => codeContext(code, 12000)).join("\n\n==========\n\n").slice(0, 30000);
  const allowed = Object.fromEntries(codes.map((code) => [code, allowedRatings(code)]));
  const allowedRatingsText = codes
    .map((code) => `${code} ${getCode(code)!.title}: ${allowed[code].length ? allowed[code].join(", ") : "rated by reference to other criteria; use only percentages that appear in the regulation text"}`)
    .join("\n");

  const run = await runLoggedJson<Record<string, unknown>>({
    supabase,
    userId,
    toolName: TOOL,
    inputJson: { stage: input.stage, codes },
    prompt: promptVaAnalyze({
      condition: input.condition,
      detailsText: input.details ? redactPII(input.details).text : "",
      regulationText,
      allowedRatingsText,
      dbqTitles: input.dbqTitles,
      asOf: SCHEDULE_AS_OF,
    }),
    model: env.TOOLS_MODEL,
    timeoutMs: 120000,
    temperature: 0.1,
    // The written analysis is built from the person's health details, so it is
    // returned to them and not kept in the run log.
    storeOutput: () => null,
  });
  if (!run.ok) return NextResponse.json({ error: run.error }, { status: 500 });

  // Enforce the grounding in code: percentages must exist in the schedule for
  // the code they are attached to. Anything else is dropped, not shown.
  const d = run.data;
  const primary = codes[0];
  const valid = (code: string, rating: number) => {
    const set = allowed[code] ?? allowed[primary] ?? [];
    return set.length === 0 || set.includes(rating);
  };

  const breakdown = rows(d.rating_breakdown)
    .map((row) => ({
      code: isValidCode(text(row.code)) && codes.includes(text(row.code)) ? text(row.code) : primary,
      rating: Number(row.rating),
      criteria: text(row.criteria_summary),
      evidence: text(row.evidence_that_supports_it),
      examiner: text(row.what_the_examiner_looks_for),
    }))
    .filter((row) => Number.isFinite(row.rating) && valid(row.code, row.rating))
    .sort((a, b) => b.rating - a.rating);

  const range = (d.likely_range ?? {}) as Record<string, unknown>;
  const primarySet = allowed[primary];
  const snap = (value: unknown) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    if (primarySet.length === 0) return n;
    return primarySet.reduce((best, r) => (Math.abs(r - n) < Math.abs(best - n) ? r : best), primarySet[0]);
  };
  const low = snap(range.low);
  const high = snap(range.high);

  const checklist = (d.dbq_checklist ?? {}) as Record<string, unknown>;
  const language = (d.criteria_language ?? {}) as Record<string, unknown>;
  const gaps = (d.evidence_gaps ?? {}) as Record<string, unknown>;

  return NextResponse.json({
    stage: input.stage,
    source,
    analysis: {
      condition: input.condition,
      crisisNote: text(d.crisis_note),
      codes: codes.map((code) => ({
        code,
        title: getCode(code)!.title,
        section: getCode(code)!.section,
        why: text(rows(d.diagnostic_codes).find((row) => text(row.code) === code)?.why_it_applies),
      })),
      breakdown,
      checklist: {
        form: text(checklist.form) || input.dbqTitles[0] || "",
        items: rows(checklist.items).map((item) => ({
          item: text(item.item),
          status: ["covered", "unclear", "missing"].includes(text(item.status)) ? text(item.status) : "unclear",
        })),
      },
      criteriaLanguage: { lower: list(language.lower_tier), middle: list(language.middle_tier), higher: list(language.higher_tier) },
      gaps: {
        described: list(gaps.already_described),
        missing: list(gaps.appears_missing),
        weak: list(gaps.weak_points),
        strengthen: list(gaps.would_strengthen),
      },
      likelyRange: {
        low: low !== null && high !== null ? Math.min(low, high) : low,
        high: low !== null && high !== null ? Math.max(low, high) : high,
        why: text(range.why),
        up: text(range.could_move_up),
        down: text(range.could_move_down),
        confidence: ["low", "medium", "high"].includes(text(range.confidence)) ? text(range.confidence) : "low",
      },
      secondary: rows(d.secondary_conditions).map((row) => ({ condition: text(row.condition), relationship: text(row.relationship), note: text(row.note) })),
      examPrep: list(d.exam_preparation),
      allowedRatings: primarySet,
    },
  });
}
