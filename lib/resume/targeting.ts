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
  // Lines already told, in a highlight or under a job.
  const cited = new Set([...rows(raw.highlights), ...rows(raw.experience)].flatMap((entry) => rows(entry.bullets).flatMap((b) => ids(b.evidence))));
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

  const sections = [...(resume.highlights ?? []).map((group) => ({ place: group.heading, bullets: group.bullets })), ...resume.experience.map((role) => ({ place: role.title, bullets: role.bullets }))];
  for (const section of sections) {
    for (const bullet of section.bullets) {
      const figures = figuresIn(bullet.text);
      if (figures.length === 0) continue;
      checks.push({ place: section.place, text: bullet.text, figures, sources: bullet.evidence.map((id) => lineById.get(id) ?? "").filter(Boolean) });
    }
  }
  return checks;
}

// ─── Tailoring in two steps ───────────────────────────────────────────
// The plan chooses master lines by id, one to three per bullet; the rewrite
// writes each bullet from its lines for the posting. These turn a plan into
// numbered slots for the rewrite, and the rewrites back into a draft the
// checks can read.

export type TailorSlot = { slot: string; section: string; ids: string[]; lines: string[] };
export type TailorLayout = {
  slots: TailorSlot[];
  highlights: { heading: string; slots: string[] }[];
  experience: { roleId: string; slots: string[] }[];
};

const MAX_GROUPS = 2;
const MAX_GROUP_BULLETS = 4;
const MAX_ROLE_BULLETS = 8;
const MAX_LINES_PER_BULLET = 3;

/** A plan's bullets: ["ACC-01-01", ["ACC-01-02", "ACC-01-03"]] or { lines: [...] }. */
function bulletIds(entry: Record<string, unknown>): string[][] {
  const list = Array.isArray(entry.bullets) ? entry.bullets : Array.isArray(entry.lines) ? entry.lines : [];
  return list.map((item) => (Array.isArray(item) ? item.map(String) : item && typeof item === "object" ? ids((item as Record<string, unknown>).lines ?? (item as Record<string, unknown>).evidence) : [String(item)]));
}

/**
 * The bullets a plan chose, numbered. Each bullet keeps the usable lines of
 * one role only: a combined claim never spans two jobs. An id that is not a
 * usable master line, or that sits under a job it does not belong to, is
 * dropped; a line already used is not used again.
 */
export function planSlots(plan: Record<string, unknown>, record: EvidenceRecord): TailorLayout {
  const lineById = new Map<string, { text: string; roleId: string }>();
  for (const role of record.roles) {
    for (const a of role.accomplishments) if (a.unverifiedNumbers.length === 0) lineById.set(a.id, { text: a.text, roleId: role.id });
  }
  const slots: TailorSlot[] = [];
  const used = new Set<string>();
  const take = (wanted: string[], section: string, roleId?: string) => {
    const first = wanted.map((id) => lineById.get(id)).find((line) => line && (!roleId || line.roleId === roleId));
    if (!first) return null;
    const chosen = wanted.filter((id) => lineById.get(id)?.roleId === first.roleId && !used.has(id)).slice(0, MAX_LINES_PER_BULLET);
    if (chosen.length === 0) return null;
    chosen.forEach((id) => used.add(id));
    const slot = `S${slots.length + 1}`;
    slots.push({ slot, section, ids: chosen, lines: chosen.map((id) => lineById.get(id)!.text) });
    return slot;
  };

  const highlights: TailorLayout["highlights"] = [];
  for (const group of rows(plan.highlights).slice(0, MAX_GROUPS)) {
    const heading = String(group.heading ?? "").trim();
    const chosen = bulletIds(group)
      .slice(0, MAX_GROUP_BULLETS)
      .map((wanted) => take(wanted, `HIGHLIGHT: ${heading || "Selected Outcomes"}`))
      .filter((s): s is string => !!s);
    if (chosen.length) highlights.push({ heading, slots: chosen });
  }

  const experience: TailorLayout["experience"] = [];
  const seen = new Set<string>();
  for (const entry of rows(plan.experience)) {
    const roleId = String(entry.role_id ?? "");
    const role = record.roles.find((r) => r.id === roleId);
    if (!role || seen.has(roleId)) continue;
    seen.add(roleId);
    const chosen = bulletIds(entry)
      .slice(0, MAX_ROLE_BULLETS)
      .map((wanted) => take(wanted, `JOB: ${role.title}`, roleId))
      .filter((s): s is string => !!s);
    if (chosen.length) experience.push({ roleId, slots: chosen });
  }
  return { slots, highlights, experience };
}

/**
 * The plan and its rewrites as a draft for the checks. A slot the rewrite
 * missed keeps the master's own first line.
 */
export function assembleTailored(plan: Record<string, unknown>, layout: TailorLayout, rewrites: unknown): Record<string, unknown> {
  const rewritten = new Map(rows(Array.isArray(rewrites) ? rewrites : (rewrites as { lines?: unknown; bullets?: unknown })?.bullets ?? (rewrites as { lines?: unknown })?.lines).map((r) => [String(r.slot ?? ""), String(r.text ?? "").trim()]));
  const bySlot = new Map(layout.slots.map((s) => [s.slot, s]));
  const bullet = (slot: string) => {
    const s = bySlot.get(slot)!;
    return { text: rewritten.get(slot) || s.lines[0], evidence: s.ids };
  };
  return {
    target_title: plan.target_title,
    tagline: plan.tagline,
    summary: plan.summary,
    skills: plan.skills,
    highlights: layout.highlights.map((g) => ({ heading: g.heading, bullets: g.slots.map(bullet) })),
    experience: layout.experience.map((e) => ({ role_id: e.roleId, bullets: e.slots.map(bullet) })),
    credential_ids: plan.credential_ids,
    gaps: plan.gaps,
    what_was_emphasized: plan.what_was_emphasized,
  };
}

