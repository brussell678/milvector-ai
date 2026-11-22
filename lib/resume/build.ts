// Turns model output into trusted structures. Everything here is pure code:
// the model proposes, these functions check and decide.

import {
  accomplishmentId,
  credentialId,
  dateRange,
  normalizeDate,
  yearsSpanned,
  roleId,
  sortRoles,
  usableEvidence,
  RECORD_VERSION,
  type Accomplishment,
  type Credential,
  type CredentialKind,
  type EvidenceRecord,
  type EvidenceSource,
  type Role,
} from "@/lib/resume/record";
import { addedTerms, ADDED_TERMS_LIMIT, pastTense, understatedClaims, bannedPhrases, cleanPunctuation, duplicateIndexes, inflatedClaims, unsupportedAcronyms, unsupportedCredentials, unsupportedTools, ungroundedNumbers, extractNumbers, type Finding } from "@/lib/resume/gates";
import { estimatePages, FIT_TARGET_PAGES, MAX_PAGES, type LayoutInput } from "@/lib/resume/layout";

const text = (value: unknown) => String(value ?? "").trim();
const list = (value: unknown) => (Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : []);
const rows = (value: unknown) => (Array.isArray(value) ? (value as Record<string, unknown>[]).filter((row) => row && typeof row === "object") : []);

const KINDS: CredentialKind[] = ["education", "certification", "training", "clearance"];
const kindOf = (value: unknown): CredentialKind => (KINDS.includes(text(value) as CredentialKind) ? (text(value) as CredentialKind) : "training");

// ─── Extraction (one batch of documents) ──────────────────────────────

export type ExtractedRole = { key: string; militaryTitle: string; organization: string; start: string; end: string };
export type ExtractedAccomplishment = {
  id: string;
  roleKey: string;
  text: string;
  source: EvidenceSource;
  fromAward: boolean;
  // Figures in the text that are not in the document it came from
  unverifiedNumbers: string[];
};
export type ExtractedCredential = { id: string; kind: CredentialKind; text: string };
export type Extraction = {
  roles: ExtractedRole[];
  accomplishments: ExtractedAccomplishment[];
  credentials: ExtractedCredential[];
  questions: string[];
};

export type BatchDocument = EvidenceSource & { text: string };

/**
 * Normalizes one batch of extracted facts and checks each accomplishment's
 * figures against the document it cites. `prefix` keeps ids unique across batches.
 */
export function normalizeExtraction(raw: Record<string, unknown>, docs: BatchDocument[], prefix: string): Extraction {
  const docAt = (n: unknown) => docs[Number(n) - 1] ?? null;

  const roles = rows(raw.roles)
    .map((r) => ({
      key: `${prefix}-${text(r.key)}`,
      militaryTitle: text(r.military_title),
      organization: text(r.organization),
      start: normalizeDate(text(r.start)),
      end: normalizeDate(text(r.end)),
    }))
    .filter((r) => r.militaryTitle || r.organization);
  const roleKeys = new Set(roles.map((r) => r.key));

  const accomplishments: ExtractedAccomplishment[] = [];
  rows(raw.accomplishments).forEach((a, index) => {
    const doc = docAt(a.source_doc);
    const body = text(a.text);
    const roleKey = `${prefix}-${text(a.role_key)}`;
    // An accomplishment must come from a real document and belong to a real role.
    if (!doc || !body || !roleKeys.has(roleKey)) return;
    accomplishments.push({
      id: `${prefix}-a${index + 1}`,
      roleKey,
      text: body,
      source: { documentId: doc.documentId, filename: doc.filename, docType: doc.docType },
      fromAward: a.from_award === true || doc.docType === "AWARD",
      unverifiedNumbers: ungroundedNumbers(body, doc.text),
    });
  });

  const credentials = rows(raw.credentials)
    .map((c, index) => ({ id: `${prefix}-c${index + 1}`, kind: kindOf(c.kind), text: text(c.text) }))
    .filter((c) => c.text);

  return { roles, accomplishments, credentials, questions: list(raw.questions) };
}

export function mergeExtractions(parts: Extraction[]): Extraction {
  return {
    roles: parts.flatMap((p) => p.roles),
    accomplishments: parts.flatMap((p) => p.accomplishments),
    credentials: parts.flatMap((p) => p.credentials),
    questions: [...new Set(parts.flatMap((p) => p.questions))],
  };
}

// ─── Record (consolidated) ────────────────────────────────────────────

export type ProfileCredentials = {
  education?: string[] | null;
  certifications?: string[] | null;
  training?: string[] | null;
  clearance?: string | null;
};

/**
 * Builds the evidence record from the model's consolidation. An accomplishment
 * is kept only if it cites extracted items that exist. Its figures are checked
 * against those items, and a figure the extraction step could not find in the
 * source document stays unverified here too.
 */
