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
import { bannedPhrases, cleanPunctuation, duplicateIndexes, unsupportedAcronyms, unsupportedCredentials, unsupportedTools, ungroundedNumbers, extractNumbers, type Finding } from "@/lib/resume/gates";
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
  const kept = sentences.filter((sentence) => {
    // A named tool is reported with the tools check, not the credentials one.
    const named = unsupportedTools(sentence, figureSupport);
    if (named.length > 0) {
      named.forEach((tool) => tools.push(tool));
      removedForTools.push(sentence.trim());
      return false;
    }
    const bad = ungroundedNumbers(sentence, figureSupport, allowedNumbers).length > 0 || unsupportedCredentials(sentence, credentialSupport).length > 0;
    if (bad) removed.push(sentence.trim());
    return !bad;
  });
  return { kept: kept.join(" ").replace(/\s+/g, " ").trim(), removed, removedForTools };
}

// ─── Fit map ──────────────────────────────────────────────────────────

export type FitRequirement = {
  requirement: string;
  type: "mandatory" | "preferred";
  assessment: "strong" | "met" | "partial" | "gap";
  evidence: string[];
  bridge: string;
};

export type FitMap = {
  requirements: FitRequirement[];
  recommendation: "apply" | "stretch" | "pass";
  reason: string;
  keywords: string[];
  counts: { mandatory: Record<string, number>; preferred: Record<string, number> };
};

