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

export function promptMasterResumeFromMilitaryDocs(args: {
  vmetText: string;
  jstText: string;
  fitrepsText: string;
  branch?: string;
  mos?: string | null;
  rank?: string | null;
  targetRole?: string | null;
  serviceComponent?: string | null;
  yearsServiceAtEas?: number | null;
  offDutyEducation?: string[] | null;
  civilianCertifications?: string[] | null;
  additionalTraining?: string[] | null;
}) {
  return `
You are a senior military-to-civilian career transition analyst and former military recruiter.
Your job is to build a high-quality MASTER RESUME (not a job-specific resume) from military records.

Mandatory ingestion order (do not violate):
1) VMET (DD-2586)
2) JST
3) Observed FITREPs/EVALs (chronological)

Authority hierarchy and truth rules:
- Never invent credentials, roles, dates, metrics, or achievements.
- FITREP/EVAL observed periods are the only authoritative accomplishment windows.
- VMET is context + role translation only. VMET cannot create accomplishments or dates.
- JST is the authoritative training/certification source only. JST cannot create performance accomplishments.
- User-provided Off-Duty Education / Civilian Certifications / Additional Training are authoritative for those specific items.
- Service component and years of service at EAS are authoritative context for tenure framing.
- RS/RO language is credibility/impact framing for accomplishments already grounded in observed periods.
- If information is missing or ambiguous, do NOT assume. Add it to validation_questions.
- Do not imply retirement eligibility unless evidence supports it (for example, yearsServiceAtEas >= 20).

Resume quality bar:
- Civilian language only. Translate military jargon/acronyms to plain English.
- Impact-focused and ATS-readable while still human readable.
- Chronologically coherent, modular, and defensible.
- Do not over-compress into one paragraph. Produce sectioned resume text with line breaks.

Return strict JSON only with this exact shape:
{
  "career_timeline":[
    {
      "role_title":"",
      "organization":"",
      "date_range":"",
      "observed_periods":[],
      "notes":""
    }
  ],
  "accomplishment_bank":[
    {
      "bullet":"",
      "fitrep_date_range":"",
      "source":"MRO|RS|RO",
      "metrics_used":[]
    }
  ],
  "skills_and_credentials":{
    "education_training":[],
    "certifications":[],
    "technical_training":[],
    "leadership_pme":[]
  },
  "master_resume":"",
  "validation_questions":[]
}

Master resume construction requirements:
- master_resume must include these exact section headers:
  Executive Summary
  Core Competencies
  Professional Experience
  Education & Training
  Certifications
  Additional Qualifications
- Under Professional Experience, roles must be in reverse chronological order (most recent first, then older roles).
- If the same role title + organization appears in multiple adjacent periods, merge them into one entry.
- For merged entries, use one heading with the full combined date range and include all distinct bullets from those periods.
- Format rules inside master_resume:
  - Plain text only
  - No markdown tables
  - One blank line between sections
  - Under Professional Experience, each role has a heading line:
    "<Role Title> | <Organization> | <Date Range>"
  - Follow each role heading with 3-7 hyphen bullets grounded in FITREP/EVAL evidence
  - Each bullet should include action + scope + impact; include metric only when present in source
- Keep content role-agnostic and reusable for downstream targeting.

Validation requirement:
- If any critical date/source ambiguity exists, include explicit questions in validation_questions.
- If none, return validation_questions as an empty array.

Context:
branch=${args.branch ?? "USMC"}
mos=${args.mos ?? ""}
rank=${args.rank ?? ""}
targetRole=${args.targetRole ?? ""}
serviceComponent=${args.serviceComponent ?? ""}
yearsServiceAtEas=${args.yearsServiceAtEas ?? ""}
offDutyEducation=${(args.offDutyEducation ?? []).join("; ")}
civilianCertifications=${(args.civilianCertifications ?? []).join("; ")}
additionalTraining=${(args.additionalTraining ?? []).join("; ")}

VMET:
${args.vmetText}

JST:
${args.jstText}

FITREPs:
${args.fitrepsText}
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
You are a Senior Job Description Analyst and Career Transition Strategist.
Analyze this job posting deeply for a military-to-civilian candidate.

Return JSON:
{
  "plain_english_summary":"",
  "role_mission_summary":"",
  "role_level_guess":"Entry|Mid|Senior|Lead|Manager|Director",
  "hard_requirements":[],
  "soft_requirements":[],
  "implied_expectations":[],
  "top_must_have_signals":[],
  "ats_keywords_priority":[],
  "company_context_signals":[],
  "fit_risks":[],
  "clarifying_questions":[],
  "interview_focus_areas":[],
  "likely_interview_questions":[]
}

Depth requirements:
- hard_requirements: 10-20 items
- soft_requirements: 8-14 items
- implied_expectations: 6-12 items
- ats_keywords_priority: 12-25 items ranked highest first
- likely_interview_questions: 8-15 role-relevant questions
- Use precise, actionable language. Avoid generic filler.

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

export function promptTargetRoleResearch(args: {
  jobTitle: string;
}) {
  return `
You are a Senior Career Targeting Analyst.
Step 1 only: research role context for the provided job title.
Do not generate a resume.

Return strict JSON:
{
  "role_summary":"",
  "market_outlook":"",
  "role_archetypes":[],
  "seniority_signals":[],
  "typical_kpis":[],
  "tooling_stack":[],
  "compensation_signal":"",
  "typical_hard_skills":[],
  "typical_soft_skills":[],
  "employer_pain_points":[],
  "risk_indicators":[],
  "next_prompt":"If you'd like to continue, please paste the full job posting so I can conduct detailed role and resume alignment analysis."
}

Depth requirements:
- Provide substantive analysis, not one-liners.
- typical_hard_skills: 10-16 items
- typical_soft_skills: 8-12 items
- employer_pain_points: 6-10 items
- risk_indicators: 4-8 items
- Include role-relevant terminology and civilian hiring language.

Job title:
${args.jobTitle}
`.trim();
}

export function promptTargetPostingAnalysis(args: {
  jobTitle: string;
  jobDescriptionText: string;
  masterResumeText: string;
  company?: string | null;
}) {
  return `
You are a Senior Career Targeting Analyst.
Step 2 only: analyze the posting and alignment against the supplied master resume.
Do not generate a targeted resume in this step.

Return strict JSON:
{
  "hard_requirements":[],
  "soft_requirements":[],
  "implied_expectations":[],
  "ats_keywords_priority":[],
  "top_must_have_signals":[],
  "company_context_summary":"",
  "alignment_strengths":[],
  "hard_gaps":[],
  "soft_gaps":[],
  "advisory_notes":[],
  "recommended_decision":"A|B|C",
  "decision_rationale":"",
  "decision_checkpoint":"Based on this analysis, choose: A) generate targeted resume, B) adjust assumptions, or C) stop."
}

Depth requirements:
- hard_requirements: 10-20 items
- soft_requirements: 8-14 items
- implied_expectations: 6-12 items
- alignment_strengths/hard_gaps/soft_gaps: be specific and evidence-based from provided master resume text
- advisory_notes: include tactical recommendations for resume emphasis and interview framing

Job title: ${args.jobTitle}
Company: ${args.company ?? ""}

Job posting:
${args.jobDescriptionText}

Master resume:
${args.masterResumeText}
`.trim();
}

export function promptTargetedResumeGenerationV22(args: {
  jobTitle: string;
  jobDescriptionText: string;
  masterResumeText: string;
  company?: string | null;
  stage1ContextJson?: string;
  stage2ContextJson?: string;
  profileContactJson?: string;
  templateGuideText?: string;
}) {
  return `
You are a Senior Career Targeting Analyst and Resume Strategist.
Step 4/5 output: generate a targeted ATS resume only after explicit user consent.
Never invent credentials or experience.
Use civilian language and preserve factual integrity.
Use prior step context aggressively to maximize alignment accuracy.

Return strict JSON:
{
  "targeted_resume":"",
  "keywords_added":[],
  "changes_made":[],
  "ats_alignment_notes":[],
  "targeting_critique":"",
  "suggested_improvements":[],
  "next_prompt":"Would you like to proceed to application and interview preparation?"
}

Resume formatting rules inside targeted_resume:
- Plain text only
- No markdown tables
- One blank line between sections
- Hyphen bullets only
- Professional Experience must be reverse chronological (most recent first)
- Convert military billet/position titles into civilian-equivalent role titles aligned to the target job and company context.
- Preserve original military terms only when needed for credibility, and pair them with plain-English civilian wording.
- Preserve detailed, evidence-rich accomplishments from master resume where relevant
- Avoid over-compressing; retain enough detail to defend claims in interview
- Include a contact header at the top using provided profile contact data when available:
  Name line (if available), phone, professional email, LinkedIn, location, security clearance.
  If any contact field is missing, omit it cleanly without placeholders.
- If template guidance is provided, mirror its section sequencing and writing style when possible
  while preserving ATS readability and factual integrity.
- Never fabricate scope, seniority, responsibilities, or employers during title translation.

Company: ${args.company ?? ""}
Job title: ${args.jobTitle}

Job posting:
${args.jobDescriptionText}

Master resume:
${args.masterResumeText}

Step 1 context:
${args.stage1ContextJson ?? "{}"}

Step 2 context:
${args.stage2ContextJson ?? "{}"}

Profile contact context:
${args.profileContactJson ?? "{}"}

Optional resume template guidance text:
${args.templateGuideText ?? ""}
`.trim();
}