export function buildRecord(args: {
  consolidated: Record<string, unknown>;
  extraction: Extraction;
  profile: ProfileCredentials;
  documentsRead: number;
  documentsAvailable: number;
  builtAt: string;
}): EvidenceRecord {
  const byId = new Map(args.extraction.accomplishments.map((a) => [a.id, a]));
  const openQuestions = [...args.extraction.questions, ...list(args.consolidated.open_questions)];

  const draftRoles = rows(args.consolidated.roles).map((r) => {
    const accomplishments = rows(r.accomplishments)
      .map((a) => {
        const body = cleanPunctuation(text(a.text));
        const sources = list(a.from).map((id) => byId.get(id)).filter((s): s is ExtractedAccomplishment => !!s);
        if (!body || sources.length === 0) return null;

        const sourceText = sources.map((s) => s.text).join(" ");
        const inherited = new Set(sources.flatMap((s) => s.unverifiedNumbers));
        const numbers = extractNumbers(body);
        const unverified = [...new Set([...ungroundedNumbers(body, sourceText), ...numbers.filter((n) => inherited.has(n))])];
        const seenDocs = new Set<string>();
        return {
          text: body,
          verifiedNumbers: numbers.filter((n) => !unverified.includes(n) && Number(n) > 2),
          unverifiedNumbers: unverified,
          sources: sources.map((s) => s.source).filter((s) => (seenDocs.has(s.documentId) ? false : (seenDocs.add(s.documentId), true))),
          fromAward: sources.some((s) => s.fromAward),
        };
      })
      .filter((a): a is Omit<Accomplishment, "id"> => !!a);

    return {
      title: cleanPunctuation(text(r.title)) || text(r.military_title),
      militaryTitle: text(r.military_title),
      organization: text(r.organization),
      start: normalizeDate(text(r.start)),
      end: normalizeDate(text(r.end)),
      accomplishments,
    };
  });

  const roles: Role[] = sortRoles(draftRoles.filter((r) => r.title && r.accomplishments.length > 0)).map((r, roleIndex) => ({
    id: roleId(roleIndex),
    ...r,
    accomplishments: r.accomplishments.map((a, index) => ({ id: accomplishmentId(roleIndex, index), ...a })),
  }));

  // Credentials from documents, then the member's own profile entries.
  const seen = new Set<string>();
  const credentialDrafts: Omit<Credential, "id">[] = [];
  const add = (kind: CredentialKind, value: string, source: Credential["source"]) => {
    const clean = cleanPunctuation(value);
    const key = clean.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    credentialDrafts.push({ kind, text: clean, source });
  };
  for (const c of rows(args.consolidated.credentials)) add(kindOf(c.kind), text(c.text), "document");
  for (const item of args.profile.education ?? []) add("education", item, "profile");
  for (const item of args.profile.certifications ?? []) add("certification", item, "profile");
  for (const item of args.profile.training ?? []) add("training", item, "profile");
  if (args.profile.clearance) add("clearance", `${args.profile.clearance} security clearance`, "profile");
  const credentials = credentialDrafts.map((c, index) => ({ id: credentialId(index), ...c }));

  // The summary may not carry a figure or a credential the record lacks.
  const allText = roles.flatMap((r) => r.accomplishments.filter((a) => a.unverifiedNumbers.length === 0).map((a) => a.text)).join(" ");
  const credentialText = credentials.map((c) => c.text).join("; ");
  const summary = honestSentences(cleanPunctuation(text(args.consolidated.summary)), allText, credentialText).kept;

  const total = roles.reduce((n, r) => n + r.accomplishments.length, 0);
  const held = roles.reduce((n, r) => n + r.accomplishments.filter((a) => a.unverifiedNumbers.length > 0).length, 0);

  return {
    version: RECORD_VERSION,
    builtAt: args.builtAt,
    summary,
    competencies: list(args.consolidated.competencies).map(cleanPunctuation).slice(0, 18),
    roles,
    credentials,
    openQuestions: [...new Set(openQuestions)],
    stats: { documentsRead: args.documentsRead, documentsAvailable: args.documentsAvailable, accomplishments: total, heldForReview: held },
  };
}

/** Drops sentences that carry a figure or credential the support text does not. */
function honestSentences(paragraph: string, figureSupport: string, credentialSupport: string, allowedNumbers: string[] = [], tools: string[] = []) {
  // Split only where a sentence really ends, not at the decimal in "$1.2M".
  const sentences = paragraph.split(/(?<=[.!?])\s+(?=[A-Z])/).filter((s) => s.trim());
  const removed: string[] = [];
  const removedForTools: string[] = [];
  const removedForClaims: string[] = [];
  const kept = sentences.filter((sentence) => {
    // A named tool is reported with the tools check, not the credentials one.
    const named = unsupportedTools(sentence, figureSupport);
    if (named.length > 0) {
      named.forEach((tool) => tools.push(tool));
      removedForTools.push(sentence.trim());
      return false;
    }
    // A reach or rank the record never states, or filler.
    if (inflatedClaims(sentence, figureSupport).length > 0 || bannedPhrases(sentence).length > 0) {
      removedForClaims.push(sentence.trim());
      return false;
    }
    const bad = ungroundedNumbers(sentence, figureSupport, allowedNumbers).length > 0 || unsupportedCredentials(sentence, credentialSupport).length > 0;
    if (bad) removed.push(sentence.trim());
    return !bad;
  });
  return { kept: kept.join(" ").replace(/\s+/g, " ").trim(), removed, removedForTools, removedForClaims };
}

