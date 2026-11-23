import { describe, expect, it } from "vitest";
import mammoth from "mammoth";
import { EMPTY_JD_CONTEXT, jdContext, jdHeadline, jdPayload, jdSuggestions, NO_MASTER, POSTING_CONTEXT_CHARS, spotPosting, type JdInput, type JdResult } from "@/lib/chat/jd";
import { jdTranscript } from "@/lib/chat/jd-transcript";
import { JdContextSchema } from "@/lib/chat/schemas";
import { transcriptText } from "@/lib/chat/transcript";
import { renderTranscriptDocx } from "@/lib/chat/transcript-docx";
import { chatToolFor } from "@/lib/chat/tools";
import { promptChatSystem } from "@/lib/llm/prompts-chat";

const POSTING = `Readiness Program Manager. ${"Lead maintenance and logistics teams across three sites. ".repeat(20)}Pay: $95,000 to $115,000.`;

const DECODE = {
  job_title: "Readiness Program Manager",
  plain_english_summary: "You would keep a fleet ready across three sites.",
  role_mission_summary: "Raise fleet availability.",
  role_level_guess: "Mid",
  role_level_confidence: "high",
  hard_requirements: ["Five years leading teams"],
  soft_requirements: ["Clear writing"],
  implied_expectations: ["Travel between sites"],
  top_must_have_signals: ["Readiness dashboards"],
  ats_keywords_priority: ["readiness", "fleet availability"],
  company_context_signals: ["Growing defense contractor"],
  fit_risks: ["Lean Six Sigma preferred"],
  clarifying_questions: ["How is availability measured?"],
  interview_focus_areas: ["Team leadership"],
  likely_interview_questions: ["Tell me about a readiness turnaround."],
};

const FIT = {
  master: { name: "Jordan_Master.docx", origin: "uploaded", roles: 3, lines: 40, dropped: 0, notes: [] },
  fitMap: {
    requirements: [
      { requirement: "Five years leading teams", type: "mandatory" as const, assessment: "strong" as const, evidence: ["LINE-01-02"], bridge: "" },
      { requirement: "Lean Six Sigma", type: "preferred" as const, assessment: "gap" as const, evidence: [], bridge: "Name the process work you led." },
    ],
    recommendation: "stretch" as const,
    reason: "Strong leadership, one preferred gap.",
    keywords: [],
    counts: { mandatory: { strong: 1, met: 0, partial: 0, gap: 0 }, preferred: { strong: 0, met: 0, partial: 0, gap: 1 }, conditions: 0 },
  },
  cited: { "LINE-01-02": "Led 40 Marines through daily maintenance and readiness reporting." },
};

const RESULT: JdResult = { ...DECODE, runId: "run-1", fit: FIT, fitNote: null };
const INPUT: JdInput = { posting: POSTING, link: "https://jobs.example.com/1", title: null, company: "Acme" };

describe("JD Decoder request", () => {
  it("is the body the classic page sends", () => {
    expect(jdPayload("A posting")).toEqual({ jobDescriptionText: "A posting" });
  });

  it("is a tool with a chat", () => {
    expect(chatToolFor("jd_decoder")?.toolName).toBe("jd_decoder");
  });
});

describe("spotting a posting pasted into the reply box", () => {
  it("offers a link, including the share-sheet form, without trailing punctuation", () => {
    expect(spotPosting("https://jobs.lever.co/acme/123")).toEqual({ link: "https://jobs.lever.co/acme/123" });
    expect(spotPosting("Readiness Program Manager at Acme https://boards.greenhouse.io/acme/jobs/9).")).toEqual({ link: "https://boards.greenhouse.io/acme/jobs/9" });
  });

  it("offers a whole posting, and leaves questions alone", () => {
    expect(spotPosting(POSTING)).toEqual({ posting: POSTING });
    expect(spotPosting("Am I a fit for this?")).toBeNull();
    expect(spotPosting("x".repeat(999))).toBeNull();
    // A long message that mentions a link is a posting, not a link.
    expect(spotPosting(`${"word ".repeat(250)} https://example.com/apply`)?.posting).toBeTruthy();
  });
});

