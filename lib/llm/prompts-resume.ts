// Prompts for the Targeted Resume Builder, plus the record batch reader kept
// from the retired Resume Studio (docs/TARGETED_RESUME_PLAN.md 4.3).
//
// Division of labor: the model reads, translates, and selects. Code assigns
// ids, checks every figure against its source, checks credentials against the
// record, orders roles, and measures length. See lib/resume/.

const OPSEC = `OPSEC: never carry over classified or operationally sensitive detail: named operations, unit designations tied to operations, exact deployment locations or dates, tactics, or system capabilities and vulnerabilities. State the effect and the skill in unclassified terms.`;

// ─── Record: extract ──────────────────────────────────────────────────

export function promptRecordExtract(args: { documentsText: string; branch?: string | null }) {
  return `
You are reading a U.S. service member's career documents to capture what they establish as facts. You are NOT writing a resume. Later steps depend on this being faithful to the documents.

What each document type may establish:
- FITREP / EVAL: the career timeline (billet, organization, reporting period) and the accomplishments of that period. These are the only source of roles and dates.
- AWARD (Summary of Action or citation): depth on a specific accomplishment: scope, scale, quantified impact. An award never creates a role or dates. Attach it to the role whose period covers the award's period of action. Set from_award true.
- JST: training and certifications only. No accomplishments.
- VMET: context for translating an occupation. It creates no accomplishments and no dates.
- MASTER_RESUME: a resume the member already wrote. Treat its roles, dates, and bullets as the member's own statements.

Rules:
- Record only what a document states. Never infer, combine, round, or improve a figure. Copy every number, dollar amount, percentage, and count exactly as written.
- One accomplishment per distinct action. Keep the scope and the result together in one item. Write it as a plain factual sentence close to the source wording; a later step translates it.
- Give every role a short key (r1, r2, ...). If two documents cover the same billet in the same organization, use ONE role with the earliest start and latest end.
- Dates as "Mon YYYY". Use "Present" only when the document shows the billet is current. Leave a date empty when the document does not give it.
- source_doc is the DOC number the item came from.
- If something material is ambiguous (overlapping billets, a missing date, an unclear figure), add a specific question to "questions" instead of guessing.
- ${OPSEC}

Return strict JSON:
{
  "roles": [ { "key": "r1", "military_title": "", "organization": "", "start": "", "end": "", "source_doc": 1 } ],
  "accomplishments": [ { "role_key": "r1", "text": "", "source_doc": 1, "from_award": false } ],
  "credentials": [ { "kind": "education|certification|training|clearance", "text": "", "source_doc": 1 } ],
  "questions": []
}

Branch: ${args.branch ?? "USMC"}

DOCUMENTS:
${args.documentsText}
`.trim();
}

// ─── Record: consolidate ──────────────────────────────────────────────

export function promptRecordConsolidate(args: {
  rolesText: string;
  accomplishmentsText: string;
  credentialsText: string;
  branch?: string | null;
  mos?: string | null;
  rank?: string | null;
}) {
  return `
You are a senior military-to-civilian career analyst. The facts below were extracted from a service member's records, each with an id. Turn them into one clean career record in civilian language.

Rules:
- Merge roles that are the same billet in the same organization across consecutive reporting periods: one role, earliest start, latest end. List every source role key in from_role_keys. Never merge different billets.
- Under each role, write its accomplishments in civilian language: action, scope, result. Expand acronyms and translate ranks, billets, and occupational codes into terms a civilian hiring manager understands.
- Each accomplishment lists in "from" the ids of the extracted items it was written from. When a fitness report and an award describe the SAME action, write ONE accomplishment that uses the report for what happened and the award for scope and impact, and list both ids. Never write two accomplishments for one action.
- Figures: keep every number, dollar amount, percentage, and count exactly as it appears in the source items. Do not round, convert, estimate, or add a figure. An accomplishment may omit a figure; it may never contain one its sources lack.
- Do not drop distinct accomplishments to save space. This is the complete record; later steps select from it.
- title is a civilian-readable job title that honestly reflects the level of the billet. Do not inflate seniority. military_title keeps the billet as written.
- credentials: one entry per distinct degree, certification, course, or clearance, merged across duplicates, with "from" ids.
- summary: 3 to 4 sentences describing this person's professional profile, built only from the accomplishments below. No figures in the summary unless they appear in an accomplishment. No credential the credentials list does not contain.
- competencies: 10 to 16 civilian skill areas the accomplishments demonstrate.
- open_questions: specific things the member should confirm (gaps in the timeline, overlapping dates, ambiguous scope). Empty array if none.
- ${OPSEC}

Return strict JSON:
{
  "summary": "",
  "competencies": [],
  "roles": [
    {
      "title": "",
      "military_title": "",
      "organization": "",
      "start": "",
      "end": "",
      "from_role_keys": [],
      "accomplishments": [ { "text": "", "from": [] } ]
    }
  ],
  "credentials": [ { "kind": "education|certification|training|clearance", "text": "", "from": [] } ],
  "open_questions": []
}

Service context: branch=${args.branch ?? "USMC"}; occupation=${args.mos ?? ""}; rank=${args.rank ?? ""}

EXTRACTED ROLES (key | title | organization | dates):
${args.rolesText}

EXTRACTED ACCOMPLISHMENTS (id | role key | text):
${args.accomplishmentsText}

EXTRACTED CREDENTIALS (id | kind | text):
${args.credentialsText}
`.trim();
}

