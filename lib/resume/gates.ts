// Objective quality gates for resume content. Each one measures the text and
// returns a finding with the detail that produced it, so a failure is
// actionable and a pass is evidence. None of them takes the model's word.

export type GateLevel = "pass" | "warn" | "fail";

export type Finding = {
  gate: "evidence" | "figures" | "credentials" | "terms" | "claims" | "language" | "structure" | "length";
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

// ─── Claim level (C9) ─────────────────────────────────────────────────
// A tailored bullet may change every word of a master line except the facts.
// Figures, tools, and credentials are checked above. These are the other ways
// a rewrite inflates a true line: who owned the work, how far it reached, and
// whether it was the first or the best. Each word family must already be in
// the line the bullet cites.

const OWNERSHIP: [string, RegExp][] = [
  ["led", /\b(?:lead|leads|leading|led|leader|leaders|leadership)\b/i],
  ["directed", /\b(?:direct|directs|directing|directed|director)\b/i],
  ["managed", /\b(?:manage|manages|managing|managed|manager|management)\b/i],
  ["owned", /\b(?:own|owns|owning|owned|owner|ownership)\b/i],
  ["headed", /\b(?:head|heads|heading|headed)\b/i],
  ["oversaw", /\b(?:oversee|oversees|overseeing|oversaw|overseen|oversight)\b/i],
  ["spearheaded", /\bspearhead(?:s|ed|ing)?\b/i],
  ["commanded", /\b(?:command|commands|commanding|commanded|commander)\b/i],
  ["founded", /\b(?:found|founded|founding|founder)\b/i],
  ["established", /\bestablish(?:es|ed|ing)?\b/i],
  ["launched", /\blaunch(?:es|ed|ing)?\b/i],
  ["chaired", /\bchair(?:s|ed|ing)?\b/i],
  ["built", /\b(?:build|builds|building|built|builder)\b/i],
  ["designed", /\b(?:design|designs|designing|designed|designer)\b/i],
  ["created", /\b(?:create|creates|creating|created|creator)\b/i],
  ["authored", /\b(?:author|authors|authoring|authored)\b/i],
  ["architected", /\barchitect(?:s|ed|ing)?\b/i],
];

// Scope and rank a line can claim. Synonyms count as the same claim.
const REACH: [string, RegExp][] = [
  ["enterprise", /\benterprise(?:-wide)?\b/i],
  ["organization-wide", /\b(?:organization|company|firm|agency|department|service|corps)[- ]?wide\b/i],
  ["global", /\b(?:global|globally|worldwide)\b/i],
  ["international", /\b(?:international|multinational)\b/i],
  ["C-suite", /\bc-suite\b/i],
  ["Fortune 500", /\bfortune\s?(?:50|100|500)\b/i],
  ["first", /\b(?:first|first-ever|inaugural|pioneer(?:ed|ing)?)\b/i],
  ["only", /\b(?:only|sole|solely)\b/i],
  ["best", /\b(?:best|top|award-winning|unprecedented|record-setting|record-breaking)\b/i],
  ["largest", /\b(?:largest|highest|biggest|greatest|most)\b/i],
  ["large-scale", /\b(?:large-scale|high-impact|mission-critical)\b/i],
  ["commercial", /\b(?:commercial|private-sector|for-profit)\b/i],
];

/**
 * Words in a tailored line that claim more than the line it cites: an
 * ownership verb, a reach, or a rank that the cited support never states.
 * "Contributed to" stays "contributed to"; it never becomes "led".
 */
export function inflatedClaims(text: string, support: string, only: "all" | "reach" = "all"): string[] {
  const out: string[] = [];
  // A heading or theme ("Selected Build Outcomes") names work, not who owned it.
  for (const [name, pattern] of only === "reach" ? REACH : [...OWNERSHIP, ...REACH]) {
    if (pattern.test(text) && !pattern.test(support)) out.push(name);
  }
  return out;
}

// ─── Added terms ──────────────────────────────────────────────────────
// Tailoring puts a line in the posting's words. That is fair when the word
// replaces one that means the same thing ("uptime" for "readiness") and false
// when it adds an activity, purpose, or audience the line never states ("for
// AI adoption", "to support engineering teams"). Code cannot tell the two
// apart, so it counts them: a line that adds one or two is shown to the
// member to check beside its master line, and one that adds more is put back.

const ADDED_STOP = new Set(
  `about above across after against along also among and any are around as at be been being both but by can could did do does each either for from had has have how
if in into is it its more most much must new no not of on once one only or other our out over own per same she should so some such than that the their them then there these
they this those through to too under until up upon very was we were what when where which while who whom why will with within without would you your
ensure ensuring support supporting supported enable enabling enabled help helping helped using use used deliver delivering delivered drive driving provide providing
including include key strong work working worked well make making made create able ability role roles`.split(/\s+/),
);
// Civilian words for what every military line already has, so translating to them adds nothing.
const TRANSLATIONS = new Set(["stakeholder", "client", "customer", "team", "personnel", "people", "staff", "employee", "workforce", "organization", "leader", "executive", "partner", "member", "unit", "group"]);

const stemWord = (word: string) => (word.length > 4 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word);
// "business-intelligence" counts as itself and as "business" and "intelligence".
const contentWords = (text: string) =>
  new Set(
    (text.toLowerCase().match(/[a-z][a-z0-9+-]*/g) ?? [])
      .flatMap((token) => (token.includes("-") ? [token, ...token.split("-")] : [token]))
      .map(stemWord)
      .filter((w) => w.length > 2 && !ADDED_STOP.has(w)),
  );

// Word families: "adoption" is the line's "adopted", "training" its "trained".
const ROOT_SUFFIXES = ["izations", "ization", "ations", "ation", "ities", "ity", "ments", "ment", "ings", "ing", "ions", "ion", "ers", "er", "ed", "es", "s"];
function rootOf(word: string): string {
  let w = word.toLowerCase();
  for (const suffix of ROOT_SUFFIXES) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 4) {
      w = w.slice(0, -suffix.length);
      break;
    }
  }
  return w.endsWith("e") && w.length > 4 ? w.slice(0, -1) : w;
}

