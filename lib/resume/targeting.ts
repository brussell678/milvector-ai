// Helpers for the Targeted Resume Builder working from a member's master:
// projects apart from jobs, the master lines not yet used, merging a top-up of
// bullets, and the list of figures the member checks before sending.
// Pure functions; no model calls and no database.

import { createHash } from "node:crypto";
import type { TargetedResume, TargetedRole } from "@/lib/resume/build";
import { extractNumbers } from "@/lib/resume/gates";
import { dateValue, type EvidenceRecord } from "@/lib/resume/record";

/** A stable key for one version of a master's text. */
export function contentHash(text: string): string {
  return createHash("sha256").update(text.replace(/\r\n/g, "\n").trim()).digest("hex");
}

/** Jobs have dates; a master's undated sections (projects, selected work) do not. */
export function splitProjects(resume: TargetedResume): { jobs: TargetedRole[]; projects: TargetedRole[] } {
  return {
    jobs: resume.experience.filter((role) => role.dates.trim()),
    projects: resume.experience.filter((role) => !role.dates.trim()),
  };
}

const rows = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => !!v && typeof v === "object") : []);
const ids = (value: unknown) => (Array.isArray(value) ? value.map((v) => String(v)) : []);

/**
 * Master lines the draft did not use, by role, for the top-up request. Only
 * lines a resume may use (no unverified figures).
 */
export function unusedLines(record: EvidenceRecord, raw: Record<string, unknown>): string {
  const cited = new Set(rows(raw.experience).flatMap((entry) => rows(entry.bullets).flatMap((b) => ids(b.evidence))));
  return record.roles
    .map((role) => {
      const free = role.accomplishments.filter((a) => a.unverifiedNumbers.length === 0 && !cited.has(a.id));
      if (free.length === 0) return "";
      const dates = [role.start, role.end].filter(Boolean).join(" - ");
      return [`${role.id} | ${role.title} | ${role.organization}${dates ? ` | ${dates}` : ""}`, ...free.map((a) => `  ${a.id} | ${a.text}`)].join("\n");
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * Adds a top-up of bullets to a draft: { additions: [{ role_id, bullets }] }.
 * New bullets go after the existing ones for that role; a role not yet in the
 * draft is added. The merged draft is checked again from scratch.
 */
export function mergeAdditions(raw: Record<string, unknown>, additions: unknown): Record<string, unknown> {
  const experience: Record<string, unknown>[] = rows(raw.experience).map((entry) => ({ ...entry, bullets: [...rows(entry.bullets)] }));
  for (const add of rows(additions)) {
    const roleId = String(add.role_id ?? "");
    const bullets = rows(add.bullets);
    if (!roleId || bullets.length === 0) continue;
    const existing = experience.find((entry) => String(entry.role_id) === roleId);
    if (existing) existing.bullets = [...rows(existing.bullets), ...bullets];
    else experience.push({ role_id: roleId, title: "", bullets });
  }
  return { ...raw, experience };
}

// Recruiters read the last ten years closely; a job missing from them reads
// as an unexplained gap.
const RECENT_YEARS = 10;

/**
 * Jobs the resume skips: dated roles in the master that are newer than the
 * oldest job kept, or that ended in the last ten years, and that no kept job's
 * dates cover. A skipped job reads as an unexplained gap to a recruiter.
 */
export function timelineGaps(record: EvidenceRecord, resume: Pick<TargetedResume, "experience">, today: Date = new Date()): EvidenceRecord["roles"] {
  const kept = new Set(resume.experience.map((role) => role.roleId));
  const dated = record.roles.filter((role) => role.start || role.end);
  const windowStart = (today.getFullYear() - RECENT_YEARS) * 100 + today.getMonth() + 1;
  let oldest = -1;
  dated.forEach((role, index) => {
    if (kept.has(role.id)) oldest = index;
  });
  // A year alone runs January to December; a role with one date covers that date.
  const from = (role: { start: string; end: string }) => {
    const v = dateValue(role.start || role.end);
    return v % 100 === 0 ? v + 1 : v;
  };
  const to = (role: { start: string; end: string }) => {
    const v = dateValue(role.end || role.start);
    return v % 100 === 0 ? v + 12 : v;
  };
  const keptSpans = dated.filter((role) => kept.has(role.id)).map((role) => [from(role), to(role)]);
  // Left out and not inside a kept job's dates: a job held alongside another
  // one (a deployment billet during a command tour) leaves no gap.
  return dated
    .filter((role, index) => index <= oldest || to(role) >= windowStart)
    .filter((role) => !kept.has(role.id))
    .filter((role) => !keptSpans.some(([start, end]) => start <= from(role) && to(role) <= end));
}

// ─── Check every figure before you send ───────────────────────────────

export type FigureCheck = {
  // Where it appears: a role or project title, or "Summary".
  place: string;
  // The sentence or bullet as it will be sent.
  text: string;
  // The figures in it, as written.
  figures: string[];
  // The master lines it came from, so the member can check them.
  sources: string[];
};

// Figures as a reader sees them: 92%, $120M, 4,200, 35.5 hours.
const FIGURE = /\$?\d[\d,]*(?:\.\d+)?(?:\s?(?:%|percent\b|k\b|m\b|mm\b|b\b|bn\b|million\b|billion\b|thousand\b))?/gi;

/** The figures in a line that make a claim: not small counts and not years. */
export function figuresIn(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(FIGURE)) {
    const token = match[0].trim().replace(/[.,]$/, "");
    const value = Number(token.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(value) || value <= 2) continue;
    if (/^(19|20)\d\d$/.test(token)) continue;
    if (!out.includes(token)) out.push(token);
  }
  return out;
}

export function figureChecks(resume: TargetedResume, record: EvidenceRecord, supportLines: string[] = []): FigureCheck[] {
  const lineById = new Map(record.roles.flatMap((role) => role.accomplishments.map((a) => [a.id, a.text] as const)));
  // A summary figure may come from the master's own summary or highlights.
  const allLines = [...supportLines, ...lineById.values()];
  const checks: FigureCheck[] = [];

  const sentences = resume.summary.split(/(?<=[.!?])\s+(?=[A-Z])/).filter((s) => s.trim());
  for (const sentence of sentences) {
    const figures = figuresIn(sentence);
    if (figures.length === 0) continue;
    const wanted = new Set(extractNumbers(sentence));
    const sources = allLines.filter((line) => extractNumbers(line).some((n) => wanted.has(n))).slice(0, 2);
    checks.push({ place: "Summary", text: sentence.trim(), figures, sources });
  }

  for (const role of resume.experience) {
    for (const bullet of role.bullets) {
      const figures = figuresIn(bullet.text);
      if (figures.length === 0) continue;
      checks.push({ place: role.title, text: bullet.text, figures, sources: bullet.evidence.map((id) => lineById.get(id) ?? "").filter(Boolean) });
    }
  }
  return checks;
}