/** A rewrite answer as rows: [{ slot, text }]. */
export function rewriteRows(value: unknown): { slot: string; text: string }[] {
  const list = Array.isArray(value) ? value : ((value as { bullets?: unknown; lines?: unknown })?.bullets ?? (value as { lines?: unknown })?.lines);
  return rows(list).map((r) => ({ slot: String(r.slot ?? ""), text: String(r.text ?? "").trim() })).filter((r) => r.slot && r.text);
}

/** Later rewrites replace earlier ones for the same slot. */
export function mergeRewrites(first: { slot: string; text: string }[], second: unknown) {
  const map = new Map(first.map((r) => [r.slot, r.text]));
  for (const r of rewriteRows(second)) map.set(r.slot, r.text);
  return [...map].map(([slot, text]) => ({ slot, text }));
}

/**
 * Slots whose rewrite a check put back, with the failed text and the reason,
 * for one more try at the wording.
 */
export function restoredSlots(resume: Pick<TargetedResume, "highlights" | "experience">, layout: TailorLayout): (TailorSlot & { previous: string; problem: string })[] {
  const bullets = [...(resume.highlights ?? []).flatMap((g) => g.bullets), ...resume.experience.flatMap((r) => r.bullets)];
  const out: (TailorSlot & { previous: string; problem: string })[] = [];
  for (const b of bullets) {
    if (!b.restored || !b.tried) continue;
    const slot = layout.slots.find((s) => s.ids.join(",") === b.tried!.evidence.join(","));
    if (slot && !out.some((o) => o.slot === slot.slot)) out.push({ ...slot, previous: b.tried.text, problem: b.tried.why });
  }
  return out;
}

/** How much of a line's wording a rewrite kept, 0 to 1: shared word order over total length. */
export function sameness(a: string, b: string): number {
  const wa = a.toLowerCase().match(/[a-z0-9$%.]+/g) ?? [];
  const wb = b.toLowerCase().match(/[a-z0-9$%.]+/g) ?? [];
  if (!wa.length || !wb.length) return 0;
  const prev = new Array(wb.length + 1).fill(0);
  for (let i = 1; i <= wa.length; i += 1) {
    let diag = 0;
    for (let j = 1; j <= wb.length; j += 1) {
      const up = prev[j];
      prev[j] = wa[i - 1] === wb[j - 1] ? diag + 1 : Math.max(prev[j], prev[j - 1]);
      diag = up;
    }
  }
  return (2 * prev[wb.length]) / (wa.length + wb.length);
}

// A rewrite that keeps this much of its line's wording was edited, not tailored.
export const TOO_CLOSE = 0.85;

/** Slots whose rewrite barely changed its lines, for one more try at reframing them. */
export function closeSlots(layout: TailorLayout, rewrites: { slot: string; text: string }[]): (TailorSlot & { previous: string; problem: string })[] {
  const bySlot = new Map(rewrites.map((r) => [r.slot, r.text]));
  return layout.slots
    .filter((s) => {
      const text = bySlot.get(s.slot);
      return !text || sameness(text, s.lines.join(" ")) >= TOO_CLOSE;
    })
    .map((s) => ({ ...s, previous: bySlot.get(s.slot) ?? s.lines[0], problem: "kept nearly the same wording as the line. Reframe it for this posting: lead with what the posting values, in its words" }));
}

/**
 * Jobs the plan skipped that would leave an unexplained gap, added with their
 * first lines so they are tailored with everything else.
 */
export function addRoles(layout: TailorLayout, record: EvidenceRecord, roleIds: string[], perRole = 2): TailorLayout {
  const used = new Set(layout.slots.flatMap((s) => s.ids));
  const slots = [...layout.slots];
  const experience = [...layout.experience];
  for (const roleId of roleIds) {
    const role = record.roles.find((r) => r.id === roleId);
    if (!role || experience.some((e) => e.roleId === roleId)) continue;
    const lines = role.accomplishments.filter((a) => a.unverifiedNumbers.length === 0 && !used.has(a.id)).slice(0, perRole);
    if (!lines.length) continue;
    const added = lines.map((a) => {
      const slot = `S${slots.length + 1}`;
      slots.push({ slot, section: `JOB: ${role.title}`, ids: [a.id], lines: [a.text] });
      return slot;
    });
    experience.push({ roleId, slots: added });
  }
  return { slots, highlights: layout.highlights, experience };
}

/** The verification answer as slot -> problem, for the items it found unsupported. */
export function verifyProblems(value: unknown): Map<string, string> {
  const list = (value as { checks?: unknown })?.checks ?? value;
  const out = new Map<string, string>();
  for (const r of rows(list)) {
    const slot = String(r.slot ?? "");
    if (slot && r.ok === false) out.set(slot, String(r.problem ?? "states something its lines do not").slice(0, 200));
  }
  return out;
}