// ─── Fit map ──────────────────────────────────────────────────────────

// A "condition" is a term of the job the candidate accepts rather than proves
// from a record (travel, relocation, schedule, on-site work, physical demands,
// background or drug checks, work authorization). It is never a gap and never
// decides the verdict; the member confirms it.
export type FitRequirement = {
  requirement: string;
  type: "mandatory" | "preferred" | "condition";
  assessment: "strong" | "met" | "partial" | "gap" | "confirm";
  evidence: string[];
  bridge: string;
};

export type FitMap = {
  requirements: FitRequirement[];
  recommendation: "apply" | "stretch" | "pass";
  reason: string;
  keywords: string[];
  counts: { mandatory: Record<string, number>; preferred: Record<string, number>; conditions: number };
};

// Wording that marks a condition of the job, as a safety net when the model
// still files one as a requirement. Deliberately narrow: "travel" alone is
// not enough ("managed travel budgets" is a qualification).
const CONDITION_WORDING =
  /\b(willing(?:ness)?\s+to|(?:able|ability)\s+to\s+(?:travel|relocate|work\s+(?:nights|weekends|shifts|overtime|on[- ]?site|in[- ]office)|lift|stand|sit|obtain|pass)|up to\s+\d+\s*%\s*(?:of\s+the\s+time\s+)?travel|\d+\s*%\s*travel|travel\s+(?:up to\s+)?\d+\s*%|relocat(?:e|ion)\s+(?:is\s+)?required|must\s+(?:be\s+willing\s+to\s+)?relocate|on[- ]call|shift\s+work|rotating\s+shifts|work\s+(?:nights|weekends)|drug\s+(?:test|screen)|background\s+(?:check|investigation)|authori[sz]ed\s+to\s+work|work\s+authori[sz]ation|(?:visa\s+)?sponsorship|lift(?:ing)?\s+(?:up\s+to\s+)?\d+\s*(?:lbs?|pounds))/i;

export function isConditionWording(requirement: string): boolean {
  return CONDITION_WORDING.test(requirement);
}

const CONDITION_BRIDGE = "A condition of the job, not something a resume proves. Confirm it works for you before you apply.";

export function buildFitMap(raw: Record<string, unknown>, record: EvidenceRecord, today: Date = new Date()): FitMap {
  const evidence = usableEvidence(record);
  // A role's title and dates are evidence too: tenure and level requirements cite them.
  for (const role of record.roles) evidence.set(role.id, role.title + " " + dateRange(role));
  const requirements = rows(raw.requirements)
    .map((r): FitRequirement => {
      // A condition is confirmed, not proven: no evidence, never a gap.
      if (text(r.type) === "condition" || isConditionWording(text(r.requirement))) {
        return { requirement: text(r.requirement), type: "condition", assessment: "confirm", evidence: [], bridge: CONDITION_BRIDGE };
      }
      const cited = list(r.evidence).filter((id) => evidence.has(id));
      let assessment = (["strong", "met", "partial", "gap"].includes(text(r.assessment)) ? text(r.assessment) : "gap") as FitRequirement["assessment"];
      // A requirement cannot be assessed as covered without evidence that exists.
      if (cited.length === 0 && assessment !== "gap") assessment = "gap";

      // "5+ years of ..." is arithmetic, so the years are counted here from
      // the dates of the roles cited, not taken on the model's word.
      let bridge = text(r.bridge);
      const asked = text(r.requirement).match(/(\d{1,2})\s*\+?\s*(?:or more\s+)?years?/i);
      const citedRoles = record.roles.filter((role) => cited.includes(role.id));
      if (asked && citedRoles.length > 0 && (assessment === "strong" || assessment === "met")) {
        const have = yearsSpanned(citedRoles, today);
        if (have > 0 && have < Number(asked[1])) {
          assessment = "partial";
          bridge = `The roles cited cover about ${have} years against the ${asked[1]} asked for. ${bridge}`.trim();
        }
      }
      return {
        requirement: text(r.requirement),
        type: (text(r.type) === "mandatory" ? "mandatory" : "preferred") as FitRequirement["type"],
        assessment,
        evidence: assessment === "gap" ? [] : cited,
        bridge,
      };
    })
    .filter((r) => r.requirement)
    // Conditions after the qualifications, in the model's order otherwise.
    .sort((a, b) => Number(a.type === "condition") - Number(b.type === "condition"));

  const tally = (type: FitRequirement["type"]) => {
    const out: Record<string, number> = { strong: 0, met: 0, partial: 0, gap: 0 };
    for (const r of requirements.filter((x) => x.type === type)) out[r.assessment] += 1;
    return out;
  };
  const counts = { mandatory: tally("mandatory"), preferred: tally("preferred"), conditions: requirements.filter((r) => r.type === "condition").length };

  let recommendation = (["apply", "stretch", "pass"].includes(text(raw.recommendation)) ? text(raw.recommendation) : "stretch") as FitMap["recommendation"];
  let reason = text(raw.recommendation_reason);
  // "Apply" is not available while a mandatory requirement is an outright gap.
  if (recommendation === "apply" && counts.mandatory.gap > 0) recommendation = "stretch";
  // "Pass" means a required qualification is missing. With none missing
  // (a condition such as travel is not one), it is not a pass.
  if (recommendation === "pass" && counts.mandatory.gap === 0) {
    recommendation = "stretch";
    reason =
      "None of the required qualifications is missing from your record, so this one is worth weighing. Look at the partial matches below" +
      (counts.conditions > 0 ? ", and confirm the conditions of the job, like travel or schedule." : ".");
  }

  return { requirements, recommendation, reason, keywords: list(raw.keywords).slice(0, 24), counts };
}

