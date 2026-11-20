// Prompts for the evidence-based resume engine (Resume Studio).
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
- For each requirement, cite the evidence ids from the record that support it. Use only ids that appear in the record, copied exactly. Cite the strongest 1 to 4.
- assessment: "strong" (direct evidence at or above the level asked), "met" (clear evidence), "partial" (related evidence that does not fully cover it), "gap" (nothing in the record). A gap has no evidence ids.
- bridge: for "partial" and "gap" only, the honest way to address it: the closest real experience to emphasize, or a plain statement that it is a gap to own. Never suggest claiming something the record does not show.
- Be fair as well as honest. Service members are often screened out on vocabulary, not capability. Where military experience genuinely covers a civilian requirement, say so and assess it on substance.
- A required license, degree, or clearance the record does not show is a gap. Say so plainly.
- Requirements about years of experience or level of responsibility are supported by roles: cite the ROLE ids whose titles and dates cover them, and count the years the dates actually show.
- recommendation: "apply" (competitive), "stretch" (worth applying, with named risks), or "pass" (a hard mandatory requirement is missing). Give the reason in two or three sentences. Do not produce a numeric fit score.
- keywords: 10 to 20 terms from the posting that screening software will look for, most important first.

Return strict JSON:
{
  "requirements": [
    { "requirement": "", "type": "mandatory|preferred", "assessment": "strong|met|partial|gap", "evidence": [], "bridge": "" }
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

// ─── Targeting: generate ──────────────────────────────────────────────

export function promptTargetedFromRecord(args: {
  jobTitle: string;
  company?: string | null;
  jobDescriptionText: string;
  recordText: string;
  fitMapText: string;
  yearsOfService?: number | null;
  // "master": the record is the member's own refined master resume, so its
  // role titles stand as written.
  source?: "record" | "master";
}) {
  const fromMaster = args.source === "master";
  return `
You are a resume strategist writing a targeted resume for a transitioning U.S. service member, for one specific posting. You select and reword from ${fromMaster ? "the master resume they wrote and refined themselves" : "their verified record"}. You do not add to it.

Every bullet is checked by software after you write it. A bullet is deleted if it cites no evidence id, cites an id that is not in the record, cites evidence from a different role, or contains a figure its cited evidence does not contain. Write bullets that survive.

Rules:
- experience: choose the roles that matter for this posting, by role id. Include enough of the timeline that there is no unexplained gap in the last 10 to 15 years.
- Each bullet: one achievement, action then scope then result, in the posting's vocabulary where the record genuinely supports it. Cite in "evidence" the accomplishment ids (ACC-...) it was written from. All cited ids must belong to that same role.
- Figures: use them, they are what makes a bullet credible. Copy each one exactly from the cited evidence. Never round, convert, combine, or estimate.
- Never attach a tool, system, software, regulation, or standard to a bullet unless the cited evidence names it. Appending a posting keyword ("using a CMMS", "DOT compliance", "in SAP") to a true accomplishment makes it false. If the posting wants something the record lacks, put it in gaps.
- Order bullets within each role strongest-for-this-posting first. If the resume runs long, bullets are cut from the end.
${fromMaster ? "- The record is the member's own refined master, already in their words. Use it fully: 5 to 7 bullets for the most relevant roles, 3 to 4 for the next most relevant, 2 for older ones. Keep each bullet close to the master's wording, tightened toward the posting's vocabulary. Target two full pages; under about 1.8 pages is too short. If it runs long, software trims bullets from the oldest roles." : "- 4 to 6 bullets for the most relevant roles, 2 to 3 for older or less relevant ones. Aim to fill two pages for a career of ten years or more."}
${fromMaster ? "- title: leave it empty. The title, organization, and dates come from the master resume as the member wrote them." : "- title: a civilian job title for that role that is honest about its level. The organization and dates are filled in from the record; do not write them."}
- summary: 3 to 4 lines positioning the candidate for THIS posting, from the record only. A figure may appear only if it appears in the record. Do not state a clearance, degree, or certification unless it is in CREDENTIALS.
- skills: 10 to 16 keywords the posting asks for that the record genuinely demonstrates. Never list a certification, license, clearance, tool, system, or regulation the record does not show. Skills entries naming something absent from the record are deleted.
- credential_ids: the CRED ids worth listing for this posting, most relevant first.
- gaps: posting requirements the record does not meet, stated plainly so the candidate can prepare for them. Do not hide a gap by implying coverage.
- Plain civilian English. No em dashes. No filler such as "results-driven", "proven track record", or "team player".
- ${OPSEC}

Return strict JSON:
{
  "target_title": "",
  "summary": "",
  "skills": [],
  "experience": [
    { "role_id": "ROLE-01", "title": "", "bullets": [ { "text": "", "evidence": ["ACC-01-01"] } ] }
  ],
  "credential_ids": [],
  "gaps": [],
  "what_was_emphasized": []
}

Job title: ${args.jobTitle}
Company: ${args.company ?? ""}
Years of service: ${args.yearsOfService ?? ""}

JOB POSTING:
${args.jobDescriptionText}

FIT MAP (requirements and the evidence that supports each):
${args.fitMapText || "(not run)"}

CANDIDATE RECORD (ids first):
${args.recordText}
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
export function promptSummaryRewrite(args: { jobTitle: string; company?: string | null; kept: string; removed: string[]; support: string }) {
  return `
Rewrite the summary at the top of a targeted resume for the posting below. A check removed sentences that stated something the candidate's master resume does not support. Write 3 to 4 sentences that position the candidate for this posting using only facts stated in MASTER TEXT. Copy any figure exactly as the master states it, or leave it out. Name no degree, certification, clearance, tool, or system the master text does not name. Plain civilian English. No em dashes. No filler such as "results-driven", "proven track record", or "team player".

Return strict JSON: { "summary": "" }

Job title: ${args.jobTitle}
Company: ${args.company ?? ""}

WHAT REMAINED:
${args.kept || "(nothing)"}

REMOVED, AND WHY IT FAILED: it stated something the master does not support:
${args.removed.join("\n")}

MASTER TEXT (summary, competencies, and highlights):
${args.support}
`.trim();
}
