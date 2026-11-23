import { describe, expect, it } from "vitest";
import { EMPTY_RESUME_CONTEXT, jobHeadline, resumeBody, resumeContext, resumeSuggestions, resumeText, type ResumeJob } from "@/lib/chat/resume";
import { resumeTranscript } from "@/lib/chat/resume-transcript";
import { ResumeContextSchema } from "@/lib/chat/schemas";
import { transcriptText } from "@/lib/chat/transcript";
import { chatToolFor } from "@/lib/chat/tools";
import { promptChatSystem } from "@/lib/llm/prompts-chat";
import type { BuildResult } from "@/lib/resume/build-result";
import type { FitResult } from "@/lib/resume/fit-check";

const JOB: ResumeJob = { source: "master", masterRef: "document:abc", pastedText: "ignored", jobTitle: "Readiness Program Manager", company: "Acme", posting: "Lead maintenance teams. ".repeat(10) };

const FIT: FitResult = {
  master: { name: "Master.docx", origin: "uploaded", roles: 3, lines: 40, dropped: 0, notes: [] },
  fitMap: {
    requirements: [
      { requirement: "Five years leading teams", type: "mandatory", assessment: "strong", evidence: ["L1"], bridge: "" },
      { requirement: "Lean Six Sigma", type: "preferred", assessment: "gap", evidence: [], bridge: "Name the process work you led." },
    ],
    recommendation: "stretch",
    reason: "Strong leadership, one preferred gap.",
    keywords: [],
    counts: { mandatory: { strong: 1, met: 0, partial: 0, gap: 0 }, preferred: { strong: 0, met: 0, partial: 0, gap: 1 }, conditions: 0 },
  },
  cited: { L1: "Led 40 Marines through daily maintenance." },
};

const BUILT = {
  master: { name: "Master.docx", origin: "uploaded", roles: 3, lines: 40, dropped: 0, notes: [] },
  resume: {
    targetTitle: "Readiness Program Manager",
    tagline: "Readiness | Teams | Reporting",
    summary: "Led maintenance teams and readiness reporting.",
    skills: ["Readiness", "Logistics"],
    highlights: [],
    experience: [],
    jobs: [{ roleId: "R1", title: "Maintenance Officer", organization: "2d LAR", dates: "2020 - 2024", bullets: [{ text: "Cut prep time 62 percent." }, { text: "Led 40 Marines." }] }],
    projects: [],
    education: ["BS, Business"],
    certifications: [],
    training: [],
    gaps: ["Lean Six Sigma: be ready to speak to it."],
    estimatedPages: 1.6,
  },
  findings: [{ gate: "structure", level: "pass", check: "No unexplained gap in your timeline", detail: "Every job is included." }],
  gateSummary: { pass: 10, warn: 1, fail: 0 },
  figures: [
    { place: "Maintenance Officer", text: "Cut prep time 62 percent.", figures: ["62 percent"], sources: ["Cut preparation time 62 percent."] },
    { place: "Maintenance Officer", text: "Led 40 Marines.", figures: ["40"], sources: ["Led 40 Marines."] },
  ],
  notes: { summaryRewritten: false, filled: 0, closedGaps: 0 },
  fileName: "2026-11-23_readiness_program_manager_acme.docx",
  documentId: "doc-1",
  artifactId: "art-1",
} as unknown as BuildResult;

describe("Targeted Resume request", () => {
  it("is the classic page's body, for a fit check and a build", () => {
    expect(resumeBody("fit", JOB)).toEqual({ stage: "fit", source: "master", masterRef: "document:abc", pastedText: null, jobTitle: "Readiness Program Manager", company: "Acme", jobDescriptionText: JOB.posting });
    expect(resumeBody("build", JOB, { requirements: [] })).toMatchObject({ stage: "build", fitMap: { requirements: [] } });
    // A pasted resume sends its text and no master; an empty company is null.
    expect(resumeBody("fit", { ...JOB, source: "paste", pastedText: "My resume", company: "" })).toMatchObject({ masterRef: null, pastedText: "My resume", company: null });
    // Same key order as the classic page always sent.
    expect(Object.keys(resumeBody("fit", JOB))).toEqual(["stage", "source", "masterRef", "pastedText", "jobTitle", "company", "jobDescriptionText"]);
  });

  it("is a tool with a chat", () => {
    expect(chatToolFor("resume_targeter")?.key).toBe("resume");
    expect(jobHeadline(JOB)).toBe("Readiness Program Manager at Acme");
  });
});

