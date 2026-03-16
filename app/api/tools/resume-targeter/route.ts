import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { ResumeTargeterInputSchema } from "@/lib/validators/tools";
import { generateJson } from "@/lib/llm/client";
import { getEnv } from "@/lib/env";
import {
  promptResumeTargeter,
  promptTargetPostingAnalysis,
  promptTargetRoleResearch,
  promptTargetedResumeGenerationV22,
} from "@/lib/llm/prompts";
import {
  buildTargetedResumeFilename,
  buildTargetedResumeText,
  renderTargetedResumeDocx,
  StructuredExperience,
  StructuredTargetedResume,
} from "@/lib/resume-template";


function monthNumber(value: string) {
  const lower = value.toLowerCase();
  if (/(jan|january)/.test(lower)) return 1;
  if (/(feb|february)/.test(lower)) return 2;
  if (/(mar|march)/.test(lower)) return 3;
  if (/(apr|april)/.test(lower)) return 4;
  if (/may/.test(lower)) return 5;
  if (/(jun|june)/.test(lower)) return 6;
  if (/(jul|july)/.test(lower)) return 7;
  if (/(aug|august)/.test(lower)) return 8;
  if (/(sep|sept|september)/.test(lower)) return 9;
  if (/(oct|october)/.test(lower)) return 10;
  if (/(nov|november)/.test(lower)) return 11;
  if (/(dec|december)/.test(lower)) return 12;
  return 0;
}

function experienceEndScore(dates: string) {
  const normalized = dates.trim();
  if (!normalized) return 0;
  if (/(present|current|now)/i.test(normalized)) return 999999;

  const years = Array.from(normalized.matchAll(/\b(?:19|20)\d{2}\b/g)).map((match) => Number(match[0]));
  const year = years.length > 0 ? years[years.length - 1] : 0;
  const tail = normalized.split(/[\u2013\-]/).pop() ?? normalized;
  const month = monthNumber(tail) || monthNumber(normalized);
  return year * 100 + month;
}

function sortExperienceReverseChronological(experience: StructuredExperience[]) {
  return [...experience].sort((left, right) => {
    const scoreDelta = experienceEndScore(right.dates) - experienceEndScore(left.dates);
    if (scoreDelta !== 0) return scoreDelta;
    return right.role_title.localeCompare(left.role_title);
  });
}
type ResumeTargeterOutput = {
  targeted_resume: string;
  keywords_added: string[];
  changes_made: string[];
  ats_alignment_notes: string[];
  targeting_critique?: string;
  suggested_improvements?: string[];
  next_prompt?: string;
};

type TitleResearchOutput = {
  role_summary: string;
  market_outlook: string;
  role_archetypes?: string[];
  seniority_signals?: string[];
  typical_kpis?: string[];
  tooling_stack?: string[];
  compensation_signal?: string;
  typical_hard_skills: string[];
  typical_soft_skills: string[];
  employer_pain_points: string[];
  risk_indicators: string[];
  next_prompt: string;
};

type PostingAnalysisOutput = {
  hard_requirements: string[];
  soft_requirements: string[];
  implied_expectations: string[];
  ats_keywords_priority?: string[];
  top_must_have_signals?: string[];
  company_context_summary: string;
  alignment_strengths: string[];
  hard_gaps: string[];
  soft_gaps: string[];
  advisory_notes: string[];
  recommended_decision?: "A" | "B" | "C";
  decision_rationale?: string;
  decision_checkpoint: string;
};

type StructuredTargetedResumeOutput = StructuredTargetedResume & {
  keywords_added: string[];
  changes_made: string[];
  ats_alignment_notes: string[];
  targeting_critique?: string;
  suggested_improvements?: string[];
  next_prompt?: string;
};

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function toExperienceArray(value: unknown): StructuredExperience[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = (item ?? {}) as Record<string, unknown>;
      return {
        role_title: String(row.role_title ?? "").trim(),
        organization: String(row.organization ?? "").trim(),
        location: String(row.location ?? "").trim(),
        dates: String(row.dates ?? "").trim(),
        bullets: toStringArray(row.bullets),
      } satisfies StructuredExperience;
    })
    .filter(
      (row) =>
        row.role_title || row.organization || row.location || row.dates || row.bullets.length > 0
    );
}