// The civilian word a posting uses for what a military line already says.
// A posting word on the left adds nothing when the line has a word on the right.
const CIVILIAN: [RegExp, RegExp][] = [
  [/^(?:supply|chain)$/, /\b(?:logistic|sustain|suppl|materiel|procure|inventor|distribut)/i],
  [/^(?:uptime|availab)/, /\b(?:readi|availab|operational)/i],
  [/^(?:senior|executive)/, /\b(?:command|general|senior|executive|flag|director)/i],
  [/^(?:business|intelligence|analytic|insight|analysis|data-driven)/, /\b(?:power bi|bi\b|analy|dashboard|data|business|intelligence|metric)/i],
  [/^(?:training|train|curricul|learning|learner|instruct|teach|educat|course|workshop|enablement|enabl)/, /\b(?:instruct|train|teach|course|curricul|educat|lesson|class|coach|mentor|workshop|enabl)/i],
  [/^(?:deploy|rollout|implement|launch|deliver)/, /\b(?:field|deploy|roll|implement|launch|deliver|execut|transition)/i],
  [/^(?:adopt)/, /\b(?:adopt|sustain|spread)/i],
  [/^(?:challeng|problem|blocker|barrier|risk|obstacle|issue)/, /\b(?:problem|barrier|constraint|issue|challeng|risk|obstacle|disrupt|gap)/i],
  [/^(?:impact|outcome|result|value|improv)/, /\b(?:result|outcome|effect|improv|impact|reduc|increas|cut|rais|saved|avoid)/i],
  [/^(?:actionable|decision|recommend)/, /\b(?:decision|recommend|action)/i],
  [/^(?:technolog|technical|tool|system|digital|solution|platform|software|application)/, /\b(?:system|tool|software|digital|technolog|technical|platform|application|solution|ai\b|model|automation)/i],
  [/^(?:cross-functional|multidisciplinary|interdisciplinary)/, /\b(?:multidisciplin|cross|joint|interdisciplin|specialt|functions|engineering)/i],
  [/^(?:scal)/, /\b(?:scal|beyond|across|expan|spread)/i],
  [/^(?:program|project|initiative|effort)/, /\b(?:program|project|initiative|effort|campaign)/i],
  [/^(?:strateg|roadmap|plan)/, /\b(?:strateg|plan|concept|roadmap)/i],
  [/^(?:governance|compliance|control|policy|audit|regulat)/, /\b(?:govern|complian|polic|regulat|control|oversight|inspect|audit|standard)/i],
  [/^(?:operation|operational|mission)/, /\b(?:operat|mission|readi)/i],
  [/^(?:workflow|process|procedure)/, /\b(?:workflow|process|procedure|routine|practice)/i],
  [/^(?:performance|metric|kpi|measure)/, /\b(?:perform|readi|metric|measure|kpi|indicator)/i],
  [/^(?:time|hour|cycle|speed|faster)/, /\b(?:hour|day|week|month|cycle|time)/i],
  [/^(?:organizational|enterprise)$/, /\b(?:organization|battalion|regiment|division|command|unit|enterprise)/i],
  [/^(?:requirement|need)/, /\b(?:requirement|need)/i],
  [/^(?:communicat|brief|present)/, /\b(?:communicat|brief|present|out-brief|report)/i],
];

