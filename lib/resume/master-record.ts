// A member's own master resume, turned into the evidence record the targeting
// engine checks against. The model only splits the master into parts; code
// confirms every part appears in the master word for word, assigns the ids,
// orders the roles, and drops anything it cannot find. Nothing here can add a
// fact the member did not write.

import { extractNumbers } from "@/lib/resume/gates";
import {
  RECORD_VERSION,
  accomplishmentId,
  credentialId,
  normalizeDate,
  roleId,
  sortRoles,
  type CredentialKind,
  type EvidenceRecord,
  type EvidenceSource,
} from "@/lib/resume/record";

const KINDS: CredentialKind[] = ["education", "certification", "training", "clearance"];

// Typographic characters are built from code points, so none appear in this
// file: curly quotes, the dash family, and bullet marks.
const cp = (...codes: number[]) => String.fromCharCode(...codes);
const SINGLE_QUOTES = new RegExp(`[${cp(0x2018, 0x2019, 0x201b)}]`, "g");
const DOUBLE_QUOTES = new RegExp(`[${cp(0x201c, 0x201d, 0x201f)}]`, "g");
const DASHES = new RegExp(`[${cp(0x2010)}-${cp(0x2015)}${cp(0x2212)}]`, "g");
const LEADING_BULLET = new RegExp(`^\\s*(?:[-*${cp(0x2022, 0x25aa, 0x25cf, 0x25e6, 0x2013, 0x2014)}]|\\d+[.)])\\s+`);

/** Comparable text: same letters and numbers, quotes, dashes, and spacing evened out. */
export function comparable(value: string): string {
  return value
    .normalize("NFKC")
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .replace(DASHES, "-")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// A leading bullet mark is layout, not content.
const stripBullet = (line: string) => line.replace(LEADING_BULLET, "").trim();

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const strings = (value: unknown) => (Array.isArray(value) ? value.map(str).filter(Boolean) : []);
const objects = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => !!v && typeof v === "object") : []);

export type MasterRecordResult = {
  record: EvidenceRecord;
  // The master's summary, competencies, and lines that belong to no one role.
  // They can support the targeted summary and skills, never a role's bullet.
  support: string;
  // Lines the model returned that are not in the master, so were not used.
  dropped: string[];
};

export function recordFromMaster(args: { raw: Record<string, unknown>; masterText: string; source: EvidenceSource; builtAt: string }): MasterRecordResult {
  const master = comparable(args.masterText);
  const dropped: string[] = [];
  const openQuestions: string[] = [];
  const seen = new Set<string>();

  // A line is kept only if it is in the master, and only once.
  const verified = (raw: string): string | null => {
    const line = stripBullet(raw);
    const key = comparable(line);
    if (key.length < 3) return null;
    if (!master.includes(key)) {
      dropped.push(line);
      return null;
    }
    if (seen.has(key)) return null;
    seen.add(key);
    return line;
  };
  const inMaster = (value: string) => !value || master.includes(comparable(value));

  const roles = objects(args.raw.roles)
    .map((entry) => {
      const title = str(entry.title);
      const organization = str(entry.organization);
      const start = str(entry.start);
      const end = str(entry.end);
      for (const [label, value] of [
        ["title", title],
        ["organization", organization],
      ] as const) {
        if (!inMaster(value)) openQuestions.push(`The ${label} "${value}" was not found word for word in your master resume. Check it there.`);
      }
      return {
        title,
        organization,
        start: normalizeDate(start),
        end: normalizeDate(end),
        lines: strings(entry.lines)
          .map(verified)
          .filter((line): line is string => !!line),
      };
    })
    .filter((role) => role.title && role.lines.length > 0);

  const ordered = sortRoles(roles).map((role, r) => ({
    id: roleId(r),
    title: role.title,
    militaryTitle: role.title,
    organization: role.organization,
    start: role.start,
    end: role.end,
    accomplishments: role.lines.map((line, i) => ({
      id: accomplishmentId(r, i),
      text: line,
      verifiedNumbers: extractNumbers(line),
      unverifiedNumbers: [],
      sources: [args.source],
      fromAward: false,
    })),
  }));

  const credentials = objects(args.raw.credentials)
    .map((entry) => ({ kind: str(entry.kind).toLowerCase() as CredentialKind, text: verified(str(entry.text)) }))
    .filter((entry): entry is { kind: CredentialKind; text: string } => KINDS.includes(entry.kind) && !!entry.text)
    .map((entry, index) => ({ id: credentialId(index), kind: entry.kind, text: entry.text, source: "document" as const }));

  const summary = strings(args.raw.summary)
    .map(verified)
    .filter((line): line is string => !!line);
  const competencies = strings(args.raw.competencies)
    .map(verified)
    .filter((line): line is string => !!line);
  const unassigned = strings(args.raw.unassigned)
    .map(verified)
    .filter((line): line is string => !!line);

  if (dropped.length > 0) {
    openQuestions.push(`${dropped.length} line(s) could not be matched word for word to your master resume, so they were left out.`);
  }

  const accomplishments = ordered.reduce((n, role) => n + role.accomplishments.length, 0);
  const record: EvidenceRecord = {
    version: RECORD_VERSION,
    builtAt: args.builtAt,
    summary: summary.join(" "),
    competencies,
    roles: ordered,
    credentials,
    openQuestions,
    stats: { documentsRead: 1, documentsAvailable: 1, accomplishments, heldForReview: 0 },
  };
  return { record, support: [...summary, ...competencies, ...unassigned].join(" "), dropped };
}