export function buildFitMap(raw: Record<string, unknown>, record: EvidenceRecord, today: Date = new Date()): FitMap {
  const evidence = usableEvidence(record);
  // A role's title and dates are evidence too: tenure and level requirements cite them.
  for (const role of record.roles) evidence.set(role.id, role.title + " " + dateRange(role));
  const requirements = rows(raw.requirements)
    .map((r) => {
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
    .filter((r) => r.requirement);

  const tally = (type: FitRequirement["type"]) => {
    const out: Record<string, number> = { strong: 0, met: 0, partial: 0, gap: 0 };
    for (const r of requirements.filter((x) => x.type === type)) out[r.assessment] += 1;
    return out;
  };
  const counts = { mandatory: tally("mandatory"), preferred: tally("preferred") };

  let recommendation = (["apply", "stretch", "pass"].includes(text(raw.recommendation)) ? text(raw.recommendation) : "stretch") as FitMap["recommendation"];
  // "Apply" is not available while a mandatory requirement is an outright gap.
  if (recommendation === "apply" && counts.mandatory.gap > 0) recommendation = "stretch";

  return { requirements, recommendation, reason: text(raw.recommendation_reason), keywords: list(raw.keywords).slice(0, 24), counts };
}

// ─── Targeted resume ──────────────────────────────────────────────────

export type TargetedBullet = { text: string; evidence: string[] };
export type TargetedRole = { roleId: string; title: string; organization: string; dates: string; bullets: TargetedBullet[] };
export type TargetedResume = {
  targetTitle: string;
  summary: string;
  skills: string[];
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

function layoutOf(resume: Omit<TargetedResume, "estimatedPages">, contactLines: number): LayoutInput {
  const groups = [resume.education, resume.certifications, resume.training].filter((g) => g.length > 0);
  return {
    hasTitleLine: !!resume.targetTitle,
    contactLines,
    summary: resume.summary,
    skillsLine: resume.skills.join(" • "),
    roles: resume.experience.map((role) => ({ bullets: role.bullets.map((b) => b.text) })),
    educationItems: groups.reduce((n, g) => n + g.length, 0),
    educationGroups: groups.length,
  };
}

/**
 * Applies every gate to a generated resume and returns what survived, plus a
 * finding for each check. Content that fails a hard gate is removed, not
 * flagged and shipped.
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
}): GateResult {
  const { record } = args;
  const findings: Finding[] = [];
  const roleById = new Map(record.roles.map((r) => [r.id, r]));
  const credentialSupport = [...record.credentials.map((c) => c.text), args.profileClearance ? `${args.profileClearance} clearance` : ""].join("; ");
  const allUsableText = [...usableEvidence(record).values()].join(" ");
  const summarySupport = args.extraSupport ? `${allUsableText} ${args.extraSupport}` : allUsableText;
  const allowedNumbers = args.yearsOfService ? [String(args.yearsOfService), String(Math.floor(args.yearsOfService))] : [];

  let noEvidence = 0;
  let wrongRole = 0;
  let badFigures = 0;
  let badCredentials = 0;
  let badTools = 0;
  let unknownRoles = 0;
  const toolDetails = new Set<string>();
  const unsupportedTerms = new Set<string>();
  const figureDetails: string[] = [];
  const credentialDetails = new Set<string>();

  const experience: TargetedRole[] = [];
  for (const entry of rows(args.raw.experience)) {
    const role = roleById.get(text(entry.role_id));
    if (!role) {
      unknownRoles += 1;
      continue;
    }
    const own = new Map(role.accomplishments.filter((a) => a.unverifiedNumbers.length === 0).map((a) => [a.id, a.text]));
    const bullets: TargetedBullet[] = [];
    for (const b of rows(entry.bullets)) {
      const body = cleanPunctuation(text(b.text));
      const cited = list(b.evidence);
      if (!body) continue;
      if (cited.length === 0) {
        noEvidence += 1;
        continue;
      }
      // Evidence from another role would credit this job with work done in a different one.
      const valid = cited.filter((id) => own.has(id));
      if (valid.length === 0) {
        wrongRole += 1;
        continue;
      }
      const support = valid.map((id) => own.get(id)).join(" ");
      const ungrounded = ungroundedNumbers(body, support, allowedNumbers);
      if (ungrounded.length > 0) {
        badFigures += 1;
        figureDetails.push(`"${body.slice(0, 70)}..." (${ungrounded.join(", ")})`);
        continue;
      }
      const claims = unsupportedCredentials(body, credentialSupport);
      if (claims.length > 0) {
        badCredentials += 1;
        claims.forEach((c) => credentialDetails.add(c));
        continue;
      }
      // A named tool must be in the evidence this bullet cites (C4).
      const tools = unsupportedTools(body, support + " " + role.title + " " + role.organization);
      if (tools.length > 0) {
        badTools += 1;
        tools.forEach((t) => toolDetails.add(t));
        continue;
      }
      const terms = unsupportedAcronyms(body, support + " " + role.title + " " + role.militaryTitle + " " + role.organization);
      terms.forEach((t) => unsupportedTerms.add(t));
      bullets.push({ text: body, evidence: valid });
    }
    if (bullets.length === 0) continue;
    experience.push({
      roleId: role.id,
      title: args.titlesFromRecord ? role.title : cleanPunctuation(text(entry.title)) || role.title,
      organization: role.organization,
      dates: dateRange(role),
      bullets,
    });
  }

  const removed = noEvidence + wrongRole;
  findings.push({
    gate: "evidence",
    level: removed > 0 || unknownRoles > 0 ? "warn" : "pass",
    check: "Every bullet cites your record",
    detail:
      removed > 0 || unknownRoles > 0
        ? `Removed ${removed} bullet(s) that did not trace to an accomplishment in the same role${unknownRoles ? ` and ${unknownRoles} role(s) not in your record` : ""}.`
        : "Every bullet traces to an accomplishment in your record, under the role where it happened.",
  });
  findings.push({
    gate: "figures",
    level: badFigures > 0 ? "warn" : "pass",
    check: "Every figure matches your record",
    detail: badFigures > 0 ? `Removed ${badFigures} bullet(s) with a figure not found in the cited evidence: ${figureDetails.slice(0, 3).join("; ")}` : "Every number, dollar amount, and percentage appears in the evidence it cites.",
  });

  // Order roles by the record's dates, not the order the model returned them.
  const order = new Map(record.roles.map((r, index) => [r.id, index]));
  const seenRoles = new Set<string>();
  const ordered = experience
    .filter((r) => (seenRoles.has(r.roleId) ? false : (seenRoles.add(r.roleId), true)))
    .sort((a, b) => (order.get(a.roleId) ?? 0) - (order.get(b.roleId) ?? 0));
  findings.push({ gate: "structure", level: "pass", check: "Roles in reverse chronological order", detail: `${ordered.length} role(s), ordered and dated from your record.` });

  // Repetition across the whole resume
  const flat = ordered.flatMap((role, r) => role.bullets.map((b, i) => ({ r, i, text: b.text })));
  const dupes = duplicateIndexes(flat.map((f) => f.text)).map((index) => flat[index]);
  for (const d of dupes.reverse()) ordered[d.r].bullets.splice(d.i, 1);
  findings.push({
    gate: "structure",
    level: dupes.length > 0 ? "warn" : "pass",
    check: "No achievement stated twice",
    detail: dupes.length > 0 ? `Removed ${dupes.length} bullet(s) that restated an earlier one.` : "No near-duplicate bullets.",
  });

  // Summary and skills
  const summaryTools: string[] = [];
  const summaryCheck = honestSentences(cleanPunctuation(text(args.raw.summary)), summarySupport, credentialSupport, allowedNumbers, summaryTools);
  summaryTools.forEach((t) => toolDetails.add(t));
  const skills = list(args.raw.skills).map(cleanPunctuation);
  // A skills entry is a direct claim, so a tool, system, or regulation named
  // there must appear somewhere in the record.
  const recordText = summarySupport + " " + record.roles.map((r) => r.title + " " + r.militaryTitle).join(" ") + " " + credentialSupport;
  const droppedSkills: string[] = [];
  const keptSkills = skills.filter((skill) => {
    const claims = unsupportedCredentials(skill, credentialSupport);
    claims.forEach((c) => credentialDetails.add(c));
    if (claims.length > 0) return false;
    if (unsupportedAcronyms(skill, recordText).length > 0 || unsupportedTools(skill, recordText).length > 0) {
      droppedSkills.push(skill);
      return false;
    }
    return true;
  });
  const credentialRemovals = badCredentials + (skills.length - keptSkills.length - droppedSkills.length) + summaryCheck.removed.length;
  findings.push({
    gate: "terms",
    level: droppedSkills.length > 0 || unsupportedTerms.size > 0 || badTools > 0 || summaryTools.length > 0 ? "warn" : "pass",
    check: "No tools or systems your record does not mention",
    detail:
      droppedSkills.length > 0 || unsupportedTerms.size > 0 || badTools > 0 || summaryTools.length > 0
        ? [
            badTools || summaryTools.length
              ? `Removed ${badTools} bullet(s)${summaryTools.length ? " and a summary sentence" : ""} naming a tool the cited evidence does not mention: ${[...toolDetails].join(", ")}.`
              : "",
            droppedSkills.length ? "Removed from skills, because nothing in your record mentions them: " + droppedSkills.join(", ") + "." : "",
            unsupportedTerms.size ? "Check these terms in your bullets before sending. They are in the posting but not in your record: " + [...unsupportedTerms].join(", ") + "." : "",
          ]
            .filter(Boolean)
            .join(" ")
        : "Every tool, system, and regulation named appears in your record.",
  });
  findings.push({
    gate: "credentials",
    level: credentialRemovals > 0 ? "warn" : "pass",
    check: "No clearance, degree, or certification you do not hold",
    detail:
      credentialRemovals > 0
        ? `Removed ${credentialRemovals} statement(s) with a credential or figure your record does not show${credentialDetails.size ? `: ${[...credentialDetails].join(", ")}` : ""}.${summaryCheck.removed.length ? ` From the summary: "${summaryCheck.removed.join(" ").slice(0, 160)}"` : ""} If you do hold it, add it to your profile and rebuild.`
        : "Every clearance, degree, and certification named is in your record or profile.",
  });

  // Credentials section, chosen by id
  const credById = new Map(record.credentials.map((c) => [c.id, c]));
  const chosenIds = list(args.raw.credential_ids).filter((id) => credById.has(id));
  const chosen = (chosenIds.length ? chosenIds.map((id) => credById.get(id)!) : record.credentials).filter((c) => c.kind !== "clearance");
  const ofKind = (kind: CredentialKind, max: number) => chosen.filter((c) => c.kind === kind).map((c) => c.text).slice(0, max);

  const draft = {
    targetTitle: cleanPunctuation(text(args.raw.target_title)),
    summary: summaryCheck.kept,
    skills: keptSkills.slice(0, 16),
    experience: ordered.filter((r) => r.bullets.length > 0),
    education: ofKind("education", 3),
    certifications: ofKind("certification", 5),
    training: ofKind("training", 4),
    gaps: list(args.raw.gaps),
    emphasized: list(args.raw.what_was_emphasized),
  };

  // Length: trim from the end of the oldest roles until it fits two pages.
  const contactLines = args.contactLines ?? 2;
  let trimmed = 0;
  let pages = estimatePages(layoutOf(draft, contactLines));
  while (pages > FIT_TARGET_PAGES) {
    const candidates = draft.experience.map((role, index) => ({ role, index })).filter(({ role }) => role.bullets.length > 2);
    if (candidates.length > 0) {
      candidates[candidates.length - 1].role.bullets.pop();
    } else if (draft.experience.length > 3) {
      draft.experience.pop();
    } else {
      break;
    }
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

  const filler = bannedPhrases([draft.summary, ...draft.skills, ...draft.experience.flatMap((r) => r.bullets.map((b) => b.text))].join(" "));
  findings.push({
    gate: "language",
    level: filler.length > 0 ? "warn" : "pass",
    check: "No filler language",
    detail: filler.length > 0 ? `Found: ${filler.join(", ")}. Replace with something specific before sending.` : "No cliches or filler phrases, and no dashes.",
  });

  return { resume: { ...draft, estimatedPages: pages }, findings, summaryRemoved: [...summaryCheck.removed, ...summaryCheck.removedForTools] };
}
