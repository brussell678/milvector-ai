// Read access to the VA rating schedule (38 CFR Part 4) as structured data.
// Built from the official eCFR text by scripts/build-va-rating-data.mjs.
// Everything the Rating Navigator says about criteria comes through here, so
// the model is quoting the regulation rather than recalling it.

import schedule from "@/data/va/cfr38-part4.json";
import dbq from "@/data/va/dbq-forms.json";

type Line = { text: string; rating?: number };
type CodeEntry = { code: string; title: string; section: string; table: number | null; lines: Line[]; ratings: number[] };
type Formula = { title: string; section: string; table: number | null; lines: Line[]; ratings: number[] };
type Section = { number: string; heading: string; prose: string[]; tables: number[] };
type SharedTable = { id: number; section: string; caption: string; text: string };

const data = schedule as unknown as {
  source: string;
  sourceUrl: string;
  asOf: string;
  sections: Section[];
  formulas: Formula[];
  diagnosticCodes: CodeEntry[];
  sharedTables: SharedTable[];
};

const codeMap = new Map(data.diagnosticCodes.map((entry) => [entry.code, entry]));
const sectionMap = new Map(data.sections.map((section) => [section.number, section]));

export const SCHEDULE_AS_OF = data.asOf;
export const SCHEDULE_SOURCE_URL = data.sourceUrl;

export function isValidCode(code: string) {
  return codeMap.has(code);
}

export function getCode(code: string) {
  return codeMap.get(code) ?? null;
}

function bodySystem(sectionNumber: string) {
  const heading = sectionMap.get(sectionNumber)?.heading ?? "";
  // "§ 4.97 Schedule of ratings—respiratory system." -> "respiratory system"
  const tail = heading.split(/[—–-]/).slice(1).join(" ").trim() || heading.replace(/^§\s*[\d.a-z]+\s*/i, "");
  return tail.replace(/\.$/, "");
}

/** Compact list of every diagnostic code, for the condition-matching step. */
export function codeIndexText() {
  return data.diagnosticCodes.map((entry) => `${entry.code} ${entry.title} [${bodySystem(entry.section)}]`).join("\n");
}

// Formulas whose scope the regulation states in a note rather than the title.
// Mental and eating disorders: Note 2 to the eating disorders formula, 4.130.
// Disc syndrome: the formula's own name. Inactive tuberculosis: 4.97.
const FORMULA_SCOPE: Array<{ title: RegExp; from: string; to: string }> = [
  { title: /^General Rating Formula for Mental Disorders/i, from: "9201", to: "9440" },
  { title: /^Rating Formula for Eating Disorders/i, from: "9520", to: "9521" },
  { title: /^Formula for Rating Intervertebral Disc Syndrome/i, from: "5243", to: "5243" },
  { title: /^General Rating Formula for Inactive Pulmonary Tuberculosis/i, from: "6721", to: "6724" },
];

// Scope written into a title: "(diagnostic codes 6825 through 6833)" or
// "For DCs 7806, 7809, 7813-7816, 7820-7822, and 7824".
function titleScope(title: string): Array<[string, string]> {
  const scope: Array<[string, string]> = [];
  const rest = title.replace(/(\d{4})\s*(?:through|-|–)\s*(\d{4})/gi, (_m, from: string, to: string) => {
    scope.push([from, to]);
    return " ";
  });
  for (const single of rest.match(/\b\d{4}\b/g) ?? []) scope.push([single, single]);
  return scope;
}

function formulaCovers(formula: Formula, entry: CodeEntry) {
  const stated = FORMULA_SCOPE.find((scope) => scope.title.test(formula.title));
  if (stated) return entry.code >= stated.from && entry.code <= stated.to;

  const scope = titleScope(formula.title);
  if (scope.length > 0) return scope.some(([from, to]) => entry.code >= from && entry.code <= to);

  // An unscoped formula (spine, heart, eye) governs the codes in its table
  // that carry no rating tiers of their own.
  return entry.ratings.length === 0;
}

function baseSection(sectionNumber: string) {
  return sectionNumber.replace(/[a-z]+$/i, "");
}

function renderLines(lines: Line[]) {
  return lines.map((line) => (line.rating === undefined ? `  ${line.text}` : `  ${line.rating} percent: ${line.text}`)).join("\n");
}

function formulasFor(entry: CodeEntry) {
  // Codes in a table use that table's formulas; codes listed in prose (mental
  // disorders) use their section's.
  const candidates = data.formulas.filter((f) => (entry.table === null ? f.section === entry.section : f.table === entry.table));
  return candidates.filter((f) => formulaCovers(f, entry));
}