describe("Targeted Resume chat", () => {
  const ctx = resumeContext(JOB, FIT, { built: BUILT, review: { 0: { status: "correct" } } });

  it("sends the model the job, the fit with master lines, the resume, its checks, and the review count", () => {
    expect(ctx.fit?.requirements[0].evidence).toEqual(["Led 40 Marines through daily maintenance."]);
    expect(ctx.resume?.text).toContain("- Cut prep time 62 percent.");
    expect(ctx.resume?.toCheck).toBe(1);
    expect(ctx.resume?.checked).toBe(1);
    expect(ResumeContextSchema.safeParse(ctx).success).toBe(true);
    expect(ResumeContextSchema.safeParse(EMPTY_RESUME_CONTEXT).success).toBe(true);
  });

  it("writes the resume out as text", () => {
    const text = resumeText(BUILT.resume);
    expect(text).toContain("Maintenance Officer | 2d LAR | 2020 - 2024");
    expect(text).toContain("Education and professional development:");
  });

  it("offers three questions that fit the step the member is on", () => {
    expect(resumeSuggestions({ fromModel: [], stage: "fit", hasGap: true, toCheck: 0, asked: [] })).toEqual(["How do I handle my biggest gap?", "Should I update my master first?", "Am I ready to build this resume?"]);
    expect(resumeSuggestions({ fromModel: ["Is it two pages?"], stage: "build", hasGap: false, toCheck: 2, asked: [] })).toEqual(["Is it two pages?", "Why do these lines need checking?", "What did the checks change?"]);
  });
});

describe("Targeted Resume chat rules", () => {
  const prompt = promptChatSystem("resume_targeter", resumeContext(JOB, FIT, { built: BUILT, review: {} }));

  it("never writes resume lines (D8) and says how to change one", () => {
    expect(prompt).toContain("Never write, rewrite, shorten, or suggest new wording for any resume line");
    expect(prompt).toContain("taps Wrong on it during the line review");
    expect(prompt).toContain("never suggest claiming it");
    expect(prompt).toContain("run: always null in this tool");
  });

  it("gives the model the resume, the checks, and what is left to check", () => {
    expect(prompt).toContain("THE BUILT RESUME (data):");
    expect(prompt).toContain("- [pass] No unexplained gap in your timeline");
    expect(prompt).toContain("LINE REVIEW: 0 of 2 lines marked; 2 still to check");
    expect(prompt).toContain("master line: Led 40 Marines");
  });

  it("knows when nothing is built yet", () => {
    expect(promptChatSystem("resume_targeter", resumeContext(JOB, FIT, null))).toContain("The resume has not been built yet");
    expect(promptChatSystem("resume_targeter", EMPTY_RESUME_CONTEXT)).toContain("Nothing has been checked yet");
  });
});

describe("Targeted Resume transcript", () => {
  const t = resumeTranscript([
    { role: "user", text: "Check my fit: Readiness Program Manager at Acme" },
    { role: "assistant", kind: "result", result: { type: "fit", fit: FIT }, inputs: { job: JOB } },
    { role: "assistant", kind: "result", result: { type: "build", built: BUILT, review: { 0: { status: "correct" } } }, inputs: { job: JOB } },
    { role: "assistant", kind: "text", text: "Use this posting?", local: true },
  ]);
  const text = transcriptText(t, "2026-11-23");

  it("writes the fit, the resume, and how each line was marked", () => {
    expect(t.title).toBe("Targeted Resume chat, Readiness Program Manager at Acme");
    expect(text).toContain("Your fit for Readiness Program Manager at Acme");
    expect(text).toContain("From your master: Led 40 Marines through daily maintenance.");
    expect(text).toContain("- Cut prep time 62 percent. (marked correct)");
    expect(text).toContain("- Led 40 Marines. (not checked yet)");
    expect(text).not.toContain("Use this posting?");
  });
});
