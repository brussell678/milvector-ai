// Objective quality gates for resume content. Each one measures the text and
// returns a finding with the detail that produced it, so a failure is
// actionable and a pass is evidence. None of them takes the model's word.

export type GateLevel = "pass" | "warn" | "fail";

export type Finding = {
  gate: "evidence" | "figures" | "credentials" | "terms" | "language" | "structure" | "length";
  level: GateLevel;
  check: string;
  detail: string;
};

// ─── Figures ──────────────────────────────────────────────────────────

const NUMBER_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", twenty: "20", thirty: "30", forty: "40", fifty: "50", hundred: "100", thousand: "1000",
};

/**
 * The figures in a piece of text, normalized so "$2.3M", "2.3 million" and
 * "2,300,000" compare equal, and "12%" equals "12 percent".
 */
export function extractNumbers(text: string): string[] {
  const found = new Set<string>();
  const source = text.toLowerCase().replace(/(\d),(?=\d{3}\b)/g, "$1");
  for (const match of source.matchAll(/\$?\s?(\d+(?:\.\d+)?)\s*(k|m|mm|b|bn|thousand|million|billion)?\b/g)) {
    const raw = Number(match[1]);
    if (!Number.isFinite(raw)) continue;
    const unit = match[2] ?? "";
    const scale = /^(k|thousand)$/.test(unit) ? 1e3 : /^(m|mm|million)$/.test(unit) ? 1e6 : /^(b|bn|billion)$/.test(unit) ? 1e9 : 1;
    found.add(String(Math.round(raw * scale * 1000) / 1000));
  }
  return [...found];
}

/** Numbers so ordinary they carry no claim: list ordinals, "one of", single digits in prose. */
function isIncidental(value: string) {
  return Number(value) <= 2;
}

/**
 * Which figures in `text` do not appear anywhere in `sourceText`.
 * A year that falls inside the role's dates is not a claim and is skipped by
 * passing it in `allowed`.
 */
export function ungroundedNumbers(text: string, sourceText: string, allowed: string[] = []): string[] {
  const source = new Set(extractNumbers(sourceText));
  for (const word of sourceText.toLowerCase().match(/[a-z]+/g) ?? []) {
    if (NUMBER_WORDS[word]) source.add(NUMBER_WORDS[word]);
  }
  const ok = new Set(allowed);
  return extractNumbers(text).filter((n) => !source.has(n) && !ok.has(n) && !isIncidental(n));
}

// ─── Guarded credentials ──────────────────────────────────────────────