// ─── Targeted resume ──────────────────────────────────────────────────

// restored: a rewrite failed a check, so the master's own line was used.
// added: posting words the rewrite uses that its master line does not, for
// the member to check before sending.
export type TargetedBullet = {
  text: string;
  evidence: string[];
  restored?: boolean;
  added?: string[];
  // When restored: the rewrite that failed a check, the lines it cited, and why.
  tried?: { text: string; evidence: string[]; why: string };
};
export type TargetedRole = { roleId: string; title: string; organization: string; dates: string; bullets: TargetedBullet[] };
// A themed section near the top, named for what the posting most wants, with
// the strongest evidence for it from anywhere in the career.
export type HighlightGroup = { heading: string; bullets: TargetedBullet[] };
export type TargetedResume = {
  targetTitle: string;
  // Three themes from the posting the record proves, "A | B | C".
  tagline: string;
  summary: string;
  skills: string[];
  highlights: HighlightGroup[];
  experience: TargetedRole[];
  education: string[];
  certifications: string[];
  training: string[];
  gaps: string[];
  emphasized: string[];
  estimatedPages: number;
};

// summaryRemoved: summary sentences a check took out, so a caller can ask for
// one rewrite instead of shipping a summary that starts mid-thought.
export type GateResult = { resume: TargetedResume; findings: Finding[]; summaryRemoved: string[] };

export const MAX_HIGHLIGHT_GROUPS = 2;
export const MAX_HIGHLIGHT_BULLETS = 4;

function layoutOf(resume: Omit<TargetedResume, "estimatedPages">, contactLines: number): LayoutInput {
  const groups = [resume.education, resume.certifications, resume.training].filter((g) => g.length > 0);
  return {
    hasTitleLine: !!resume.targetTitle,
    hasTagline: !!resume.tagline,
    contactLines,
    summary: resume.summary,
    skillsLine: resume.skills.join(" • "),
    highlights: resume.highlights.map((group) => ({ bullets: group.bullets.map((b) => b.text) })),
    roles: resume.experience.map((role) => ({ bullets: role.bullets.map((b) => b.text) })),
    educationItems: groups.reduce((n, g) => n + g.length, 0),
    educationGroups: groups.length,
  };
}

type LineFailure = "figures" | "credentials" | "tools" | "claims" | "filler";
const FAILURE_LABEL: Record<LineFailure, string> = {
  figures: "changed a figure from the master line it cites",
  credentials: "named a credential your record does not show",
  tools: "named a tool the master line it cites does not mention",
  claims: "changed what the master line it cites says you did",
  filler: "used filler",
};

/**
 * Applies every gate to a generated resume and returns what survived, plus a
 * finding for each check. A tailored line that fails a check is replaced by
 * the master line it cites, word for word, which passes by definition; a line
 * that cannot be traced is removed. Nothing that fails ships.
 */
