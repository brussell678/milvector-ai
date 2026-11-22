import { NextResponse } from "next/server";
import { authReplies, requireUser } from "@/lib/auth";
import { enforceAiUsageLimit } from "@/lib/usage-limit";
import { supabaseServer } from "@/lib/supabase/server";
import { getEnv } from "@/lib/env";
import { InterviewStrategistInputSchema, MOCK_INTERVIEW_QUESTIONS } from "@/lib/validators/advisors";
import {
  promptInterviewPackage,
  promptInterviewPrepare,
  promptMockInterviewReview,
  promptMockInterviewTurn,
} from "@/lib/llm/prompts-advisors";
import { loadResumeText } from "@/lib/resume-source";
import { runLoggedJson } from "@/lib/tools/run";
import { redactPII } from "@/lib/redact";

// Room for the slowest model call (tool timeouts run up to 150 s), as on the other tool routes.
export const maxDuration = 300;

const TOOL = "interview_strategist";

type Turn = { role: "interviewer" | "candidate"; text: string };

function transcriptText(transcript: Turn[]) {
  return transcript.map((turn) => `${turn.role === "interviewer" ? "INTERVIEWER" : "CANDIDATE"}: ${redactPII(turn.text).text}`).join("\n\n");
}

// The mock interview only needs the strategy, not the full package text.
function briefingJson(briefing: Record<string, unknown>) {
  const { battle_card, likely_questions, risk_areas, interview_style } = briefing;
  const questions = Array.isArray(likely_questions)
    ? likely_questions.slice(0, 10).map((q) => ({ question: (q as Record<string, unknown>).question, type: (q as Record<string, unknown>).type }))
    : [];
  return JSON.stringify({ battle_card, likely_questions: questions, risk_areas, interview_style }).slice(0, 9000);
}

async function handlePOST(req: Request) {
  const { userId, email } = await requireUser();
  const supabase = await supabaseServer();

  const parsed = InterviewStrategistInputSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Some of the entries are missing or too short. The job posting needs to be pasted in full." }, { status: 400 });
  }
  const input = parsed.data;

  const overLimit = await enforceAiUsageLimit({ supabase, userId, email });
  if (overLimit) return overLimit;

  const model = getEnv().TOOLS_MODEL;
  const meta = { stage: input.stage, jobTitle: input.jobTitle, company: input.company ?? null };

  if (input.stage === "prepare" || input.stage === "package") {
    const resume = await loadResumeText(supabase, userId, input);
    if (!resume.ok) return NextResponse.json({ error: resume.error }, { status: resume.status });

    if (input.stage === "prepare") {
      const run = await runLoggedJson<Record<string, unknown>>({
        supabase,
        userId,
        toolName: TOOL,
        inputJson: { ...meta, jdLen: input.jobDescriptionText.length },
        prompt: promptInterviewPrepare({
          jobTitle: input.jobTitle,
          company: input.company,
          jobDescriptionText: input.jobDescriptionText,
          resumeText: resume.text,
        }),
        model,
        timeoutMs: 90000,
        temperature: 0.2,
      });
      if (!run.ok) return NextResponse.json({ error: run.error }, { status: 500 });
      return NextResponse.json({ stage: input.stage, ...run.data });
    }

    const answersText = input.answers
      .filter((a) => a.answer.trim())
      .map((a) => `Q: ${a.question}\nA: ${redactPII(a.answer).text}`)
      .join("\n\n");

    const run = await runLoggedJson<Record<string, unknown>>({
      supabase,
      userId,
      toolName: TOOL,
      inputJson: { ...meta, answered: input.answers.filter((a) => a.answer.trim()).length, attire: input.attirePreference },
      prompt: promptInterviewPackage({
        jobTitle: input.jobTitle,
        company: input.company,
        jobDescriptionText: input.jobDescriptionText,
        resumeText: resume.text,
        roleAnalysisJson: JSON.stringify(input.roleAnalysis).slice(0, 6000),
        answersText,
        attirePreference: input.attirePreference,
      }),
      model,
      timeoutMs: 150000,
      temperature: 0.3,
    });
    if (!run.ok) return NextResponse.json({ error: run.error }, { status: 500 });
    return NextResponse.json({ stage: input.stage, package: run.data, runId: run.runId });
  }

  if (input.stage === "mock_turn") {
    const answered = input.transcript.filter((turn) => turn.role === "candidate").length;
    const run = await runLoggedJson<{ feedback: Record<string, unknown> | null; next_question: string | null }>({
      supabase,
      userId,
      toolName: TOOL,
      inputJson: { ...meta, question: answered + 1 },
      prompt: promptMockInterviewTurn({
        jobTitle: input.jobTitle,
        company: input.company,
        briefingJson: briefingJson(input.briefing),
        transcriptText: transcriptText(input.transcript),
        questionNumber: answered + 1,
        totalQuestions: MOCK_INTERVIEW_QUESTIONS,
      }),
      model,
      timeoutMs: 60000,
      temperature: 0.5,
      storeOutput: () => null,
    });
    if (!run.ok) return NextResponse.json({ error: run.error }, { status: 500 });

    const done = answered >= MOCK_INTERVIEW_QUESTIONS || !run.data.next_question;
    return NextResponse.json({
      stage: input.stage,
      feedback: answered === 0 ? null : run.data.feedback ?? null,
      nextQuestion: done ? null : String(run.data.next_question ?? "").trim(),
      done,
      questionNumber: answered + 1,
      totalQuestions: MOCK_INTERVIEW_QUESTIONS,
    });
  }

  const run = await runLoggedJson<Record<string, unknown>>({
    supabase,
    userId,
    toolName: TOOL,
    inputJson: { ...meta, turns: input.transcript.length },
    prompt: promptMockInterviewReview({
      jobTitle: input.jobTitle,
      company: input.company,
      briefingJson: briefingJson(input.briefing),
      transcriptText: transcriptText(input.transcript),
    }),
    model,
    timeoutMs: 90000,
    temperature: 0.2,
  });
  if (!run.ok) return NextResponse.json({ error: run.error }, { status: 500 });
  return NextResponse.json({ stage: input.stage, review: run.data });
}

export const POST = authReplies(handlePOST);
