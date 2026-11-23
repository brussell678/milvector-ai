import type { FitResult } from "@/lib/resume/fit-check";

// The Job Description Decoder's shapes, shared by the classic page, the chat,
// and the follow-up endpoint (docs/CHAT_TOOLS_PLAN.md, Phase 2). The request
// body comes from one function, so the chat sends what the form sends.

export type JdDecode = {
  job_title?: string;
  plain_english_summary: string;
  role_mission_summary: string;
  role_level_guess: string;
  role_level_confidence?: string;
  hard_requirements: string[];
  soft_requirements: string[];
  implied_expectations: string[];
  top_must_have_signals: string[];
  ats_keywords_priority: string[];
  company_context_signals: string[];
  fit_risks: string[];
  clarifying_questions: string[];
  interview_focus_areas: string[];
  likely_interview_questions: string[];
};

// fitNote: why there is no fit: "no_master", or a sentence to show as is.
export type JdResult = JdDecode & { runId: string | null; fit?: FitResult | null; fitNote?: string | null };

// What a decode ran on: the posting text, and the link it was read from, if any.
export type JdInput = { posting: string; link?: string; title?: string | null; company?: string | null };

// What the page offers to decode when a member pastes into the reply box.
export type JdOffer = { link?: string; posting?: string };

export const NO_MASTER = "no_master";

/** The body /api/tools/jd-decoder takes. */
export function jdPayload(postingText: string): { jobDescriptionText: string } {
  return { jobDescriptionText: postingText };
}

// A posting pasted whole is long; a question is short. Between the two, the
// text is treated as a question (the follow-up limit is 2,000 characters).
export const POSTING_PASTE_MIN = 1000;
const LINK = /https?:\/\/[^\s<>"']+/i;

/**
 * What a member pasted into the reply box, if it is a job link or a whole
 * posting (D13). A phone's share sheet sends "Job title at Company https://...",
 * so a short message with a link in it counts as the link.
 */
export function spotPosting(text: string): JdOffer | null {
  const trimmed = text.trim();
  const link = LINK.exec(trimmed)?.[0];
  if (link && trimmed.length <= 400) return { link: link.replace(/[).,;]+$/, "") };
  if (trimmed.length >= POSTING_PASTE_MIN) return { posting: trimmed };
  return null;
}

/** "Readiness Program Manager at Acme" or the posting's first words. */
export function jdHeadline(result: Pick<JdResult, "job_title">, input: JdInput): string {
  const title = (result.job_title || input.title || "").trim();
  if (title) return input.company ? `${title} at ${input.company}` : title;
  const words = input.posting.replace(/\s+/g, " ").trim().split(" ").slice(0, 8).join(" ");
  return words ? `${words}...` : "this posting";
}

/** Three questions to tap after a decode: the model's own first, then the page's list. */
export function jdSuggestions(args: { fromModel: string[]; hasFit: boolean; hasGap: boolean; asked: string[] }): string[] {
  const pool = [
    ...args.fromModel,
    ...(args.hasFit ? ["Am I a fit for this?"] : ["How do I see my fit for this?"]),
    ...(args.hasGap ? ["How do I handle my biggest gap?"] : []),
    "What will they ask me in the interview?",
    "Which keywords matter most?",
    "What should I ask them?",
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

// How much of a posting goes to the model with each follow-up.
export const POSTING_CONTEXT_CHARS = 12000;

export type JdChatContext = {
  posting: { title: string | null; company: string | null; text: string } | null;
  decode: JdDecode | null;
  fit: {
    recommendation: string;
    reason: string;
    requirements: { requirement: string; type: string; assessment: string; evidence: string[]; bridge: string }[];
  } | null;
  fitNote: string | null;
};

/** Before any decode: the chat can still answer how the tool works. */
export const EMPTY_JD_CONTEXT: JdChatContext = { posting: null, decode: null, fit: null, fitNote: null };

/** The posting, the decode, and the fit with the master lines it cites, for a follow-up. */
export function jdContext(result: JdResult, input: JdInput): JdChatContext {
  const { runId: _runId, fit, fitNote, ...decode } = result;
  void _runId;
  return {
    posting: { title: input.title ?? decode.job_title ?? null, company: input.company ?? null, text: input.posting.slice(0, POSTING_CONTEXT_CHARS) },
    decode,
    fit: fit
      ? {
          recommendation: fit.fitMap.recommendation,
          reason: fit.fitMap.reason,
          requirements: fit.fitMap.requirements.map((r) => ({
            requirement: r.requirement,
            type: r.type,
            assessment: r.assessment,
            evidence: r.evidence.map((id) => fit.cited[id]).filter((line): line is string => !!line),
            bridge: r.bridge ?? "",
          })),
        }
      : null,
    fitNote: fit ? null : (fitNote ?? null),
  };
}


export const FIT_VERDICT: Record<string, string> = { apply: "Apply", stretch: "A stretch worth weighing", pass: "Probably not this one" };
export const FIT_ASSESSMENT: Record<string, string> = { strong: "Strong", met: "Met", partial: "Partial", gap: "Gap", confirm: "Confirm" };
export const FIT_TYPE: Record<string, string> = { mandatory: "required", preferred: "preferred", condition: "condition of the job" };
