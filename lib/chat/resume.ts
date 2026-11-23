import type { FitResult } from "@/lib/resume/fit-check";
import type { BuildResult, ReviewState } from "@/lib/resume/build-result";
import { reviewCount } from "@/lib/resume/build-result";

// The Targeted Resume Builder's shapes, shared by the classic page, the chat,
// and the follow-up endpoint (docs/CHAT_TOOLS_PLAN.md, Phase 3). The request
// body comes from one function, so the chat sends what the form sends.

/** What a fit check or a build runs on. */
export type ResumeJob = {
  source: "master" | "paste";
  // The chosen master's ref; ignored when the member pasted a resume.
  masterRef?: string | null;
  pastedText?: string | null;
  jobTitle: string;
  company: string;
  posting: string;
  // The link the posting was read from, if any (shown, not sent).
  link?: string;
};

/** The body /api/tools/targeted-resume takes, for a fit check or a build. */
export function resumeBody(stage: "fit" | "build", job: ResumeJob, fitMap?: unknown) {
  return {
    stage,
    source: job.source,
    masterRef: job.source === "paste" ? null : job.masterRef,
    pastedText: job.source === "paste" ? (job.pastedText ?? null) : null,
    jobTitle: job.jobTitle,
    company: job.company || null,
    jobDescriptionText: job.posting,
    ...(stage === "build" ? { fitMap } : {}),
  };
}

/** "Readiness Program Manager at Acme" */
export function jobHeadline(job: Pick<ResumeJob, "jobTitle" | "company">): string {
  return job.company.trim() ? `${job.jobTitle.trim()} at ${job.company.trim()}` : job.jobTitle.trim();
}

// What the chat thread holds: a fit check, or a build with its review.
export type ResumeResult =
  | { type: "fit"; fit: FitResult; fromDecoder?: boolean }
  | { type: "build"; built: BuildResult; review: Record<number, ReviewState> };

// A proposed action the page writes itself: use a posting pasted into the reply box.
export type ResumeRun = { job?: ResumeJob; offer?: { link?: string; posting?: string } };

const RESUME_CONTEXT_CHARS = 12000;
export const RESUME_POSTING_CHARS = 8000;

/** The built resume as plain text, for the model and the transcript. */
export function resumeText(resume: BuildResult["resume"]): string {
  const lines: string[] = [];
  if (resume.targetTitle) lines.push(resume.targetTitle);
  if (resume.tagline) lines.push(resume.tagline);
  if (resume.summary) lines.push("", "Summary:", resume.summary);
  if (resume.skills.length) lines.push("", `Skills: ${resume.skills.join(" | ")}`);
  for (const group of resume.highlights ?? []) {
    lines.push("", `${group.heading}:`, ...group.bullets.map((b) => `- ${b.text}`));
  }
  for (const role of [...resume.jobs, ...resume.projects]) {
    lines.push("", [role.title, role.organization, role.dates].filter(Boolean).join(" | "), ...role.bullets.map((b) => `- ${b.text}`));
  }
  const extras = [...resume.education, ...resume.certifications, ...resume.training];
  if (extras.length) lines.push("", "Education and professional development:", ...extras.map((e) => `- ${e}`));
  return lines.join("\n").trim();
}

const fitContext = (fit: FitResult) => ({
  recommendation: fit.fitMap.recommendation,
  reason: fit.fitMap.reason,
  requirements: fit.fitMap.requirements.map((r) => ({
    requirement: r.requirement,
    type: r.type,
    assessment: r.assessment,
    evidence: r.evidence.map((id) => fit.cited[id]).filter((line): line is string => !!line),
    bridge: r.bridge ?? "",
  })),
});

export type ResumeChatContext = {
  job: { title: string; company: string; posting: string } | null;
  fit: ReturnType<typeof fitContext> | null;
  resume: { text: string; checks: string; findings: { check: string; level: string; detail: string }[]; gaps: string[]; toCheck: number; checked: number } | null;
};

export const EMPTY_RESUME_CONTEXT: ResumeChatContext = { job: null, fit: null, resume: null };

/** The job, the latest fit, and the latest build with its checks and review, for a follow-up. */
export function resumeContext(job: ResumeJob | null, fit: FitResult | null, build: { built: BuildResult; review: Record<number, ReviewState> } | null): ResumeChatContext {
  const count = build ? reviewCount(build.built.figures, build.review) : null;
  return {
    job: job ? { title: job.jobTitle, company: job.company, posting: job.posting.slice(0, RESUME_POSTING_CHARS) } : null,
    fit: fit ? fitContext(fit) : null,
    resume: build
      ? {
          text: resumeText(build.built.resume).slice(0, RESUME_CONTEXT_CHARS),
          checks: `${build.built.gateSummary.pass} checks passed, ${build.built.gateSummary.warn} fixed automatically, ${build.built.gateSummary.fail} need the member. About ${build.built.resume.estimatedPages.toFixed(1)} pages.`,
          findings: build.built.findings.slice(0, 30).map((f) => ({ check: f.check, level: f.level, detail: f.detail })),
          gaps: build.built.resume.gaps.slice(0, 12),
          toCheck: count!.total - count!.done,
          checked: count!.done,
        }
      : null,
  };
}

/** Three questions to tap: the model's own first, then the page's list for where the member is. */
export function resumeSuggestions(args: { fromModel: string[]; stage: "fit" | "build"; hasGap: boolean; toCheck: number; asked: string[] }): string[] {
  const pool = [
    ...args.fromModel,
    ...(args.stage === "fit"
      ? [...(args.hasGap ? ["How do I handle my biggest gap?", "Should I update my master first?"] : []), "Am I ready to build this resume?", "What will this resume lead with?"]
      : [...(args.toCheck > 0 ? ["Why do these lines need checking?"] : []), "What did the checks change?", "How do I explain a gap in my timeline?", "What should I say about this resume in an interview?"]),
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
