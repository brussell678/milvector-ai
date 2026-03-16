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
    experience: toExperienceArray(value.experience),
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
    resumeTemplateDocumentId,
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

  let templateGuideText = "";
  if (resumeTemplateDocumentId) {
    const { data: templateDoc, error: templateErr } = await supabase
      .from("documents")
      .select("id,doc_type,text_extracted,extracted_text")
      .eq("id", resumeTemplateDocumentId)
      .eq("user_id", userId)
      .single();

    if (templateErr) return NextResponse.json({ error: "Resume template document not found" }, { status: 404 });
    if (templateDoc.doc_type !== "RESUME_TEMPLATE") {
      return NextResponse.json({ error: "Selected template must be a RESUME_TEMPLATE document." }, { status: 400 });
    }
    if (!templateDoc.text_extracted || !templateDoc.extracted_text) {
      return NextResponse.json({ error: "Selected template is not extracted yet." }, { status: 400 });
    }
    templateGuideText = templateDoc.extracted_text.slice(0, 12000);
  }

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
        resumeTemplateDocumentId: resumeTemplateDocumentId ?? null,
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
    const prompt = promptTargetedResumeGenerationV22({
      masterResumeText: masterText,
      jobDescriptionText: jdText,
      company: company ?? null,
      jobTitle: jobTitle ?? "Unknown",
      stage1ContextJson: JSON.stringify(stage1Context ?? {}),
      stage2ContextJson: JSON.stringify(stage2Context ?? {}),
      profileContactJson: JSON.stringify({
        full_name: profile?.full_name ?? null,
        phone_number: profile?.phone_number ?? null,
        professional_email: profile?.professional_email ?? null,
        linkedin_url: profile?.linkedin_url ?? null,
        location: profile?.location ?? profile?.location_pref ?? null,
        security_clearance: profile?.security_clearance ?? null,
      }),
      profileSupplementJson: JSON.stringify({
        off_duty_education: profile?.off_duty_education ?? [],
        civilian_certifications: profile?.civilian_certifications ?? [],
        additional_training: profile?.additional_training ?? [],
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
        resumeTemplateDocumentId: resumeTemplateDocumentId ?? null,
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

    const structuredResume = normalizeStructuredResume(llm.data);
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
      resumeTemplateDocumentId: resumeTemplateDocumentId ?? null,
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
