// The evidence record: a service member's career as structured, traceable
// facts. It replaces the single block of master-resume text as the source the
// resume tools build from.
//
// Every accomplishment and credential has an id. A targeted resume bullet must
// cite the ids it was written from, and code checks that the ids exist and
// that the bullet's figures appear in the cited evidence. That is what keeps a
// resume true to the record without relying on the model's good behavior.

export const RECORD_VERSION = 2;

export type EvidenceSource = {
  documentId: string;
  filename: string;
  docType: string;
};

export type Accomplishment = {
  id: string; // ACC-01-03: third accomplishment of role 01
  text: string; // civilian language
  // Figures in the text that were found in the source documents
  verifiedNumbers: string[];
  // Figures in the text that could NOT be found in the source documents.
  // An accomplishment with any of these is held out of resumes until reviewed.
  unverifiedNumbers: string[];
  sources: EvidenceSource[];
  fromAward: boolean;
};

export type Role = {
  id: string; // ROLE-01, most recent first
  title: string; // civilian-readable title
  militaryTitle: string; // billet as written in the records
  organization: string;
  start: string; // "Mon YYYY" or ""
  end: string; // "Mon YYYY", "Present", or ""
  accomplishments: Accomplishment[];
};

export type CredentialKind = "education" | "certification" | "training" | "clearance";

export type Credential = {
  id: string; // CRED-01
  kind: CredentialKind;
  text: string;
  source: "document" | "profile";
};

export type EvidenceRecord = {
  version: typeof RECORD_VERSION;
  builtAt: string;
  summary: string;
  competencies: string[];
  roles: Role[];
  credentials: Credential[];
  // Things the records left unclear; shown to the member, never guessed at
  openQuestions: string[];
  stats: {
    documentsRead: number;
    documentsAvailable: number;
    accomplishments: number;
    heldForReview: number;
  };
};

const pad = (n: number) => String(n).padStart(2, "0");
export const roleId = (index: number) => `ROLE-${pad(index + 1)}`;
export const accomplishmentId = (roleIndex: number, index: number) => `ACC-${pad(roleIndex + 1)}-${pad(index + 1)}`;
export const credentialId = (index: number) => `CRED-${pad(index + 1)}`;

export function isEvidenceRecord(value: unknown): value is EvidenceRecord {
  const v = value as EvidenceRecord | null;
  return !!v && v.version === RECORD_VERSION && Array.isArray(v.roles) && Array.isArray(v.credentials);
}

// ─── Dates ────────────────────────────────────────────────────────────

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * One display format for every date: "Jul 2023", "2023", "Present", or "".
 * Records and models write dates as 20230701, 2023-07, 07/2023, or June 2023.
 */
export function normalizeDate(value: string): string {
  const t = (value ?? "").trim();
  if (!t) return "";
  if (/\b(present|current|now)\b/i.test(t)) return "Present";
  const label = (year: string, month: number) => (month >= 1 && month <= 12 ? MONTH_LABELS[month - 1] + " " + year : year);

  let m = t.match(/^((?:19|20)\d{2})[-/.]?(\d{2})(?:[-/.]?\d{2})?$/); // 20230701, 2023-07, 2023-07-01
  if (m) return label(m[1], Number(m[2]));
  m = t.match(/^(\d{1,2})[-/.](?:\d{1,2}[-/.])?((?:19|20)\d{2})$/); // 07/2023, 07/01/2023
  if (m) return label(m[2], Number(m[1]));
  const year = t.match(/\b((?:19|20)\d{2})\b/);
  if (!year) return "";
  const month = MONTHS.findIndex((name) => t.toLowerCase().includes(name));
  return label(year[1], month + 1);
}

/** Sortable value for "Mon YYYY", "YYYY", or "Present". Unknown dates sort oldest. */
export function dateValue(text: string): number {
  const t = (text ?? "").trim().toLowerCase();
  if (!t) return 0;
  if (/present|current/.test(t)) return 999912;
  const year = t.match(/\b(19|20)\d{2}\b/);
  if (!year) return 0;
  const month = MONTHS.findIndex((m) => t.includes(m));
  return Number(year[0]) * 100 + (month >= 0 ? month + 1 : 0);
}

/** Most recent first: by end date, then by start date. */
export function sortRoles<T extends { start: string; end: string }>(roles: T[]): T[] {
  return [...roles].sort((a, b) => dateValue(b.end) - dateValue(a.end) || dateValue(b.start) - dateValue(a.start));
}

/** Whole years between the earliest start and latest end of the given roles. */
export function yearsSpanned(roles: { start: string; end: string }[], today: Date): number {
  const months = (value: number) => Math.floor(value / 100) * 12 + Math.max(0, (value % 100) - 1);
  const now = today.getFullYear() * 100 + today.getMonth() + 1;
  const starts = roles.map((r) => dateValue(r.start)).filter((v) => v > 0);
  const ends = roles.map((r) => (dateValue(r.end) === 999912 ? now : dateValue(r.end))).filter((v) => v > 0);
  if (starts.length === 0 || ends.length === 0) return 0;
  return Math.max(0, Math.round(((months(Math.max(...ends)) - months(Math.min(...starts))) / 12) * 10) / 10);
}

export function dateRange(role: { start: string; end: string }) {
  return [role.start, role.end].filter(Boolean).join(" - ");
}

// ─── Lookups ──────────────────────────────────────────────────────────

/** Evidence usable in a resume: accomplishments with no unverified figures, and all credentials. */
export function usableEvidence(record: EvidenceRecord): Map<string, string> {
  const map = new Map<string, string>();
  for (const role of record.roles) {
    for (const acc of role.accomplishments) {
      if (acc.unverifiedNumbers.length === 0) map.set(acc.id, acc.text);
    }
  }
  for (const cred of record.credentials) map.set(cred.id, cred.text);
  return map;
}

/** The record as compact text for a prompt: ids first, so the model can cite them. */
export function recordForPrompt(record: EvidenceRecord): string {
  const lines: string[] = [];
  for (const role of record.roles) {
    lines.push(`${role.id} | ${role.title} (${role.militaryTitle}) | ${role.organization} | ${dateRange(role)}`);
    for (const acc of role.accomplishments) {
      if (acc.unverifiedNumbers.length > 0) continue;
      lines.push(`  ${acc.id}: ${acc.text}`);
    }
  }
  lines.push("", "CREDENTIALS");
  for (const cred of record.credentials) lines.push(`  ${cred.id} [${cred.kind}]: ${cred.text}`);
  return lines.join("\n");
}

/**
 * The master resume as plain text, generated from the record. Other tools
 * (Job Description Decoder, LinkedIn Profile Builder) read this text.
 */
export function renderMasterResume(record: EvidenceRecord): string {
  const out: string[] = [];
  if (record.summary) out.push("Executive Summary", record.summary, "");
  if (record.competencies.length) out.push("Core Competencies", record.competencies.join(" | "), "");

  out.push("Professional Experience");
  for (const role of record.roles) {
    out.push(`${role.title} | ${role.organization} | ${dateRange(role)}`);
    for (const acc of role.accomplishments) {
      if (acc.unverifiedNumbers.length === 0) out.push(`- ${acc.text}`);
    }
    out.push("");
  }

  const section = (title: string, kinds: CredentialKind[]) => {
    const items = record.credentials.filter((c) => kinds.includes(c.kind));
    if (!items.length) return;
    out.push(title);
    for (const item of items) out.push(`- ${item.text}`);
    out.push("");
  };
  section("Education & Training", ["education", "training"]);
  section("Certifications", ["certification"]);
  section("Additional Qualifications", ["clearance"]);

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