/** Posting words in a tailored line that the line's own master text never uses. */
export function addedTerms(text: string, support: string, posting: string): string[] {
  if (!posting.trim()) return [];
  const have = contentWords(support);
  const haveRoots = new Set([...have].map(rootOf));
  const wanted = new Set([...contentWords(posting)].map(rootOf));
  return [...contentWords(text)].filter((w) => {
    const root = rootOf(w);
    if (!wanted.has(root) || have.has(w) || haveRoots.has(root) || TRANSLATIONS.has(w) || TRANSLATIONS.has(root)) return false;
    return !CIVILIAN.some(([word, from]) => (word.test(w) || word.test(root)) && from.test(support));
  });
}

// A line that adds this many posting words is rewriting the claim, not the
// wording; it gets one more try with the words named, then the master's line.
export const ADDED_TERMS_LIMIT = 3;

// Understating is as wrong as inflating: "led" never becomes "contributed to".
const WEAKER = /\b(?:contribut\w*|support(?:s|ed|ing)?|assist\w*|help(?:s|ed|ing)?|participat\w*|aided)\b/i;

/** Ownership the cited line states that a tailored line weakens to contributed, supported, or helped. */
export function understatedClaims(text: string, support: string): string[] {
  if (!WEAKER.test(text) || WEAKER.test(support)) return [];
  return OWNERSHIP.filter(([, pattern]) => pattern.test(support) && !pattern.test(text)).map(([name]) => name);
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
  "proven ability",
  "track record",
  "demonstrated success",
  "demonstrated ability",
  "positioned to",
  "highly motivated",
  "seasoned professional",
];

export function bannedPhrases(text: string): string[] {
  const lower = text.toLowerCase();
  const found = BANNED_PHRASES.filter((phrase) => lower.includes(phrase));
  // "track record" inside "proven track record" is one finding, not two.
  return found.filter((phrase) => !found.some((other) => other !== phrase && other.includes(phrase)));
}

// Bullets read in the past tense, including the current job (Brandon,
// 2026-11-21). A master often writes its current role in the present; this
// changes only the opening verb, never a fact.
const PAST: Record<string, string> = {
  lead: "Led", translate: "Translated", develop: "Developed", apply: "Applied", run: "Ran", build: "Built", author: "Authored",
  design: "Designed", manage: "Managed", create: "Created", drive: "Drove", deliver: "Delivered", define: "Defined", direct: "Directed",
  coach: "Coached", train: "Trained", advise: "Advised", write: "Wrote", use: "Used", turn: "Turned", partner: "Partnered",
  facilitate: "Facilitated", coordinate: "Coordinated", serve: "Served", support: "Supported", help: "Helped", oversee: "Oversaw",
  own: "Owned", plan: "Planned", prototype: "Prototyped", evaluate: "Evaluated", measure: "Measured", teach: "Taught", mentor: "Mentored",
  establish: "Established", launch: "Launched", found: "Founded", architect: "Architected", implement: "Implemented", integrate: "Integrated",
  automate: "Automated", analyze: "Analyzed", assess: "Assessed", map: "Mapped", conduct: "Conducted", present: "Presented", brief: "Briefed",
  contribute: "Contributed", align: "Aligned", connect: "Connected", convert: "Converted", scale: "Scaled", shape: "Shaped", maintain: "Maintained",
  operate: "Operated", produce: "Produced", provide: "Provided", reduce: "Reduced", improve: "Improved", streamline: "Streamlined",
  standardize: "Standardized", guide: "Guided", enable: "Enabled", equip: "Equipped", spearhead: "Spearheaded", champion: "Championed",
};

/** A bullet whose opening verb is in the present tense, with that verb in the past tense. */
export function pastTense(text: string): string {
  const match = text.match(/^([A-Za-z]+)(\b[\s\S]*)$/);
  if (!match) return text;
  const past = PAST[match[1].toLowerCase()];
  return past ? past + match[2] : text;
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
