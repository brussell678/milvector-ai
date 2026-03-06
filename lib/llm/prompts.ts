export function promptFitrepBullets(args: {
  extractedText: string;
  branch?: string;
  mos?: string | null;
  rank?: string | null;
  targetRole?: string | null;
}) {
  return `
You are an expert military-to-civilian resume translator.

Task:
Convert the source text into ATS-friendly resume bullets with metrics when possible.

Constraints:
- Bullets must be one line each (max ~160 chars)
- Use strong action verbs
- Quantify with numbers if present
- Do NOT include classified/sensitive info
- Output strictly as JSON with keys: bullets[], suggested_job_titles[], core_keywords[]
- Each bullet object: {category, bullet, metrics_used[]}

Context:
branch=${args.branch ?? "USMC"}
mos=${args.mos ?? ""}
rank=${args.rank ?? ""}
targetRole=${args.targetRole ?? ""}

SOURCE TEXT:
${args.extractedText}
`.trim();
}

export function promptMosTranslator(args: {
  mos: string;
  billets?: string[] | null;
  yearsExp?: number | null;
  interests?: string[] | null;
}) {
  return `
You are a career translator for military experience.

Return JSON:
{
  "civilian_roles":[{"title":"", "why_fit":"", "common_industries":[""], "keywords":[""]}],
  "recommended_certs":[{"name":"", "why":"", "time_to_get":""}]
}

Input:
MOS=${args.mos}
Billets=${(args.billets ?? []).join("; ")}
YearsExp=${args.yearsExp ?? ""}
Interests=${(args.interests ?? []).join("; ")}
`.trim();
}

export function promptJdDecoder(jobDescriptionText: string) {
  return `
You are a job description translator for transitioning service members.

Return JSON:
{
  "plain_english_summary":"",
  "must_haves":[],
  "nice_to_haves":[],
  "keywords":[],
  "role_level_guess":"Entry|Mid|Senior|Lead|Manager|Director",
  "likely_interview_questions":[]
}

JOB DESCRIPTION:
${jobDescriptionText}
`.trim();
}

export function promptResumeTargeter(args: {
  masterBulletsText: string;
  jobDescriptionText: string;
  company?: string | null;
  jobTitle?: string | null;
}) {
  return `
You are an ATS resume optimizer.

Return JSON:
{
  "targeted_resume":"",
  "keywords_added":[],
  "changes_made":[],
  "ats_alignment_notes":[]
}

Target role:
company=${args.company ?? ""}
jobTitle=${args.jobTitle ?? ""}

MASTER BULLETS:
${args.masterBulletsText}

JOB DESCRIPTION:
${args.jobDescriptionText}
`.trim();
}