// General sections that govern how a whole body system is rated.
const SYSTEM_GUIDANCE: Record<string, string[]> = {
  "4.71a": ["4.40", "4.45", "4.59"],
  "4.73": ["4.55", "4.56"],
  "4.130": ["4.126"],
  "4.124a": ["4.120", "4.123", "4.124"],
  "4.97": ["4.96"],
  "4.104": ["4.100"],
  "4.114": ["4.113"],
  "4.85": ["4.85", "4.86"],
};

/**
 * Ratings a condition can receive under this code: its own tiers plus the
 * tiers of any formula that applies to it. Empty when the code is rated only
 * by reference to something else.
 */
export function allowedRatings(code: string): number[] {
  const entry = codeMap.get(code);
  if (!entry) return [];
  const all = new Set(entry.ratings);
  for (const formula of formulasFor(entry)) formula.ratings.forEach((r) => all.add(r));
  const scale = nerveScaleCode(entry);
  if (scale) codeMap.get(scale)!.ratings.forEach((r) => all.add(r));
  return [...all].sort((a, b) => a - b);
}

// Neuritis (83xx, 86xx) and neuralgia (84xx, 87xx) of a nerve carry no tiers of
// their own. 38 CFR 4.123 and 4.124 rate them on that nerve's paralysis scale
// (82xx, 85xx), with stated maximums the regulation text explains.
function nerveScaleCode(entry: CodeEntry): string | null {
  if (entry.section !== "4.124a" || entry.ratings.length > 0) return null;
  const n = Number(entry.code);
  const hundreds = Math.floor(n / 100);
  const offset = hundreds === 83 || hundreds === 86 ? 100 : hundreds === 84 || hundreds === 87 ? 200 : 0;
  const scale = String(n - offset);
  return offset && codeMap.has(scale) ? scale : null;
}

/**
 * The regulation text that governs one diagnostic code, assembled for a prompt:
 * the code's own criteria, any rating formula that applies, the criteria of
 * codes it points to, shared tables from its section, and the general rules
 * for its body system.
 */
export function codeContext(code: string, maxChars = 14000): string | null {
  const entry = codeMap.get(code);
  if (!entry) return null;

  const parts: string[] = [];
  parts.push(`DIAGNOSTIC CODE ${entry.code}: ${entry.title}\n38 CFR ${entry.section} (${bodySystem(entry.section)})\n${renderLines(entry.lines) || "  (no criteria listed under the code itself)"}`);

  const formulas = formulasFor(entry);
  for (const formula of formulas) {
    parts.push(`${formula.title.toUpperCase()} (38 CFR ${formula.section})\n${renderLines(formula.lines)}`);
  }

  // "Rate as peptic ulcer disease (DC 7304)" and similar cross references
  const ownText = entry.lines.map((l) => l.text).join(" ");
  const referenced = [...new Set([...ownText.matchAll(/\b(?:DCs?|diagnostic codes?)\s*((?:\d{4}(?:\s*(?:,|and|or|through|-)\s*)?)+)/gi)].flatMap((m) => m[1].match(/\d{4}/g) ?? []))]
    .filter((ref) => ref !== entry.code && codeMap.has(ref))
    .slice(0, 3);
  const scale = nerveScaleCode(entry);
  if (scale && !referenced.includes(scale)) referenced.unshift(scale);
  for (const ref of referenced) {
    const other = codeMap.get(ref)!;
    parts.push(`REFERENCED CODE ${other.code}: ${other.title} (38 CFR ${other.section})\n${renderLines(other.lines)}`);
  }

  // Shared criteria named rather than numbered ("rate as voiding dysfunction")
  if (entry.ratings.length === 0 && formulas.length === 0) {
    for (const table of data.sharedTables.filter((t) => baseSection(t.section) === baseSection(entry.section))) {
      parts.push(`SHARED CRITERIA, 38 CFR ${table.section}${table.caption ? ` (${table.caption})` : ""}\n${table.text}`);
    }
  }

  for (const number of SYSTEM_GUIDANCE[entry.section] ?? []) {
    const section = sectionMap.get(number);
    if (section?.prose.length) parts.push(`${section.heading}\n${section.prose.join("\n")}`);
  }

  return parts.join("\n\n").slice(0, maxChars);
}

export type DbqForm = { title: string; url: string };

export function dbqForms(): DbqForm[] {
  return (dbq as { forms: DbqForm[] }).forms;
}

export function dbqIndexText() {
  return dbqForms().map((form, index) => `${index + 1}. ${form.title}`).join("\n");
}