export function gateTargetedResume(args: {
  raw: Record<string, unknown>;
  record: EvidenceRecord;
  profileClearance?: string | null;
  yearsOfService?: number | null;
  contactLines?: number;
  // Built from the member's own master resume: its role titles stand as
  // written (C6), and its summary, competencies, and highlights may support
  // the targeted summary and skills, though never a role's bullets.
  titlesFromRecord?: boolean;
  extraSupport?: string;
  // No role gets more than this many bullets; the lowest-priority go first.
  maxBulletsPerRole?: number;
  // The posting, so a rewrite's added posting words can be counted and shown.
  postingText?: string;
}): GateResult {
  const { record } = args;
  const findings: Finding[] = [];
  const roleById = new Map(record.roles.map((r) => [r.id, r]));
  const credentialSupport = [...record.credentials.map((c) => c.text), args.profileClearance ? `${args.profileClearance} clearance` : ""].join("; ");
  const allUsableText = [...usableEvidence(record).values()].join(" ");
  const summarySupport = args.extraSupport ? `${allUsableText} ${args.extraSupport}` : allUsableText;
  const allowedNumbers = args.yearsOfService ? [String(args.yearsOfService), String(Math.floor(args.yearsOfService))] : [];

  // Every usable master line, and the role it belongs to.
  const lineById = new Map<string, string>();
  const roleOfLine = new Map<string, Role>();
  for (const role of record.roles) {
    for (const a of role.accomplishments) {
      if (a.unverifiedNumbers.length > 0) continue;
      lineById.set(a.id, a.text);
      roleOfLine.set(a.id, role);
    }
  }
  const contextOf = (ids: string[]) =>
    [...new Set(ids.map((id) => roleOfLine.get(id)).filter((r): r is Role => !!r))].map((r) => `${r.title} ${r.militaryTitle} ${r.organization}`).join(" ");

  let noEvidence = 0;
  let wrongRole = 0;
  let unknownRoles = 0;
  const failed: Record<LineFailure, number> = { figures: 0, credentials: 0, tools: 0, claims: 0, filler: 0 };
  const failDetails: Record<LineFailure, Set<string>> = { figures: new Set(), credentials: new Set(), tools: new Set(), claims: new Set(), filler: new Set() };
  let restored = 0;
  let dropped = 0;
  const unsupportedTerms = new Set<string>();

  const checkLine = (body: string, support: string, context: string): { reason: LineFailure; detail: string[] } | null => {
    const figures = ungroundedNumbers(body, support, allowedNumbers);
    if (figures.length) return { reason: "figures", detail: figures };
    const credentials = unsupportedCredentials(body, credentialSupport);
    if (credentials.length) return { reason: "credentials", detail: credentials };
    const tools = unsupportedTools(body, `${support} ${context}`);
    if (tools.length) return { reason: "tools", detail: tools };
    const claims = inflatedClaims(body, `${support} ${context}`);
    if (claims.length) return { reason: "claims", detail: claims };
    const weaker = understatedClaims(body, support);
    if (weaker.length) return { reason: "claims", detail: weaker.map((name) => `weakened "${name}"`) };
    const filler = bannedPhrases(body);
    if (filler.length) return { reason: "filler", detail: filler };
    return null;
  };

  /** One tailored line, checked against the master lines it cites. */
  const settle = (body: string, cited: string[]): TargetedBullet | null => {
    const support = cited.map((id) => lineById.get(id) ?? "").join(" ");
    const context = contextOf(cited);
    let problem = checkLine(body, support, context);
    // Many posting words the master line never uses: the rewrite changed the claim.
    const added = addedTerms(body, `${support} ${context}`, args.postingText ?? "");
    if (!problem && added.length >= ADDED_TERMS_LIMIT) problem = { reason: "claims", detail: [`added ${added.join(", ")}`] };
    if (!problem) {
      unsupportedAcronyms(body, `${support} ${context}`).forEach((t) => unsupportedTerms.add(t));
      return added.length ? { text: body, evidence: cited, added } : { text: body, evidence: cited };
    }
    failed[problem.reason] += 1;
    problem.detail.forEach((d) => failDetails[problem.reason].add(d));
    // The master's own line states exactly what the master does.
    const original = pastTense(cleanPunctuation(lineById.get(cited[0]) ?? ""));
    if (original && !checkLine(original, lineById.get(cited[0]) ?? "", context)) {
      restored += 1;
      // What was tried and why it failed, so the rewrite can be asked to fix it.
      return { text: original, evidence: [cited[0]], restored: true, tried: { text: body, evidence: cited, why: `${FAILURE_LABEL[problem.reason]}: ${problem.detail.join(", ")}` } };
    }
    dropped += 1;
    return null;
  };

  // ── Highlights: evidence from any role ──
  const highlights: HighlightGroup[] = [];
  for (const group of rows(args.raw.highlights).slice(0, MAX_HIGHLIGHT_GROUPS)) {
    const bullets: TargetedBullet[] = [];
    for (const b of rows(group.bullets).slice(0, MAX_HIGHLIGHT_BULLETS)) {
      const body = pastTense(cleanPunctuation(text(b.text)));
      if (!body) continue;
      const cited = list(b.evidence).filter((id) => lineById.has(id));
      if (cited.length === 0) {
        noEvidence += 1;
        continue;
      }
      const kept = settle(body, cited);
      if (kept) bullets.push(kept);
    }
    const heading = cleanPunctuation(text(group.heading)).replace(/[|:]+/g, " ").replace(/\s{2,}/g, " ").slice(0, 60).trim();
    // A heading is a claim too: it may not name a tool or a reach the record lacks.
    const headingOk = heading && !unsupportedTools(heading, allUsableText).length && !inflatedClaims(heading, allUsableText, "reach").length;
    if (bullets.length > 0) highlights.push({ heading: headingOk ? heading : "Selected Outcomes", bullets });
  }
  const highlightEvidence = new Set(highlights.flatMap((g) => g.bullets.flatMap((b) => b.evidence)));

  // ── Experience: evidence from the role itself ──
  let repeatsHighlight = 0;
  const experience: TargetedRole[] = [];
  for (const entry of rows(args.raw.experience)) {
    const role = roleById.get(text(entry.role_id));
    if (!role) {
      unknownRoles += 1;
      continue;
    }
    const bullets: TargetedBullet[] = [];
    for (const b of rows(entry.bullets)) {
      const body = pastTense(cleanPunctuation(text(b.text)));
      const cited = list(b.evidence);
      if (!body) continue;
      if (cited.length === 0) {
        noEvidence += 1;
        continue;
      }
      // Evidence from another role would credit this job with work done in a different one.
      const valid = cited.filter((id) => roleOfLine.get(id)?.id === role.id);
      if (valid.length === 0) {
        wrongRole += 1;
        continue;
      }
      // Already told in a highlight near the top.
      if (valid.every((id) => highlightEvidence.has(id))) {
        repeatsHighlight += 1;
        continue;
      }
      const kept = settle(body, valid);
      if (kept) bullets.push(kept);
    }
    if (bullets.length === 0) continue;
    if (args.maxBulletsPerRole && bullets.length > args.maxBulletsPerRole) bullets.length = args.maxBulletsPerRole;
    experience.push({
      roleId: role.id,
      title: args.titlesFromRecord ? role.title : cleanPunctuation(text(entry.title)) || role.title,
      organization: role.organization,
      dates: dateRange(role),
      bullets,
    });
  }

  const removed = noEvidence + wrongRole + dropped;
  findings.push({
    gate: "evidence",
    level: removed > 0 || unknownRoles > 0 ? "warn" : "pass",
    check: "Every bullet cites your record",
    detail:
      removed > 0 || unknownRoles > 0
        ? `Removed ${removed} bullet(s) that did not trace to an accomplishment in the same role${unknownRoles ? ` and ${unknownRoles} role(s) not in your record` : ""}.${restored ? ` Used your master's own wording on ${restored} line(s), noted below.` : ""}`
        : "Every bullet traces to an accomplishment in your record, under the role where it happened.",
  });

  // Order roles by the record's dates, not the order the model returned them.
  const order = new Map(record.roles.map((r, index) => [r.id, index]));
  const seenRoles = new Set<string>();
  const ordered = experience
    .filter((r) => (seenRoles.has(r.roleId) ? false : (seenRoles.add(r.roleId), true)))
    .sort((a, b) => (order.get(a.roleId) ?? 0) - (order.get(b.roleId) ?? 0));
  findings.push({ gate: "structure", level: "pass", check: "Roles in reverse chronological order", detail: `${ordered.length} role(s), ordered and dated from your record.` });

  // Repetition across the whole resume: the highlights come first and are kept.
  const flat = [
    ...highlights.flatMap((group, g) => group.bullets.map((b, i) => ({ list: group.bullets, i, text: b.text, top: g }))),
    ...ordered.flatMap((role) => role.bullets.map((b, i) => ({ list: role.bullets, i, text: b.text, top: -1 }))),
  ];
  const dupes = duplicateIndexes(flat.map((f) => f.text)).map((index) => flat[index]);
  for (const d of dupes.reverse()) d.list.splice(d.i, 1);
  const repeats = dupes.length + repeatsHighlight;
  findings.push({
    gate: "structure",
    level: repeats > 0 ? "warn" : "pass",
    check: "No achievement stated twice",
    detail: repeats > 0 ? `Removed ${repeats} bullet(s) that restated an earlier one or a highlight.` : "No near-duplicate bullets.",
  });

  // Figures, credentials, tools, and claim level: every tailored line.
  const restoredNote = (reason: LineFailure) =>
    failed[reason] > 0 ? `${failed[reason]} tailored line(s) ${FAILURE_LABEL[reason]} (${[...failDetails[reason]].slice(0, 6).join(", ")}), so your master's own line was used instead${dropped ? ` where it passes` : ""}.` : "";
  findings.push({
    gate: "figures",
    level: failed.figures > 0 ? "warn" : "pass",
    check: "Every figure matches your record",
    detail: failed.figures > 0 ? restoredNote("figures") : "Every number, dollar amount, and percentage appears in the evidence it cites.",
  });
  findings.push({
    gate: "claims",
    level: failed.claims > 0 ? "warn" : "pass",
    check: "No claim bigger than your master",
    detail:
      failed.claims > 0
        ? restoredNote("claims")
        : "Every tailored line keeps your master's level: who led or built it, how far it reached, and no first or best your master does not state.",
  });

  // Summary and skills. A summary planned as cited sentences is checked
  // sentence by sentence against the lines each cites (and the master's own
  // summary, competencies, and highlights), like a bullet; plain text is
  // checked against the whole record.
  const summaryTools: string[] = [];
  const citedSummary = rows(args.raw.summary);
  const summaryCheck =
    citedSummary.length > 0
      ? (() => {
          const kept: string[] = [];
          const removed: string[] = [];
          const removedForTools: string[] = [];
          const removedForClaims: string[] = [];
          for (const sentence of citedSummary) {
            const body = cleanPunctuation(text(sentence.text));
            if (!body) continue;
            const cited = list(sentence.evidence).filter((id) => lineById.has(id));
            const support = `${cited.map((id) => lineById.get(id)).join(" ")} ${args.extraSupport ?? ""} ${contextOf(cited)} ${record.roles.map((r) => r.title).join(" ")}`;
            const tools = unsupportedTools(body, support);
            if (tools.length) {
              tools.forEach((t) => summaryTools.push(t));
              removedForTools.push(body);
              continue;
            }
            if (ungroundedNumbers(body, support, allowedNumbers).length || unsupportedCredentials(body, credentialSupport).length) {
              removed.push(body);
              continue;
            }
            const added = addedTerms(body, support, args.postingText ?? "");
            if (inflatedClaims(body, support).length || bannedPhrases(body).length || added.length >= ADDED_TERMS_LIMIT) {
              removedForClaims.push(body);
              continue;
            }
            kept.push(body);
          }
          return { kept: kept.join(" "), removed, removedForTools, removedForClaims };
        })()
      : honestSentences(cleanPunctuation(text(args.raw.summary)), summarySupport, credentialSupport, allowedNumbers, summaryTools);
  summaryTools.forEach((t) => failDetails.tools.add(t));
  const skills = list(args.raw.skills).map(cleanPunctuation);
  // A skills entry is a direct claim, so a tool, system, or regulation named
  // there must appear somewhere in the record.
  const recordText = summarySupport + " " + record.roles.map((r) => r.title + " " + r.militaryTitle).join(" ") + " " + credentialSupport;
  const droppedSkills: string[] = [];
  const credentialDetails = failDetails.credentials;
  const keptSkills = skills.filter((skill) => {
    const claims = unsupportedCredentials(skill, credentialSupport);
    claims.forEach((c) => credentialDetails.add(c));
    if (claims.length > 0) return false;
    // A skill is a direct claim: a posting word the master never uses, even in
    // a civilian form, means the master does not show it.
    if (unsupportedAcronyms(skill, recordText).length > 0 || unsupportedTools(skill, recordText).length > 0 || addedTerms(skill, recordText, args.postingText ?? "").length > 0) {
      droppedSkills.push(skill);
      return false;
    }
    return true;
  });
  // Tagline themes are claims too: each is checked like a skill.
  const tagline = cleanPunctuation(text(args.raw.tagline))
    .split("|")
    .map((theme) => theme.trim())
    .filter((theme) => theme && theme.length <= 48)
    .filter((theme) => !unsupportedCredentials(theme, credentialSupport).length && !unsupportedTools(theme, recordText).length && !inflatedClaims(theme, recordText, "reach").length && !addedTerms(theme, recordText, args.postingText ?? "").length)
    .slice(0, 3)
    .join(" | ");

  const toolTrouble = failed.tools > 0 || droppedSkills.length > 0 || unsupportedTerms.size > 0 || summaryTools.length > 0;
  findings.push({
    gate: "terms",
    level: toolTrouble ? "warn" : "pass",
    check: "No tools or systems your record does not mention",
    detail: toolTrouble
      ? [
          restoredNote("tools"),
          summaryTools.length ? `Removed a summary sentence naming ${summaryTools.join(", ")}.` : "",
          droppedSkills.length ? "Removed from skills, because nothing in your record mentions them: " + droppedSkills.join(", ") + "." : "",
          unsupportedTerms.size ? "Check these terms in your bullets before sending. They are in the posting but not in your record: " + [...unsupportedTerms].join(", ") + "." : "",
        ]
          .filter(Boolean)
          .join(" ")
      : "Every tool, system, and regulation named appears in your record.",
  });
  const credentialRemovals = failed.credentials + (skills.length - keptSkills.length - droppedSkills.length) + summaryCheck.removed.length;
  findings.push({
    gate: "credentials",
    level: credentialRemovals > 0 ? "warn" : "pass",
    check: "No clearance, degree, or certification you do not hold",
    detail:
      credentialRemovals > 0
        ? `${failed.credentials ? restoredNote("credentials") + " " : ""}${summaryCheck.removed.length || skills.length - keptSkills.length - droppedSkills.length ? `Removed ${credentialRemovals - failed.credentials} statement(s) with a credential or figure your record does not show${credentialDetails.size ? `: ${[...credentialDetails].join(", ")}` : ""}.` : ""}${summaryCheck.removed.length ? ` From the summary: "${summaryCheck.removed.join(" ").slice(0, 160)}"` : ""} If you do hold it, add it to your profile and rebuild.`.trim()
        : "Every clearance, degree, and certification named is in your record or profile.",
  });

  // Credentials section, chosen by id
  const credById = new Map(record.credentials.map((c) => [c.id, c]));
  const chosenIds = list(args.raw.credential_ids).filter((id) => credById.has(id));
  const chosen = (chosenIds.length ? chosenIds.map((id) => credById.get(id)!) : record.credentials).filter((c) => c.kind !== "clearance");
  const ofKind = (kind: CredentialKind, max: number) => chosen.filter((c) => c.kind === kind).map((c) => c.text).slice(0, max);

  const draft = {
    targetTitle: cleanPunctuation(text(args.raw.target_title)),
    tagline,
    summary: summaryCheck.kept,
    skills: keptSkills.slice(0, 16),
    highlights: highlights.filter((g) => g.bullets.length > 0),
    experience: ordered.filter((r) => r.bullets.length > 0),
    education: ofKind("education", 3),
    certifications: ofKind("certification", 5),
    training: ofKind("training", 4),
    gaps: list(args.raw.gaps),
    emphasized: list(args.raw.what_was_emphasized),
  };

  // Length: trim until it fits two pages, keeping the recent jobs and the
  // highlights deep. In order: a role's bullets beyond five, then undated
  // projects (last first), then a highlight group's bullets beyond three, then
  // a job's bullets beyond three, then any role's beyond two, then a highlight
  // group's beyond two, then the oldest role. Bullets always come off the
  // oldest qualifying role first.
  const contactLines = args.contactLines ?? 2;
  let trimmed = 0;
  let pages = estimatePages(layoutOf(draft, contactLines));
  const isProject = (role: TargetedRole) => !role.dates.trim();
  const oldestWith = (test: (role: TargetedRole) => boolean) => [...draft.experience].reverse().find(test);
  const largestGroupOver = (n: number) => [...draft.highlights].sort((a, b) => b.bullets.length - a.bullets.length).find((g) => g.bullets.length > n);
  while (pages > FIT_TARGET_PAGES) {
    const deep = oldestWith((role) => role.bullets.length > 5);
    const project = oldestWith(isProject);
    const groupOverThree = largestGroupOver(3);
    const overThree = oldestWith((role) => !isProject(role) && role.bullets.length > 3);
    const overTwo = oldestWith((role) => role.bullets.length > 2);
    const groupOverTwo = largestGroupOver(2);
    if (deep) deep.bullets.pop();
    else if (project) draft.experience.splice(draft.experience.indexOf(project), 1);
    else if (groupOverThree) groupOverThree.bullets.pop();
    else if (overThree) overThree.bullets.pop();
    else if (overTwo) overTwo.bullets.pop();
    else if (groupOverTwo) groupOverTwo.bullets.pop();
    else if (draft.experience.length > 3) draft.experience.pop();
    else break;
    trimmed += 1;
    pages = estimatePages(layoutOf(draft, contactLines));
  }

  const lengthLevel = pages > MAX_PAGES ? "fail" : pages > 1.12 && pages < 1.6 ? "warn" : "pass";
  findings.push({
    gate: "length",
    level: lengthLevel,
    check: "Fits two pages",
    detail:
      (trimmed > 0 ? `Cut ${trimmed} lower-priority bullet(s) from older roles to fit. ` : "") +
      `Estimated ${pages.toFixed(1)} page(s).` +
      (lengthLevel === "warn" ? " It ends partway down page two. Adding source records would fill it with real evidence; do not pad it." : "") +
      (lengthLevel === "fail" ? " It still runs past two pages. Shorten the longest bullets." : "") +
      " This is an estimate: open the file in Word to confirm.",
  });

  const allLines = [draft.summary, ...draft.skills, ...draft.highlights.flatMap((g) => g.bullets.map((b) => b.text)), ...draft.experience.flatMap((r) => r.bullets.map((b) => b.text))];
  const filler = bannedPhrases(allLines.join(" "));
  findings.push({
    gate: "language",
    level: filler.length > 0 || failed.filler > 0 ? "warn" : "pass",
    check: "No filler language",
    detail:
      filler.length > 0
        ? `Found: ${filler.join(", ")}. Replace with something specific before sending.`
        : failed.filler > 0
          ? restoredNote("filler")
          : "No cliches or filler phrases, and no dashes.",
  });

  return { resume: { ...draft, estimatedPages: pages }, findings, summaryRemoved: [...summaryCheck.removed, ...summaryCheck.removedForTools, ...summaryCheck.removedForClaims] };
}