// ─── Targeting: fit map ───────────────────────────────────────────────

export function promptFitMap(args: { jobTitle: string; company?: string | null; jobDescriptionText: string; recordText: string }) {
  return `
You are a hiring analyst mapping one job posting against one candidate's verified career record. The candidate is a transitioning U.S. service member deciding whether this job is worth applying to.

Rules:
- List the posting's requirements: 10 to 18 items, the ones that will decide screening. Mark each "mandatory" (stated as required, must have, minimum) or "preferred" (preferred, nice to have, a plus, or implied by the duties).
- Mark as "condition" any term of the job the candidate accepts rather than proves from a record: travel (any percentage), relocation, schedule, shifts, nights, weekends, on-call, on-site or in-office presence, physical demands, passing a background check or drug test, work authorization or sponsorship, and the ability to obtain a clearance. A condition is never a gap and never a reason to pass, even when the posting calls it required. Give it assessment "confirm" and no evidence. A license, degree, or clearance the candidate must already hold is a requirement, not a condition.
- For each requirement, cite the evidence ids from the record that support it. Use only ids that appear in the record, copied exactly. Cite the strongest 1 to 4.
- assessment: "strong" (direct evidence at or above the level asked), "met" (clear evidence), "partial" (related evidence that does not fully cover it), "gap" (nothing in the record). A gap has no evidence ids.
- bridge: for "partial" and "gap" only, the honest way to address it: the closest real experience to emphasize, or a plain statement that it is a gap to own. Never suggest claiming something the record does not show.
- Be fair as well as honest. Service members are often screened out on vocabulary, not capability. Where military experience genuinely covers a civilian requirement, say so and assess it on substance.
- A required license, degree, or clearance the record does not show is a gap. Say so plainly.
- Requirements about years of experience or level of responsibility are supported by roles: cite the ROLE ids whose titles and dates cover them, and count the years the dates actually show.
- recommendation: "apply" (competitive), "stretch" (worth applying, with named risks), or "pass" (a required qualification is missing; never a condition). Give the reason in two or three sentences. Do not produce a numeric fit score.
- keywords: 10 to 20 terms from the posting that screening software will look for, most important first.

Return strict JSON:
{
  "requirements": [
    { "requirement": "", "type": "mandatory|preferred|condition", "assessment": "strong|met|partial|gap|confirm", "evidence": [], "bridge": "" }
  ],
  "recommendation": "apply|stretch|pass",
  "recommendation_reason": "",
  "keywords": []
}

Job title: ${args.jobTitle}
Company: ${args.company ?? ""}

JOB POSTING:
${args.jobDescriptionText}

CANDIDATE RECORD (ids first):
${args.recordText}
`.trim();
}