function normalizeStructuredResume(value: StructuredTargetedResumeOutput): StructuredTargetedResumeOutput {
  return {
    target_title: String(value.target_title ?? "").trim(),
    executive_summary: String(value.executive_summary ?? "").trim(),
    core_skills: toStringArray(value.core_skills),
    experience: sortExperienceReverseChronological(toExperienceArray(value.experience)),
    off_duty_education: toStringArray(value.off_duty_education),
    civilian_certifications: toStringArray(value.civilian_certifications),
    additional_training: toStringArray(value.additional_training),
    keywords_added: toStringArray(value.keywords_added),
    changes_made: toStringArray(value.changes_made),
    ats_alignment_notes: toStringArray(value.ats_alignment_notes),
    targeting_critique: value.targeting_critique ? String(value.targeting_critique).trim() : undefined,
    suggested_improvements: toStringArray(value.suggested_improvements),
    next_prompt: value.next_prompt ? String(value.next_prompt).trim() : undefined,
  };
}

function cleanText(value?: string | null) {
  return (value ?? "").trim();
}

function uniqueTrimmed(items: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items.map((value) => value.trim()).filter(Boolean)) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function compactTextByPriority(raw: string, maxChars: number, priorityRegex: RegExp) {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const chosen: string[] = [];
  let used = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !priorityRegex.test(trimmed)) continue;
    if (used + trimmed.length + 1 > maxChars) break;
    chosen.push(trimmed);
    used += trimmed.length + 1;
  }

  if (chosen.length === 0) {
    return raw.slice(0, maxChars);
  }

  return chosen.join("\n");
}

function extractSectionLines(text: string, headings: string[]) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const normalizedHeadings = headings.map((heading) => heading.trim().toLowerCase());
  const start = lines.findIndex((line) => normalizedHeadings.includes(line.trim().toLowerCase()));
  if (start < 0) return [] as string[];

  const collected: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^[A-Z][A-Z &\/]{4,}$/.test(trimmed)) break;
    collected.push(trimmed.replace(/^[-*]\s*/, ""));
  }

  return uniqueTrimmed(collected);
}