describe("JD Decoder chat", () => {
  it("names the decode", () => {
    expect(jdHeadline(RESULT, INPUT)).toBe("Readiness Program Manager at Acme");
    expect(jdHeadline({ job_title: "" }, { posting: "Senior widget wrangler wanted for a fast growing team today" })).toBe("Senior widget wrangler wanted for a fast growing...");
  });

  it("offers three questions, the model's first, with the gap question only when there is a gap", () => {
    expect(jdSuggestions({ fromModel: ["Does it pay well?"], hasFit: true, hasGap: true, asked: [] })).toEqual(["Does it pay well?", "Am I a fit for this?", "How do I handle my biggest gap?"]);
    expect(jdSuggestions({ fromModel: [], hasFit: false, hasGap: false, asked: [] })).toEqual(["How do I see my fit for this?", "What will they ask me in the interview?", "Which keywords matter most?"]);
    expect(jdSuggestions({ fromModel: [], hasFit: true, hasGap: false, asked: ["am i a fit for this?"] })[0]).toBe("What will they ask me in the interview?");
  });

  it("sends the model the posting, the decode, and the fit with the master lines it cites", () => {
    const ctx = jdContext(RESULT, INPUT);
    expect(ctx.fit?.requirements[0].evidence).toEqual(["Led 40 Marines through daily maintenance and readiness reporting."]);
    expect(ctx.posting?.company).toBe("Acme");
    expect(JdContextSchema.safeParse(ctx).success).toBe(true);
    expect(JdContextSchema.safeParse(EMPTY_JD_CONTEXT).success).toBe(true);
    const long = jdContext(RESULT, { ...INPUT, posting: "y".repeat(50000) });
    expect(long.posting?.text.length).toBe(POSTING_CONTEXT_CHARS);
  });
});

describe("JD Decoder chat rules", () => {
  const prompt = promptChatSystem("jd_decoder", jdContext(RESULT, INPUT));

  it("keeps the shared and chat rules and adds the decoder's own", () => {
    expect(prompt).toContain("Never fabricate");
    expect(prompt).toContain("Never use em dashes or en dashes");
    expect(prompt).toContain("only from the fit below and the master resume lines it cites");
    expect(prompt).toContain("Never suggest claiming experience they do not have");
    expect(prompt).toContain("Pay: only what the posting itself states");
    expect(prompt).toContain("run: always null in this tool");
  });

  it("gives the model the posting, the decode, and each requirement with its master line", () => {
    expect(prompt).toContain("Pay: $95,000 to $115,000.");
    expect(prompt).toContain("Level: Mid (high confidence)");
    expect(prompt).toContain("[mandatory, strong] Five years leading teams");
    expect(prompt).toContain("master line: Led 40 Marines");
    expect(prompt).toContain("how to bridge it: Name the process work you led.");
  });

  it("says when the fit was not checked, and when nothing is decoded yet", () => {
    const noMaster = promptChatSystem("jd_decoder", jdContext({ ...RESULT, fit: null, fitNote: NO_MASTER }, INPUT));
    expect(noMaster).toContain("not checked, because they have not chosen a master resume");
    expect(promptChatSystem("jd_decoder", EMPTY_JD_CONTEXT)).toContain("No posting has been decoded yet");
  });
});

describe("JD Decoder transcript", () => {
  const messages = [
    { role: "user" as const, text: POSTING, paste: true },
    { role: "assistant" as const, kind: "text" as const, text: "That looks like a whole job posting. Want me to decode it?", local: true },
    { role: "user" as const, text: "Decode this posting (742 characters)", action: true },
    { role: "assistant" as const, kind: "result" as const, result: RESULT, inputs: INPUT },
    { role: "user" as const, text: "Am I a fit for this?" },
    { role: "assistant" as const, kind: "text" as const, text: "Mostly: your **team leadership** is strong." },
  ];
  const t = jdTranscript(messages, { result: RESULT, input: INPUT });
  const text = transcriptText(t, "2026-11-23");

  it("writes the decode in full, the fit with its master lines, and the conversation", () => {
    expect(t.title).toBe("Job Description Decoder chat, Readiness Program Manager at Acme");
    expect(text).toContain("Decoded: Readiness Program Manager at Acme");
    expect(text).toContain("A stretch worth weighing. Strong leadership, one preferred gap.");
    expect(text).toContain("- Five years leading teams (required): Strong");
    expect(text).toContain("From your master: Led 40 Marines");
    expect(text).toContain("- Lean Six Sigma preferred");
    expect(text).toContain("Am I a fit for this?");
  });

  it("shows a pasted posting by its size and leaves out the page's own offers", () => {
    expect(text).toContain("(A job posting, ");
    expect(text).not.toContain("Want me to decode it?");
  });

  it("renders as a Word file", async () => {
    const { value } = await mammoth.extractRawText({ buffer: await renderTranscriptDocx(t, "2026-11-23") });
    expect(value).toContain("Readiness Program Manager at Acme");
    expect(value).toContain("From your master: Led 40 Marines");
  });
});