/**
 * Step one of tailoring from the member's own refined master: the plan. The
 * model chooses what goes on the page (title, themes, summary, keyword band,
 * two themed highlight sections, and which master lines go under which job)
 * by line id. It writes no bullet text; step two rewrites the chosen lines.
 */
export function promptTailorPlan(args: {
  jobTitle: string;
  company?: string | null;
  jobDescriptionText: string;
  recordText: string;
  fitMapText: string;
  yearsOfService?: number | null;
}) {
  return `
You are a resume strategist planning a resume for a transitioning U.S. service member, tailored to one specific posting. The source is the master resume they wrote and refined themselves; every line in it is true. You choose what goes on the page. You do not write the bullets: a second step rewrites each line you choose for this posting.

Plan, in page order:
1. target_title: the posting's job title, exactly as the posting writes it, without location, remote status, or requisition number. Applicant tracking systems match on it.
2. tagline: three short themes from this posting that the master proves, separated by " | ", for example "AI DEPLOYMENT | PRODUCT DEFINITION AND ENABLEMENT | MEASURED ADOPTION".
3. summary: 3 to 4 sentences that describe what this person does and has done, not adjectives about them. Open with a noun phrase naming their practice in the posting's terms (for example "AI deployment practitioner who ..."), resting on the master's own summary. Then the two or three strongest proofs in the master for what this posting wants, concretely. Each sentence lists in "evidence" the line ids it rests on and states only what those lines say: no client type, scope, ownership, or result they do not state. A figure only exactly as the master states it. Never "positioned to", "proven", "demonstrated", "track record", "passionate", or "results-driven".
4. skills: 14 to 16 terms in the posting's own words, each something the master genuinely shows, so a reader could point to the line that proves it. Prefer the posting's exact phrases. Never a tool, system, certification, methodology, or regulation the master does not name, and never a posting phrase the master gives no evidence for.
5. highlights: exactly two groups, each named for one of the two things this posting most wants, as "Selected <theme> Outcomes". 3 bullets each: the strongest evidence for that theme from anywhere in the career.
6. experience: the career by role id, with no unexplained gap in the last 10 to 15 years, best for this posting first: 5 bullets for the most relevant roles, 4 for the next, 2 for older ones. Plan about 24 bullets in all, highlights included; software trims the oldest to fit two pages. Roles with no dates are project sections: at most 2, only when they matter for this posting, never in place of a job.
- Each bullet is a list of 1 to 3 line ids that a second step writes into one bullet. Combine lines only when they are the same piece of work in the same role (a system and the result it produced, a program and what it changed); otherwise one line per bullet. Never use a line id twice.
7. keywords: 15 to 25 words and phrases from the posting the rewrite should use where a chosen line genuinely supports them, most important first.

Also:
- credential_ids: the CRED ids worth listing, most relevant first. Never state a clearance, degree, or certification that is not in CREDENTIALS.
- gaps: posting requirements the master does not meet, stated plainly so the candidate can prepare for them.
- Plain civilian English. No em dashes or en dashes.
- ${OPSEC}

Return strict JSON:
{
  "target_title": "",
  "tagline": "",
  "summary": [ { "text": "", "evidence": [] }, { "text": "", "evidence": ["ACC-01-02"] } ],
  "skills": [],
  "highlights": [ { "heading": "Selected ... Outcomes", "bullets": [["ACC-01-02", "ACC-01-04"], ["ACC-03-01"]] } ],
  "experience": [ { "role_id": "ROLE-01", "bullets": [["ACC-01-01"], ["ACC-01-03", "ACC-01-05"]] } ],
  "keywords": [],
  "credential_ids": [],
  "gaps": [],
  "what_was_emphasized": []
}

Job title: ${args.jobTitle}
Company: ${args.company ?? ""}
Years of service: ${args.yearsOfService ?? ""}

JOB POSTING:
${args.jobDescriptionText}

FIT MAP (requirements and the master lines that support each):
${args.fitMapText || "(not run)"}

MASTER RESUME (ids first):
${args.recordText}
`.trim();
}

/**
 * Step two of tailoring: rewrites each chosen master line for the posting.
 * Wording only; code checks every rewrite against its line afterwards and
 * puts the master's own line back wherever a fact changed.
 */