function normalizeProfessionalDevelopmentItem(item: string) {
  return item
    .replace(/^[-*]\s*/, "")
    .replace(/[;:,]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isUsefulProfessionalDevelopmentLine(item: string) {
  const normalized = normalizeProfessionalDevelopmentItem(item);
  const lower = normalized.toLowerCase();

  if (!normalized) return false;
  if (normalized.length > 120) return false;
  if (/[.!?]$/.test(normalized) && normalized.split(" ").length > 10) return false;
  if (/(commendation|award|outstanding performance|responsible for|served as|supervised|ensure |worked with|managed the platoon|training exercises|counselings|welfare)/i.test(lower)) {
    return false;
  }

  return /(degree|bachelor|master|mba|university|college|associate|cert|certificate|certification|license|belt|pmp|scrum|security\+|itil|six sigma|course|school|academy)/i.test(lower);
}

function classifyProfessionalDevelopment(items: string[]) {
  const education: string[] = [];
  const certifications: string[] = [];
  const training: string[] = [];

  for (const rawItem of uniqueTrimmed(items)) {
    const item = normalizeProfessionalDevelopmentItem(rawItem);
    const lower = item.toLowerCase();
    if (!isUsefulProfessionalDevelopmentLine(item)) continue;

    if (/(b\.?s\.?|bachelor|master|m\.?s\.?|mba|degree|university|college|associate)/i.test(lower)) {
      education.push(item);
      continue;
    }
    if (/(cert|certificate|certification|license|belt|pmp|scrum|security\+|itil|six sigma)/i.test(lower)) {
      certifications.push(item);
      continue;
    }
    training.push(item);
  }

  return {
    off_duty_education: uniqueTrimmed(education),
    civilian_certifications: uniqueTrimmed(certifications),
    additional_training: uniqueTrimmed(training),
  };
}

function extractProfessionalDevelopmentLinesFromMasterText(text: string) {
  const headings = [
    "Education",
    "Education & Training",
    "Education and Training",
    "Education & Professional Development",
    "Education / Professional Development",
    "Education & Certifications",
    "Professional Development",
    "Certifications",
    "Licenses & Certifications",
    "Training",
    "Training History",
    "Courses Successfully Completed",
  ];

  const sectionLines = headings.flatMap((heading) => extractSectionLines(text, [heading]));
  return uniqueTrimmed(sectionLines).slice(0, 20);
}

function buildRelevanceTerms(args: {
  jobTitle?: string | null;
  company?: string | null;
  jobDescriptionText?: string | null;
  stage1Context?: Record<string, unknown>;
  stage2Context?: Record<string, unknown>;
}) {
  const blob = [
    args.jobTitle ?? "",
    args.company ?? "",
    args.jobDescriptionText ?? "",
    JSON.stringify(args.stage1Context ?? {}),
    JSON.stringify(args.stage2Context ?? {}),
  ].join(" ").toLowerCase();

  return uniqueTrimmed(
    blob
      .split(/[^a-z0-9\+]+/i)
      .map((term) => term.trim())
      .filter((term) => term.length >= 4)
  );
}

function scoreProfessionalDevelopmentItem(item: string, terms: string[]) {
  const lower = item.toLowerCase();
  let score = 0;

  for (const term of terms) {
    if (lower.includes(term)) score += term.length > 7 ? 3 : 2;
  }

  if (/(b\.?s\.?|bachelor|master|m\.?s\.?|mba|degree|university|college|associate)/i.test(lower)) score += 4;
  if (/(cert|certificate|certification|license|belt|pmp|scrum|security\+|itil|six sigma)/i.test(lower)) score += 3;
  if (/(course|school|academy|program)/i.test(lower)) score += 1;
  return score;
}

function rankProfessionalDevelopmentItems(items: string[], terms: string[], maxItems: number) {
  return uniqueTrimmed(items)
    .map((item, index) => ({ item, index, score: scoreProfessionalDevelopmentItem(item, terms) }))
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .slice(0, maxItems)
    .map((entry) => entry.item);
}

function finalizeProfessionalDevelopment(
  resume: StructuredTargetedResumeOutput,
  extras: { off_duty_education: string[]; civilian_certifications: string[]; additional_training: string[] },
  targeting: {
    jobTitle?: string | null;
    company?: string | null;
    jobDescriptionText?: string | null;
    stage1Context?: Record<string, unknown>;
    stage2Context?: Record<string, unknown>;
  }
) {
  const classifiedExtras = classifyProfessionalDevelopment([
    ...extras.off_duty_education,
    ...extras.civilian_certifications,
    ...extras.additional_training,
  ]);

  const classifiedResume = classifyProfessionalDevelopment([
    ...resume.off_duty_education,
    ...resume.civilian_certifications,
    ...resume.additional_training,
  ]);

  const terms = buildRelevanceTerms(targeting);
  const educationSource = classifiedExtras.off_duty_education.length > 0 ? classifiedExtras.off_duty_education : classifiedResume.off_duty_education;
  const certificationSource = classifiedExtras.civilian_certifications.length > 0 ? classifiedExtras.civilian_certifications : classifiedResume.civilian_certifications;
  const trainingSource = classifiedExtras.additional_training.length > 0 ? classifiedExtras.additional_training : classifiedResume.additional_training;

  return {
    ...resume,
    experience: sortExperienceReverseChronological(resume.experience),
    off_duty_education: rankProfessionalDevelopmentItems(educationSource, terms, 3),
    civilian_certifications: rankProfessionalDevelopmentItems(certificationSource, terms, 4),
    additional_training: rankProfessionalDevelopmentItems(trainingSource, terms, 3),
  };
}

function toContextArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function buildTargetingContextText(stage1Context: Record<string, unknown> | undefined, stage2Context: Record<string, unknown> | undefined) {
  const lines: string[] = [];

  if (stage1Context) {
    const hardSkills = toContextArray(stage1Context.typical_hard_skills).slice(0, 8);
    const softSkills = toContextArray(stage1Context.typical_soft_skills).slice(0, 6);
    const painPoints = toContextArray(stage1Context.employer_pain_points).slice(0, 6);
    if (hardSkills.length) lines.push(`Step 1 hard skills: ${hardSkills.join("; ")}`);
    if (softSkills.length) lines.push(`Step 1 soft skills: ${softSkills.join("; ")}`);
    if (painPoints.length) lines.push(`Step 1 employer pain points: ${painPoints.join("; ")}`);
  }

  if (stage2Context) {
    const mustHaves = toContextArray(stage2Context.top_must_have_signals).slice(0, 8);
    const hardRequirements = toContextArray(stage2Context.hard_requirements).slice(0, 10);
    const implied = toContextArray(stage2Context.implied_expectations).slice(0, 6);
    const strengths = toContextArray(stage2Context.alignment_strengths).slice(0, 6);
    const gaps = toContextArray(stage2Context.hard_gaps).slice(0, 4);
    const companySummary = String(stage2Context.company_context_summary ?? "").trim();
    if (mustHaves.length) lines.push(`Step 2 top must-have signals: ${mustHaves.join("; ")}`);
    if (hardRequirements.length) lines.push(`Step 2 hard requirements: ${hardRequirements.join("; ")}`);
    if (implied.length) lines.push(`Step 2 implied expectations: ${implied.join("; ")}`);
    if (strengths.length) lines.push(`Step 2 alignment strengths to emphasize: ${strengths.join("; ")}`);
    if (gaps.length) lines.push(`Step 2 hard gaps to de-emphasize or offset: ${gaps.join("; ")}`);
    if (companySummary) lines.push(`Step 2 company context: ${companySummary}`);
  }

  return lines.join("\n").slice(0, 5000);
}

function sanitizeExperienceLocations(resume: StructuredTargetedResumeOutput, currentLocation?: string | null) {
  const normalizedCurrent = cleanText(currentLocation).toLowerCase();
  if (!normalizedCurrent) return resume;

  const populated = resume.experience.filter((row) => cleanText(row.location));
  if (populated.length === 0) return resume;

  const allMatchCurrent = populated.every((row) => cleanText(row.location).toLowerCase() === normalizedCurrent);
  if (!allMatchCurrent) return resume;

  return {
    ...resume,
    experience: sortExperienceReverseChronological(resume.experience.map((row) => ({ ...row, location: "" }))),
  };
}



function buildSupplementalSourceContext(args: {
  masterResumeText: string;
  docs: Array<{ doc_type: string; filename: string; extracted_text: string | null; created_at: string }>;
}) {
  const masterEducation = extractSectionLines(args.masterResumeText, [
    "Education & Training",
    "Education and Training",
    "Education & Professional Development",
  ]);
  const credentialPriority = /(cert|certificate|course|training|education|degree|diploma|qualification|license|school|program|academy|university|college)/i;
  const docsByType = {
    master: args.docs.filter((doc) => doc.doc_type === "MASTER_RESUME"),
  };

  const sections: string[] = [];

  if (masterEducation.length > 0) {
    sections.push(`Master resume education/training section:\n${masterEducation.map((line) => `- ${line}`).join("\n")}`);
  }

  const pushDocSection = (
    label: string,
    docs: Array<{ extracted_text: string | null; filename: string }>,
    maxChars: number,
    priority: RegExp
  ) => {
    const blocks = docs
      .map((doc) => {
        const raw = (doc.extracted_text ?? "").trim();
        if (!raw) return "";
        return `### ${doc.filename}\n${compactTextByPriority(raw, maxChars, priority)}`;
      })
      .filter(Boolean);

    if (blocks.length > 0) {
      sections.push(`${label}:\n${blocks.join("\n\n")}`);
    }
  };

  pushDocSection("Additional master resume evidence", docsByType.master, 3000, credentialPriority);

  return sections.join("\n\n").slice(0, 14000);
}

export async function POST(req: Request) {
  const env = getEnv();
  const { userId } = await requireUser();
  const supabase = await supabaseServer();
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

  const body = await req.json();
  const parsed = ResumeTargeterInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const {
    workflowStage,
    userConfirmedGenerate,
    masterResumeArtifactId,
    masterBulletsArtifactId,
    masterResumeDocumentId,
    pastedResumeText,
    stage1Context,
    stage2Context,
    jobDescriptionText,
    company,
    jobTitle,
  } = parsed.data;

  const stage = workflowStage ?? "quick_generate";

  if (stage === "title_research") {
    if (!jobTitle || jobTitle.trim().length < 2) {
      return NextResponse.json({ error: "Job title is required for title research." }, { status: 400 });
    }

    const started = Date.now();
    const llm = await generateJson<TitleResearchOutput>(promptTargetRoleResearch({ jobTitle }), {
      model: env.TARGETED_RESUME_MODEL ?? env.OPENAI_MODEL,
      timeoutMs: 60000,
      temperature: 0.2,
    });
    const latency = Date.now() - started;

    const baseRun = {
      user_id: userId,
      tool_name: "resume_targeter" as const,
      input_json: { workflowStage: stage, jobTitle },
      latency_ms: latency,
    };

    if (!llm.ok) {
      await supabase.from("tool_runs").insert({ ...baseRun, status: "error", error_message: llm.error });
      return NextResponse.json({ error: llm.error }, { status: 500 });
    }

    await supabase.from("tool_runs").insert({
      ...baseRun,
      status: "success",
      output_json: llm.data as unknown as Record<string, unknown>,
      tokens_in: llm.tokensIn ?? null,
      tokens_out: llm.tokensOut ?? null,
    });

    return NextResponse.json({ workflowStage: stage, ...llm.data });
  }

  let masterText = pastedResumeText ?? "";
  const selectedArtifactId = masterResumeArtifactId ?? masterBulletsArtifactId;

  if (!masterText && selectedArtifactId) {
    const { data: artifact, error: artErr } = await supabase
      .from("resume_artifacts")
      .select("*")
      .eq("id", selectedArtifactId)
      .eq("user_id", userId)
      .single();

    if (artErr) return NextResponse.json({ error: "Master resume artifact not found" }, { status: 404 });
    masterText = artifact.content;
  }

  if (!masterText && masterResumeDocumentId) {
    const { data: document, error: docErr } = await supabase
      .from("documents")
      .select("id,doc_type,extracted_text,text_extracted")
      .eq("id", masterResumeDocumentId)
      .eq("user_id", userId)
      .single();

    if (docErr) return NextResponse.json({ error: "Master resume document not found" }, { status: 404 });
    if (!document.text_extracted || !document.extracted_text) {
      return NextResponse.json({ error: "Selected master resume document is not extracted yet." }, { status: 400 });
    }
    masterText = document.extracted_text;
  }

  if (!masterText || masterText.trim().length < 100) {
    return NextResponse.json({ error: "Provide a master resume source (artifact/document) or pasted resume text." }, { status: 400 });
  }

  const templateGuideText = "";

  if ((stage === "posting_analysis" || stage === "generate_resume" || stage === "quick_generate") && (!jobDescriptionText || jobDescriptionText.length < 100)) {
    return NextResponse.json({ error: "Job description text is required for this stage." }, { status: 400 });
  }
  const jdText = jobDescriptionText ?? "";

  if (stage === "posting_analysis") {
    const started = Date.now();
    const llm = await generateJson<PostingAnalysisOutput>(
      promptTargetPostingAnalysis({
        jobTitle: jobTitle ?? "Unknown",
        jobDescriptionText: jdText,
        masterResumeText: masterText,
        company: company ?? null,
      }),
      {
        model: env.TARGETED_RESUME_MODEL ?? env.OPENAI_MODEL,
        timeoutMs: 90000,
        temperature: 0.2,
      }
    );
    const latency = Date.now() - started;

    const baseRun = {
      user_id: userId,
      tool_name: "resume_targeter" as const,
      input_json: {
        workflowStage: stage,
        masterResumeArtifactId: selectedArtifactId ?? null,
        masterResumeDocumentId: masterResumeDocumentId ?? null,
        jdLen: jdText.length,
        company,
        jobTitle,
      },
      latency_ms: latency,
    };

    if (!llm.ok) {
      await supabase.from("tool_runs").insert({ ...baseRun, status: "error", error_message: llm.error });
      return NextResponse.json({ error: llm.error }, { status: 500 });
    }

    await supabase.from("tool_runs").insert({
      ...baseRun,
      status: "success",
      output_json: llm.data as unknown as Record<string, unknown>,
      tokens_in: llm.tokensIn ?? null,
      tokens_out: llm.tokensOut ?? null,
    });

    return NextResponse.json({ workflowStage: stage, ...llm.data });
  }

  if (stage === "generate_resume" && !userConfirmedGenerate) {
    return NextResponse.json(
      { error: "Explicit confirmation is required before generating a targeted resume." },
      { status: 400 }
    );
  }

  if (stage === "generate_resume") {
    const { data: sourceDocs, error: sourceDocsError } = await supabase
      .from("documents")
      .select("doc_type,filename,created_at,extracted_text")
      .eq("user_id", userId)
      .eq("text_extracted", true)
      .not("extracted_text", "is", null)
      .in("doc_type", ["MASTER_RESUME"])
      .order("created_at", { ascending: true });

    if (sourceDocsError) {
      return NextResponse.json({ error: sourceDocsError.message }, { status: 500 });
    }

    const prompt = promptTargetedResumeGenerationV22({
      masterResumeText: masterText,
      jobDescriptionText: jdText,
      company: company ?? null,
      jobTitle: jobTitle ?? "Unknown",
      stage1ContextJson: JSON.stringify(stage1Context ?? {}),
      stage2ContextJson: JSON.stringify(stage2Context ?? {}),
      targetingContextText: buildTargetingContextText(stage1Context, stage2Context),
      profileContactJson: JSON.stringify({
        full_name: profile?.full_name ?? null,
        phone_number: profile?.phone_number ?? null,
        professional_email: profile?.professional_email ?? null,
        linkedin_url: profile?.linkedin_url ?? null,
        location: profile?.location ?? profile?.location_pref ?? null,
        security_clearance: profile?.security_clearance ?? null,
      }),
      profileSupplementJson: JSON.stringify({
        off_duty_education: uniqueTrimmed(profile?.off_duty_education ?? []),
        civilian_certifications: uniqueTrimmed(profile?.civilian_certifications ?? []),
        additional_training: uniqueTrimmed(profile?.additional_training ?? []),
      }),
      supplementalSourceContextText: buildSupplementalSourceContext({
        masterResumeText: masterText,
        docs: sourceDocs ?? [],
      }),
      templateGuideText,
    });

    const started = Date.now();
    const llm = await generateJson<StructuredTargetedResumeOutput>(prompt, {
      model: env.TARGETED_RESUME_MODEL ?? env.OPENAI_MODEL,
      timeoutMs: 150000,
      temperature: 0.1,
    });
    const latency = Date.now() - started;

    const baseRun = {
      user_id: userId,
      tool_name: "resume_targeter" as const,
      input_json: {
        workflowStage: stage,
        masterResumeArtifactId: selectedArtifactId ?? null,
        masterResumeDocumentId: masterResumeDocumentId ?? null,
        jdLen: jdText.length,
        company,
        jobTitle,
      },
      latency_ms: latency,
    };

    if (!llm.ok) {
      await supabase.from("tool_runs").insert({ ...baseRun, status: "error", error_message: llm.error });
      return NextResponse.json({ error: llm.error }, { status: 500 });
    }

    const extractedProfessionalDevelopment = classifyProfessionalDevelopment(
      extractProfessionalDevelopmentLinesFromMasterText(masterText)
    );

    const structuredResume = sanitizeExperienceLocations(
      finalizeProfessionalDevelopment(normalizeStructuredResume(llm.data), extractedProfessionalDevelopment, {
        jobTitle,
        company,
        jobDescriptionText: jdText,
        stage1Context,
        stage2Context,
      }),
      profile?.location ?? profile?.location_pref ?? null
    );
    const previewText = buildTargetedResumeText({
      contact: {
        full_name: profile?.full_name ?? null,
        phone_number: profile?.phone_number ?? null,
        professional_email: profile?.professional_email ?? null,
        linkedin_url: profile?.linkedin_url ?? null,
        location: profile?.location ?? profile?.location_pref ?? null,
        security_clearance: profile?.security_clearance ?? null,
      },
      resume: structuredResume,
    });

    const createdAt = new Date();
    const filename = buildTargetedResumeFilename({
      createdAt,
      jobTitle: structuredResume.target_title || jobTitle,
      company: company ?? null,
    });

    const docBuffer = await renderTargetedResumeDocx({
      contact: {
        full_name: profile?.full_name ?? null,
        phone_number: profile?.phone_number ?? null,
        professional_email: profile?.professional_email ?? null,
        linkedin_url: profile?.linkedin_url ?? null,
        location: profile?.location ?? profile?.location_pref ?? null,
        security_clearance: profile?.security_clearance ?? null,
      },
      resume: structuredResume,
    });

    const documentId = crypto.randomUUID();
    const storagePath = `${userId}/${documentId}/${filename}`;
    const mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, docBuffer, { contentType: mimeType, upsert: false });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { error: documentInsertError } = await supabase.from("documents").insert({
      id: documentId,
      user_id: userId,
      doc_type: "TARGETED_RESUME",
      filename,
      storage_path: storagePath,
      mime_type: mimeType,
      size_bytes: docBuffer.byteLength,
      text_extracted: true,
      extracted_text: previewText,
    });

    if (documentInsertError) {
      await supabase.storage.from("documents").remove([storagePath]);
      return NextResponse.json({ error: documentInsertError.message }, { status: 500 });
    }

    await supabase.from("tool_runs").insert({
      ...baseRun,
      status: "success",
      output_json: structuredResume as unknown as Record<string, unknown>,
      tokens_in: llm.tokensIn ?? null,
      tokens_out: llm.tokensOut ?? null,
    });

    const artifactTitle = `${structuredResume.target_title || jobTitle || "Targeted Resume"}${company ? ` - ${company}` : ""}`;
    const { data: saved, error: saveErr } = await supabase
      .from("resume_artifacts")
      .insert({
        user_id: userId,
        artifact_type: "targeted_resume",
        title: artifactTitle,
        content: previewText,
        source_document_id: masterResumeDocumentId ?? null,
        job_title_target: structuredResume.target_title || jobTitle || null,
        company_target: company ?? null,
        job_description: jdText,
        structured_output: structuredResume as unknown as Record<string, unknown>,
        rendered_document_id: documentId,
      })
      .select("id")
      .single();

    if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 });

    return NextResponse.json({
      artifactId: saved.id,
      documentId,
      fileName: filename,
      workflowStage: stage,
      targeted_resume: previewText,
      structured_resume: structuredResume,
      keywords_added: structuredResume.keywords_added,
      changes_made: structuredResume.changes_made,
      ats_alignment_notes: structuredResume.ats_alignment_notes,
      targeting_critique: structuredResume.targeting_critique,
      suggested_improvements: structuredResume.suggested_improvements,
      next_prompt: structuredResume.next_prompt,
    });
  }

  const prompt = promptResumeTargeter({
    masterBulletsText: masterText,
    jobDescriptionText: jdText,
    company: company ?? null,
    jobTitle: jobTitle ?? null,
  });

  const started = Date.now();
  const llm = await generateJson<ResumeTargeterOutput>(prompt, {
    model: env.TARGETED_RESUME_MODEL ?? env.OPENAI_MODEL,
    timeoutMs: 150000,
    temperature: 0.1,
  });
  const latency = Date.now() - started;

  const baseRun = {
    user_id: userId,
    tool_name: "resume_targeter" as const,
    input_json: {
      workflowStage: stage,
      masterResumeArtifactId: selectedArtifactId ?? null,
      masterResumeDocumentId: masterResumeDocumentId ?? null,
      jdLen: jdText.length,
      company,
      jobTitle,
    },
    latency_ms: latency,
  };

  if (!llm.ok) {
    await supabase.from("tool_runs").insert({ ...baseRun, status: "error", error_message: llm.error });
    return NextResponse.json({ error: llm.error }, { status: 500 });
  }

  await supabase.from("tool_runs").insert({
    ...baseRun,
    status: "success",
    output_json: llm.data as unknown as Record<string, unknown>,
    tokens_in: llm.tokensIn ?? null,
    tokens_out: llm.tokensOut ?? null,
  });

  const title = `${jobTitle ?? "Targeted Resume"}${company ? ` - ${company}` : ""}`;
  const { data: saved, error: saveErr } = await supabase
    .from("resume_artifacts")
    .insert({
      user_id: userId,
      artifact_type: "targeted_resume",
      title,
      content: llm.data.targeted_resume,
      job_title_target: jobTitle ?? null,
      company_target: company ?? null,
      job_description: jdText,
    })
    .select("id")
    .single();

  if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 });

  return NextResponse.json({ artifactId: saved.id, workflowStage: stage, ...llm.data });
}