// Claims that cost a candidate the job, or their reputation, when untrue.
// Each must be supported by the record or the profile before it may appear.
const GUARDED: Array<{ label: string; pattern: RegExp; support: RegExp }> = [
  { label: "TS/SCI clearance", pattern: /\bTS\s*\/\s*SCI\b|\bSCI\b(?= (?:eligib|access|clear))/i, support: /\bSCI\b/i },
  { label: "Top Secret clearance", pattern: /\btop secret\b/i, support: /\btop secret\b|\bTS\b/i },
  { label: "Secret clearance", pattern: /(?<!top )\bsecret\b(?= (?:security )?clearance)|\bsecret clearance\b/i, support: /\bsecret\b/i },
  { label: "security clearance", pattern: /\b(?:security )?clearance\b/i, support: /\bclearance\b|\bsecret\b|\bSCI\b/i },
  { label: "doctorate", pattern: /\b(?:ph\.?d\.?|doctorate|doctor of)\b/i, support: /\b(?:ph\.?d\.?|doctorate|doctor of)\b/i },
  { label: "master's degree", pattern: /\b(?:master'?s degree|master of|m\.?b\.?a\.?|m\.s\.|m\.a\.)(?![a-z])/i, support: /\b(?:master'?s|master of|m\.?b\.?a\.?|m\.s\.|m\.a\.)/i },
  { label: "bachelor's degree", pattern: /\b(?:bachelor'?s degree|bachelor of|b\.s\.|b\.a\.)(?![a-z])/i, support: /\b(?:bachelor'?s|bachelor of|b\.s\.|b\.a\.)/i },
  { label: "associate degree", pattern: /\bassociate(?:'?s)? degree\b|\bassociate of\b/i, support: /\bassociate/i },
  { label: "PMP", pattern: /\bPMP\b/, support: /\bPMP\b|project management professional/i },
  { label: "CAPM", pattern: /\bCAPM\b/, support: /\bCAPM\b/i },
  { label: "Six Sigma", pattern: /\bsix sigma\b|\blean six\b/i, support: /six sigma/i },
  { label: "Scrum certification", pattern: /\bscrum master\b|\bCSM\b|\bcertified scrum\b/i, support: /scrum/i },
  { label: "Security+", pattern: /\bsecurity\+/i, support: /security\+/i },
  { label: "CISSP", pattern: /\bCISSP\b/, support: /\bCISSP\b/i },
  { label: "ITIL", pattern: /\bITIL\b/, support: /\bITIL\b/i },
  { label: "CDL", pattern: /\bCDL\b|commercial driver'?s license/i, support: /\bCDL\b|commercial driver/i },
  { label: "professional license", pattern: /\b(?:CPA|P\.?E\.? license|registered nurse|RN license)\b/i, support: /\b(?:CPA|P\.?E\.?|registered nurse|RN)\b/i },
];

/** Guarded claims that appear in `text` without support in `supportText`. */
export function unsupportedCredentials(text: string, supportText: string): string[] {
  return GUARDED.filter((g) => g.pattern.test(text) && !g.support.test(supportText)).map((g) => g.label);
}

// ─── Unsupported terms ────────────────────────────────────────────────

// Acronyms are how a posting's tools, systems, and regulations get slipped
// into a resume: "CMMS", "DOT", "ERP", "OSHA". Each one is a claim.
const COMMON_ACRONYMS = new Set(["US", "USA", "DOD", "USMC", "USN", "USAF", "USCG", "USSF", "NATO", "KPI", "ROI", "HR", "IT", "QA", "QC", "II", "III", "IV"]);
const SMALL_WORDS = ["of", "and", "the", "for", "to", "in"];

/** True when consecutive words in the support text have initials spelling the acronym. */
function expansionPresent(acronym: string, support: string) {
  const initials = (support.toLowerCase().match(/[a-z]+/g) ?? [])
    .filter((word) => !SMALL_WORDS.includes(word))
    .map((word) => word[0])
    .join("");
  return initials.includes(acronym.toLowerCase());
}

/**
 * Acronyms in the text that the support text neither contains nor spells out.
 * "SOPs" passes when the evidence says "standard operating procedure";
 * "CMMS" does not pass when the evidence never mentions one.
 */
export function unsupportedAcronyms(text: string, support: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/\b([A-Z][A-Z0-9&]{1,6})s?\b/g)) {
    const acronym = match[1];
    if (COMMON_ACRONYMS.has(acronym) || /^\d+$/.test(acronym)) continue;
    if (new RegExp("\\b" + acronym.replace(/&/g, "\\&") + "s?\\b", "i").test(support)) continue;
    if (acronym.length >= 3 && expansionPresent(acronym, support)) continue;
    found.add(acronym);
  }
  return [...found];
}

// Named tools, platforms, and frameworks that postings ask for by name and
// that are not acronyms, so the check above cannot see them. Naming one is a
// claim of having used it, so it must appear in the supporting text.
const NAMED_TOOLS: [string, RegExp][] = [
  ["Tableau", /\btableau\b/i],
  ["Power BI", /\bpower\s?bi\b/i],
  ["Power Automate", /\bpower\s?automate\b/i],
  ["Power Apps", /\bpower\s?apps\b/i],
  ["Looker", /\blooker\b/i],
  ["Qlik", /\bqlik\b/i],
  ["Alteryx", /\balteryx\b/i],
  ["Salesforce", /\bsalesforce\b/i],
  ["ServiceNow", /\bservice\s?now\b/i],
  ["Workday", /\bworkday\b/i],
  ["NetSuite", /\bnetsuite\b/i],
  ["HubSpot", /\bhubspot\b/i],
  ["Zendesk", /\bzendesk\b/i],
  ["Dynamics 365", /\bdynamics\s?365\b/i],
  ["Oracle", /\boracle\b/i],
  ["Jira", /\bjira\b/i],
  ["Confluence", /\bconfluence\b/i],
  ["Asana", /\basana\b/i],
  ["Smartsheet", /\bsmartsheet\b/i],
  ["Microsoft Project", /\b(?:microsoft|ms)\s?project\b/i],
  ["SharePoint", /\bsharepoint\b/i],
  ["Snowflake", /\bsnowflake\b/i],
  ["Databricks", /\bdatabricks\b/i],
  ["Azure", /\bazure\b/i],
  ["Google Cloud", /\bgoogle\s?cloud\b/i],
  ["Kubernetes", /\bkubernetes\b/i],
  ["Docker", /\bdocker\b/i],
  ["Python", /\bpython\b/i],
  ["TensorFlow", /\btensorflow\b/i],
  ["PyTorch", /\bpytorch\b/i],
  ["LangChain", /\blangchain\b/i],
  ["ChatGPT", /\bchatgpt\b/i],
  ["Copilot", /\bcopilot\b/i],
  ["Claude", /\bclaude\b/i],
  ["Gemini", /\bgemini\b/i],
  ["Palantir", /\bpalantir\b/i],
  ["UiPath", /\buipath\b/i],
  ["Prosci", /\bprosci\b/i],
  ["ADKAR", /\badkar\b/i],
  ["Miro", /\bmiro\b/i],
  ["Figma", /\bfigma\b/i],
  ["GitHub", /\bgithub\b/i],
];

/** Named tools in the text that the support text never mentions. */
export function unsupportedTools(text: string, support: string): string[] {
  return NAMED_TOOLS.filter(([, pattern]) => pattern.test(text) && !pattern.test(support)).map(([name]) => name);
}

// ─── Language ─────────────────────────────────────────────────────────

const BANNED_PHRASES = [
  "passionate about",
  "proven track record",
  "results-driven",
  "results driven",
  "synergy",
  "thought leader",
  "world-class",
  "rockstar",
  "ninja",
  "guru",
  "dynamic professional",
  "team player",
  "detail-oriented",
  "go-getter",
  "self-starter",
  "think outside the box",
];

export function bannedPhrases(text: string): string[] {
  const lower = text.toLowerCase();
  return BANNED_PHRASES.filter((phrase) => lower.includes(phrase));
}

/** Dashes read as machine-written on sight. Replace them; never ship them. */
export function cleanPunctuation(text: string): string {
  return text
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/→/g, "to")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ ,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ─── Repetition ───────────────────────────────────────────────────────

function tokens(text: string) {
  return new Set((text.toLowerCase().match(/[a-z0-9.]+/g) ?? []).filter((word) => word.length > 3));
}

/** Overlap of the smaller bullet's distinctive words with the other's, 0 to 1. */
export function overlap(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size < 5 || tb.size < 5) return 0;
  let shared = 0;
  for (const word of ta) if (tb.has(word)) shared += 1;
  return shared / Math.min(ta.size, tb.size);
}

export const DUPLICATE_THRESHOLD = 0.72;

/** Indexes of bullets that restate an earlier bullet. */
export function duplicateIndexes(bullets: string[]): number[] {
  const dupes: number[] = [];
  bullets.forEach((bullet, index) => {
    if (bullets.slice(0, index).some((earlier, e) => !dupes.includes(e) && overlap(bullet, earlier) >= DUPLICATE_THRESHOLD)) dupes.push(index);
  });
  return dupes;
}

// ─── Reporting ────────────────────────────────────────────────────────

export function summarize(findings: Finding[]) {
  return {
    pass: findings.filter((f) => f.level === "pass").length,
    warn: findings.filter((f) => f.level === "warn").length,
    fail: findings.filter((f) => f.level === "fail").length,
  };
}