export function promptTailorLines(args: {
  jobTitle: string;
  company?: string | null;
  jobDescriptionText: string;
  keywords: string[];
  // previous and problem: a second try at a bullet a check put back.
  lines: { slot: string; section: string; lines: string[]; previous?: string; problem?: string }[];
}) {
  return `
You are rewriting lines from a candidate's own master resume so each one speaks to one job posting. The candidate wrote every line, and every fact in it is true. Your only job is the wording. Each slot holds one to three lines from the same piece of work; write each slot as one bullet.

For each bullet:
- Reframe it, do not just edit it. Open with what this posting values, which is often the result, and say it in the posting's words and phrases, especially the POSTING KEYWORDS, wherever they mean the same thing as words in the lines. That is how applicant tracking systems and recruiters match a resume to a job. Expect most of the words to change while every fact stays.
- When a slot has more than one line, join them into one bullet. Say that one thing caused or produced another only when a line says so.
- Lead with a fact the lines state. Never open with an outcome or purpose they do not state: "Delivered transformation initiatives for customers by ...", "Drove innovation by ...", and "Facilitated executive engagement by ..." are false framing when the lines do not say so.
- Put military terms in the civilian terms this posting uses: a battalion or unit is an organization, Marines are personnel or team members, a commander is a senior leader, a billet is a role, materiel is equipment. Readiness may become availability or uptime, and logistics or sustainment may become supply chain, where the posting uses those words.
- Action, then scope, then result. One to two lines for a JOB bullet, up to three for a HIGHLIGHT; cut words this posting does not need.
- Past tense for every bullet, including the current job: Led, Built, Translated, not Lead, Build, Translate.
- Every bullet comes back rewritten. A line returned unchanged, or with only a tense or a word swapped, fails the task.

Keep the facts exactly:
- Every figure, exactly as written. Never round, convert, or combine.
- The candidate's level, both ways. Contributed stays contributed, supported stays supported, advised stays advised: never write led, directed, managed, owned, oversaw, built, designed, created, founded, or established unless the line already uses that word. And led stays led: never weaken what a line says the candidate led, built, or designed to contributed, supported, or helped.
- Every named tool, product, system, method, and program, by its name (for example ChatGPT, Power BI, Lean Six Sigma). Never swap a name for a generic phrase like "AI tools".
- No new activity, purpose, audience, scope, or result. Do not add "for AI adoption", "to support engineering teams", "enterprise-wide", "global", "first", or "best" unless the line says it. One stays one: a platform does not become platforms.

Examples:
- Line: "Supervised 12 Marines performing preventive maintenance on 40 tactical vehicles, raising readiness from 78 percent to 94 percent."
  For a fleet operations posting that stresses uptime: "Raised fleet uptime from 78 percent to 94 percent across 40 vehicles by supervising a 12-person team through preventive maintenance."
- Line: "Contributed to the battalion's transition to a new logistics information system by training 30 Marines on it."
  For a systems implementation posting: "Trained 30 personnel on a new logistics information system, contributing to the organization's transition to it."
- Lines: "Designed a readiness dashboard in Power BI for battalion leadership." and "The dashboard cut weekly briefing preparation from 6 hours to 2."
  For a business intelligence posting: "Cut weekly briefing preparation from 6 hours to 2 by designing a Power BI readiness dashboard for senior leaders."

Plain civilian English. No em dashes or en dashes. No filler such as "results-driven", "proven track record", or "thought leader".

A slot that shows YOUR LAST TRY was checked and put back for the reason given. Write it again without that problem, keeping the rest of the reframing.

Return strict JSON, one bullet per slot:
{ "bullets": [ { "slot": "S1", "text": "" } ] }

Job title: ${args.jobTitle}
Company: ${args.company ?? ""}

POSTING KEYWORDS: ${args.keywords.join(" | ") || "(none given; use the posting)"}

JOB POSTING:
${args.jobDescriptionText}

SLOTS TO WRITE (slot | section | line, or lines joined by ||):
${args.lines.map((l) => `${l.slot} | ${l.section} | ${l.lines.join(" || ")}${l.previous ? ` | YOUR LAST TRY: "${l.previous}" | PUT BACK BECAUSE IT ${l.problem}` : ""}`).join("\n")}
`.trim();
}

