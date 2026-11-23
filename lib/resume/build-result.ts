import type { TargetedResume, TargetedRole } from "@/lib/resume/build";
import type { Finding } from "@/lib/resume/gates";
import type { FigureCheck } from "@/lib/resume/targeting";

// A built targeted resume as the page holds it, shared by the classic
// builder, the chat, and the review reopened from a saved resume (?review=).
// Types and pure helpers only, so pages can use it.

export type MasterInfo = { name: string; origin: string; roles: number; lines: number; dropped: number; notes: string[] };
export type Correction = { id?: string; oldLine: string; newLine: string };
export type ReviewState = { status: "correct" | "fixed"; note?: string };

export type BuildResult = {
  master: MasterInfo;
  resume: TargetedResume & { jobs: TargetedRole[]; projects: TargetedRole[] };
  findings: Finding[];
  gateSummary: { pass: number; warn: number; fail: number };
  figures: (FigureCheck & { reviewed?: string })[];
  notes: { summaryRewritten: boolean; filled: number; closedGaps: number };
  contactMissing?: boolean;
  fileName: string;
  documentId: string;
  artifactId: string | null;
  corrections?: Correction[];
};

/** The resume shown on screen with one line replaced, after a review fix. */
export function withLine(resume: BuildResult["resume"], oldText: string, newText: string): BuildResult["resume"] {
  const same = (a: string) => a.replace(/\s+/g, " ").trim() === oldText.replace(/\s+/g, " ").trim();
  const swap = <T extends { bullets: { text: string }[] }>(groups: T[]) => groups.map((g) => ({ ...g, bullets: g.bullets.map((b) => (same(b.text) ? { ...b, text: newText } : b)) }));
  return {
    ...resume,
    summary: resume.summary.includes(oldText) ? resume.summary.replace(oldText, newText).replace(/\s{2,}/g, " ").trim() : resume.summary,
    highlights: swap(resume.highlights ?? []),
    jobs: swap(resume.jobs),
    projects: swap(resume.projects),
  };
}

/** The review as saved with the resume: each line's mark, by its place in the list. */
export function savedReview(figures: BuildResult["figures"]): Record<number, ReviewState> {
  const review: Record<number, ReviewState> = {};
  figures.forEach((f, i) => {
    if (!f.reviewed) return;
    review[i] =
      f.reviewed === "correct"
        ? { status: "correct" }
        : { status: "fixed", note: f.reviewed === "outdated" ? "Fixed with your corrected line." : "Your master's own wording is back in." };
  });
  return review;
}

/** Lines marked, of the lines to check. */
export function reviewCount(figures: BuildResult["figures"], review: Record<number, ReviewState>) {
  return { done: figures.filter((_, i) => !!review[i]).length, total: figures.length };
}
