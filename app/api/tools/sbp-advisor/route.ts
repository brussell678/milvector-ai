import { NextResponse } from "next/server";
import { authReplies, requireUser } from "@/lib/auth";
import { ackReply } from "@/lib/legal/acknowledgments";
import { enforceAiUsageLimit } from "@/lib/usage-limit";
import { supabaseServer } from "@/lib/supabase/server";
import { getEnv } from "@/lib/env";
import { SbpAdvisorInputSchema } from "@/lib/validators/advisors";
import { sbpAnalysisFor } from "@/lib/sbp/inputs";
import { promptSbpAssessment } from "@/lib/llm/prompts-advisors";
import { runLoggedJson } from "@/lib/tools/run";
import { redactPII } from "@/lib/redact";

// Room for the slowest model call (tool timeouts run up to 150 s), as on the other tool routes.
export const maxDuration = 300;

type SbpAssessment = {
  snapshot: string;
  best_fit_option: string;
  why_it_fits: string[];
  main_risks: string[];
  strong_alternative: string;
  if_you_value_flexibility_more: string;
  if_you_value_certainty_more: string;
  next_steps: string[];
  missing_information: string[];
};

const text = (value: unknown) => String(value ?? "").trim();
const list = (value: unknown) => (Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : []);

async function handlePOST(req: Request) {
  const { userId, email } = await requireUser();
  const supabase = await supabaseServer();
  // The member confirms the Decide notice once before the first use (migration 0045).
  const ack = await ackReply(supabase, userId, "sbp");
  if (ack) return ack;

  const parsed = SbpAdvisorInputSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Some of the entries are missing or out of range. Check the form and try again." }, { status: 400 });
  const input = parsed.data;

  if (input.maritalStatus === "married" && !input.spouseAge) {
    return NextResponse.json({ error: "Enter your spouse's age so the survivor figures can be calculated." }, { status: 400 });
  }

  // The figures are plain arithmetic, so they are computed here and never by
  // the model, by the same function the pages use (lib/sbp/inputs.ts).
  const analysis = sbpAnalysisFor(input);

  const overLimit = await enforceAiUsageLimit({ supabase, userId, email });
  if (overLimit) return overLimit;

  const intake = { ...input, notes: input.notes ? redactPII(input.notes).text : null };
  const run = await runLoggedJson<SbpAssessment>({
    supabase,
    userId,
    toolName: "sbp_advisor",
    inputJson: {
      maritalStatus: input.maritalStatus,
      retirementType: input.retirementType,
      hasReducedOption: !!analysis.reduced,
      hasTermQuote: !!analysis.term,
    },
    prompt: promptSbpAssessment({ intakeJson: JSON.stringify(intake, null, 1), analysisJson: JSON.stringify(analysis, null, 1) }),
    model: getEnv().TOOLS_MODEL,
    timeoutMs: 90000,
    temperature: 0.2,
    storeOutput: (data) => ({ best_fit_option: text(data.best_fit_option) }),
  });

  // The calculated figures are useful on their own, so they are returned even
  // if the written assessment could not be generated.
  if (!run.ok) return NextResponse.json({ analysis, assessment: null, assessmentError: run.error });

  const a = run.data;
  const assessment: SbpAssessment = {
    snapshot: text(a.snapshot),
    best_fit_option: text(a.best_fit_option),
    why_it_fits: list(a.why_it_fits),
    main_risks: list(a.main_risks),
    strong_alternative: text(a.strong_alternative),
    if_you_value_flexibility_more: text(a.if_you_value_flexibility_more),
    if_you_value_certainty_more: text(a.if_you_value_certainty_more),
    next_steps: list(a.next_steps),
    missing_information: list(a.missing_information),
  };

  return NextResponse.json({ analysis, assessment, runId: run.runId });
}

export const POST = authReplies(handlePOST);