// ─── Master resume: structure ──────────────────────────────────────────

/**
 * Splits the member's own master resume into its parts so code can check a
 * targeted resume against it. Copying, not writing: code confirms every
 * returned line appears in the master word for word and drops any that do not.
 */
export function promptMasterStructure(args: { masterText: string }) {
  return `
You are splitting one person's resume into its parts so software can check later writing against it. You are NOT editing it.

The one rule: copy text exactly. Every piece of text you return must appear in the resume word for word, with the same spelling, numbers, and punctuation. Do not reword, shorten, merge, correct, or add anything. A bullet that wraps across lines in the text is returned whole, as one line. Software compares every line you return with the resume and throws away any that do not match.

What goes where:
- summary: each paragraph of the profile or summary at the top.
- competencies: each skill, area of expertise, or competency item. Split a list separated by "|" or bullets into its items.
- roles: every job or billet, in the order the resume lists them. title, organization, start, and end are copied from the resume (end may be "Present"). lines: every bullet or sentence that belongs to that job.
- A section with its own heading that describes work the person did, such as a project, program, or selected-work section, is a role too, even with no dates: its heading is the title, copy any organization it names, leave start and end empty, and put its bullets in lines.
- A line from a highlights, impact, recognition, or evaluation excerpts section goes under a role only when the line itself, or the sentence that introduces it, names that role or its organization. Otherwise it goes in unassigned.
- credentials: each degree, certification, course, or training item, and any security clearance, with its kind.
- unassigned: every other line that states something about the person, such as awards and highlights that do not belong to one role.
- Leave out the person's name, phone number, email address, street address, and links.

Return strict JSON:
{
  "summary": [],
  "competencies": [],
  "roles": [
    { "title": "", "organization": "", "start": "", "end": "", "lines": [] }
  ],
  "credentials": [ { "kind": "education|certification|training|clearance", "text": "" } ],
  "unassigned": []
}

RESUME:
${args.masterText}
`.trim();
}

/**
 * A targeted summary lost a sentence to a check (a figure, credential, or tool
 * the master does not support). One rewrite, from the master's own words.
 */
export function promptSummaryRewrite(args: { jobTitle: string; company?: string | null; kept: string; removed: string[]; support: string; recordText?: string }) {
  // With the master's lines by id, each sentence cites what it rests on and is
  // checked against exactly those lines.
  const cited = !!args.recordText;
  return `
Rewrite the summary at the top of a targeted resume for the posting below. A check removed sentences that stated something the candidate's master resume does not support. Write 3 to 4 sentences that position the candidate for this posting using only facts stated in MASTER TEXT${cited ? " and MASTER RESUME" : ""}. ${cited ? `Each sentence lists in "evidence" the line ids it rests on (an opening sentence resting on MASTER TEXT alone may list none) and states only what those lines say: no client type, scope, ownership, or result they do not state. ` : ""}Copy any figure exactly as the master states it, or leave it out. Name no degree, certification, clearance, tool, or system the master text does not name. Plain civilian English. No em dashes. No filler such as "results-driven", "proven track record", or "team player".

Return strict JSON: ${cited ? `{ "summary": [ { "text": "", "evidence": [] } ] }` : `{ "summary": "" }`}

Job title: ${args.jobTitle}
Company: ${args.company ?? ""}

WHAT REMAINED:
${args.kept || "(nothing)"}

REMOVED, AND WHY IT FAILED: it stated something the master does not support:
${args.removed.join("\n")}

MASTER TEXT (summary, competencies, and highlights):
${args.support}
${cited ? `
MASTER RESUME (ids first):
${args.recordText}` : ""}
`.trim();
}

/**
 * A targeted resume built from a master came out short. One request to add
 * bullets from master lines it did not use; the same checks run again after.
 */
