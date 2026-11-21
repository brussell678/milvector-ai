// The review step's corrections. Pure functions: no database, no model.
//
// A member who marks a line "my master is out of date" gives the corrected
// line. Every later build applies it to their master's text before anything
// reads the master, until an uploaded master already says it.

export type MasterCorrection = { id: string; kind: string; old_line: string; new_line: string | null };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Where a line sits in a master's text, tolerant of the line wraps and
 * spacing a Word file's extracted text carries. Null when it is not there.
 */
export function findLine(text: string, line: string): { index: number; length: number } | null {
  const words = line.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const match = new RegExp(words.map(escape).join("\\s+")).exec(text);
  return match ? { index: match.index, length: match[0].length } : null;
}

/**
 * A master's text with the member's outdated-line corrections applied, the
 * corrections applied, and the ones the text already reflects (resolved).
 */
export function applyCorrections(text: string, corrections: MasterCorrection[]): { text: string; applied: string[]; resolved: string[] } {
  let out = text;
  const applied: string[] = [];
  const resolved: string[] = [];
  for (const c of corrections) {
    if (c.kind !== "outdated" || !c.new_line) continue;
    const at = findLine(out, c.old_line);
    if (at) {
      out = out.slice(0, at.index) + c.new_line.trim() + out.slice(at.index + at.length);
      applied.push(c.id);
    } else if (findLine(out, c.new_line)) {
      resolved.push(c.id);
    }
  }
  return { text: out, applied, resolved };
}

type Bullets = { bullets?: unknown[] };
type Saved = Record<string, unknown> & {
  executive_summary?: string;
  experience?: Bullets[];
  selected_projects?: Bullets[];
  highlights?: Bullets[];
  checked?: Record<string, unknown> & { resume?: Record<string, unknown> & { summary?: string; experience?: Bullets[]; highlights?: Bullets[] }; figures?: unknown[] };
};

const same = (a: string, b: string) => a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();

/** Replaces one sentence of a summary; an empty replacement takes it out. */
function replaceSentence(summary: string, oldText: string, newText: string): string | null {
  const at = findLine(summary, oldText);
  if (!at) return null;
  return (summary.slice(0, at.index) + newText + summary.slice(at.index + at.length)).replace(/\s{2,}/g, " ").trim();
}

/**
 * A saved targeted resume with one line replaced everywhere it is kept: the
 * printable resume (what the Word file renders) and the checked resume
 * beside it. Bullets are matched by their text; a summary sentence by its
 * place in the summary. found is false when the line is not in the resume.
 */
export function replaceLine(saved: Saved, oldText: string, newText: string): { next: Saved; found: boolean } {
  const next: Saved = JSON.parse(JSON.stringify(saved));
  let found = false;
  const swapPrintable = (groups: Bullets[] | undefined) => {
    for (const g of groups ?? []) {
      g.bullets = (g.bullets ?? []).map((b) => {
        if (typeof b === "string" && same(b, oldText)) {
          found = true;
          return newText;
        }
        return b;
      });
    }
  };
  const swapChecked = (groups: Bullets[] | undefined) => {
    for (const g of groups ?? []) {
      g.bullets = (g.bullets ?? []).map((b) => {
        const bullet = b as { text?: string };
        if (bullet && typeof bullet.text === "string" && same(bullet.text, oldText)) {
          found = true;
          return { ...bullet, text: newText, reviewed: true };
        }
        return b;
      });
    }
  };
  swapPrintable(next.experience);
  swapPrintable(next.selected_projects);
  swapPrintable(next.highlights);
  swapChecked(next.checked?.resume?.experience);
  swapChecked(next.checked?.resume?.highlights);
  if (!found && typeof next.executive_summary === "string") {
    const summary = replaceSentence(next.executive_summary, oldText, newText);
    if (summary !== null) {
      next.executive_summary = summary;
      if (next.checked?.resume && typeof next.checked.resume.summary === "string") next.checked.resume.summary = replaceSentence(next.checked.resume.summary, oldText, newText) ?? summary;
      found = true;
    }
  }
  return { next, found };
}