export function promptFillFromMaster(args: { jobTitle: string; company?: string | null; jobDescriptionText: string; draftText: string; unusedText: string; pages: number; missingRoles?: string }) {
  return `
A targeted resume written from a candidate's own master resume needs more from that master: it is about ${args.pages.toFixed(1)} pages, where the target is two full pages${args.missingRoles ? ", and it skips jobs, which reads as an unexplained gap" : ""}. Add bullets from the UNUSED MASTER LINES below.

Every added bullet is checked by software. It is deleted if it cites no id, cites an id that is not listed, cites lines from more than one role, contains a figure its cited lines do not contain, or names a tool, system, credential, or regulation its cited lines do not name.

Rules:
${args.missingRoles ? `- Give each job listed under TIMELINE GAPS 1 to 2 bullets, so the resume has no unexplained gap.\n` : ""}- Add 4 to 8 bullets in total, most to the roles that matter for this posting and have the fewest bullets now. No role may end up with more than 8 bullets in total.
- Past tense for every bullet, including the current job.
- Tailor each bullet to the posting: lead with what it cares about, in its words where the cited line supports them, with military terms put in civilian ones. Action, then scope, then result. One achievement per bullet.
- Keep the facts of the cited line exactly: its figures, its verb for what the candidate did (contributed stays contributed; never upgrade to led, managed, built, or designed), and its reach (never add enterprise, global, first, only, or best). Software puts the master's own line back wherever a rewrite changes one.
- Cite in "evidence" the line ids (ACC-...) it was written from, all from the same role.
- Copy figures exactly. Never round, combine, or estimate.
- Do not repeat anything already in the draft.
- Plain civilian English. No em dashes. No filler.

Return strict JSON:
{ "additions": [ { "role_id": "ROLE-02", "bullets": [ { "text": "", "evidence": ["ACC-02-05"] } ] } ] }

Job title: ${args.jobTitle}
Company: ${args.company ?? ""}

JOB POSTING:
${args.jobDescriptionText}

THE DRAFT SO FAR:
${args.draftText}

UNUSED MASTER LINES (role, then ids first):
${args.unusedText}
${args.missingRoles ? `\nTIMELINE GAPS (jobs the draft skips):\n${args.missingRoles}` : ""}
`.trim();
}

/**
 * Tailoring check: each rewritten bullet or summary sentence beside the
 * candidate's own lines it was written from. Names any claim the lines do not
 * state; code decides what happens to it.
 */
export function promptVerifyLines(args: { items: { slot: string; lines: string[]; text: string }[] }) {
  return `
You are checking a tailored resume against the candidate's own master resume. Each item below is a rewritten bullet or summary sentence, with the candidate's own lines it was written from. The candidate wrote those lines and they are true. The rewrite may change every word; it may not change the facts.

For each item, decide whether the rewrite states anything its lines do not:
- an activity, purpose, audience, client or customer type, sector, or deliverable the lines do not state
- more ownership or seniority than the lines state (for example led, directed, managed, or owned where the lines say contributed, helped, supported, or advised), or less (contributed where the lines say led)
- more scope or reach (enterprise, global, organization-wide, all, multiple) or a different count than the lines state
- a result, outcome, or cause-and-effect link the lines do not state
- a tool, system, method, or credential the lines do not name

Fine, and not a problem: reordering; tense; leaving details out; abbreviations (IT for information technology); civilian words for military ones (personnel or teams for Marines, organization for battalion, senior leaders or executives for commanders, executive-level for command-level, equipment availability for materiel readiness); and plain synonyms for the same thing (insights for perspectives, domains for specialties, staff for technicians, designed for architected). Flag only a change a hiring manager would read as a different fact.

Examples that ARE problems: "Led end-to-end delivery" where the line says lead discovery and implementation planning (adds delivery and ownership of implementation); "supporting enterprise-wide AI education" (adds reach); "NARA-compliant" where the line says NARA-aligned (a compliance claim); "ensuring transparency" (adds an outcome); "for commercial clients" (adds a client type); "optimized" where the line says adjusted (claims a result).

Return strict JSON, one check per item, same slots:
{ "checks": [ { "slot": "S1", "ok": true, "problem": "" } ] }
When ok is false, "problem" names the unsupported claim in a few words, quoting the rewrite.

ITEMS:
${args.items.map((item) => `${item.slot}\nLINES: ${item.lines.join(" || ")}\nREWRITE: ${item.text}`).join("\n\n")}
`.trim();
}
