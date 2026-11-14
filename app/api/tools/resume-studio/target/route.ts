import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { enforceAiUsageLimit } from "@/lib/usage-limit";
import { supabaseServer } from "@/lib/supabase/server";
import { getEnv } from "@/lib/env";
import { runLoggedJson } from "@/lib/tools/run";
import { promptFitMap, promptTargetedFromRecord } from "@/lib/llm/prompts-resume";
import { buildFitMap, gateTargetedResume } from "@/lib/resume/build";
import { summarize } from "@/lib/resume/gates";
import { isEvidenceRecord, recordForPrompt } from "@/lib/resume/record";
import { resumeStudioEnabled } from "@/lib/resume/studio-access";
import { buildTargetedResumeFilename, buildTargetedResumeText, renderTargetedResumeDocx, type StructuredTargetedResume } from "@/lib/resume-template";

export const maxDuration = 300;

const TOOL = "resume_targeter";

const base = {
  recordArtifactId: z.string().uuid(),
  jobTitle: z.string().min(2).max(200),
  company: z.string().max(200).optional().nullable(),
  jobDescriptionText: z.string().min(100).max(30000),
};

const InputSchema = z.discriminatedUnion("stage", [
  z.object({ stage: z.literal("fit"), ...base }),
  z.object({ stage: z.literal("generate"), ...base, fitMap: z.record(z.any()).optional() }),
]);

export async function POST(req: Request) {
  const { userId, email } = await requireUser();
  if (!resumeStudioEnabled(email)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const supabase = await supabaseServer();

  const parsed = InputSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Paste the full job posting and enter the job title." }, { status: 400 });
  const input = parsed.data;

  const { data: artifact } = await supabase
    .from("resume_artifacts")
    .select("id,structured_output")
    .eq("id", input.recordArtifactId)
    .eq("user_id", userId)
    .maybeSingle();
  const record = artifact?.structured_output;
  if (!isEvidenceRecord(record)) return NextResponse.json({ error: "Build your career record first." }, { status: 400 });

  const overLimit = await enforceAiUsageLimit({ supabase, userId, email });
  if (overLimit) return overLimit;

  const env = getEnv();
  const recordText = recordForPrompt(record);
  const meta = { engine: "studio", stage: input.stage, jobTitle: input.jobTitle, company: input.company ?? null, jdLen: input.jobDescriptionText.length };

  if (input.stage === "fit") {
    const run = await runLoggedJson<Record<string, unknown>>({
      supabase,
      userId,
      toolName: TOOL,
      inputJson: meta,
      prompt: promptFitMap({ jobTitle: input.jobTitle, company: input.company, jobDescriptionText: input.jobDescriptionText, recordText }),
      model: env.TARGETED_RESUME_MODEL,
      timeoutMs: 120000,
      temperature: 0.1,
    });
    if (!run.ok) return NextResponse.json({ error: run.error }, { status: 500 });
    return NextResponse.json({ stage: input.stage, fitMap: buildFitMap(run.data, record) });
  }

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  const yearsOfService = profile?.years_service_at_eas === null || profile?.years_service_at_eas === undefined ? null : Number(profile.years_service_at_eas);

  const fitRequirements = Array.isArray(input.fitMap?.requirements) ? (input.fitMap.requirements as Record<string, unknown>[]) : [];
  const fitMapText = fitRequirements
    .slice(0, 20)
    .map((r) => `- [${r.type}/${r.assessment}] ${r.requirement} :: ${Array.isArray(r.evidence) ? r.evidence.join(", ") : ""}`)
    .join("\n");

  const run = await runLoggedJson<Record<string, unknown>>({
    supabase,
    userId,
    toolName: TOOL,
    inputJson: meta,
    prompt: promptTargetedFromRecord({
      jobTitle: input.jobTitle,
      company: input.company,
      jobDescriptionText: input.jobDescriptionText,
      recordText,
      fitMapText,
      yearsOfService,
    }),
    model: env.TARGETED_RESUME_MODEL,
    timeoutMs: 200000,
    temperature: 0.2,
    storeOutput: () => null,
  });
  if (!run.ok) return NextResponse.json({ error: run.error }, { status: 500 });

  const contact = {
    full_name: profile?.full_name ?? null,
    phone_number: profile?.phone_number ?? null,
    professional_email: profile?.professional_email ?? null,
    linkedin_url: profile?.linkedin_url ?? null,
    location: profile?.location ?? profile?.location_pref ?? null,
    security_clearance: profile?.security_clearance ?? null,
  };
  const contactLines = [contact.phone_number || contact.professional_email, contact.linkedin_url || contact.location || contact.security_clearance].filter(Boolean).length;

  const { resume, findings } = gateTargetedResume({
    raw: run.data,
    record,
    profileClearance: profile?.security_clearance ?? null,
    yearsOfService,
    contactLines,
  });
  if (resume.experience.length === 0) {
    return NextResponse.json(
      { error: "No bullets survived the checks against your record, so no resume was produced. Try again, or add more source records.", findings },
      { status: 422 }
    );
  }

  const structured: StructuredTargetedResume = {
    target_title: resume.targetTitle || input.jobTitle,
    executive_summary: resume.summary,
    core_skills: resume.skills,
    experience: resume.experience.map((role) => ({
      role_title: role.title,
      organization: role.organization,
      location: "",
      dates: role.dates,
      bullets: role.bullets.map((b) => b.text),
    })),
    off_duty_education: resume.education,
    civilian_certifications: resume.certifications,
    additional_training: resume.training,
  };

  const previewText = buildTargetedResumeText({ contact, resume: structured });
  const filename = buildTargetedResumeFilename({ createdAt: new Date(), jobTitle: structured.target_title, company: input.company ?? null });
  const docBuffer = await renderTargetedResumeDocx({ contact, resume: structured });

  const documentId = crypto.randomUUID();
  const storagePath = `${userId}/${documentId}/${filename}`;
  const mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const { error: uploadError } = await supabase.storage.from("documents").upload(storagePath, docBuffer, { contentType: mimeType, upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { error: docError } = await supabase.from("documents").insert({
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
  if (docError) {
    await supabase.storage.from("documents").remove([storagePath]);
    return NextResponse.json({ error: docError.message }, { status: 500 });
  }

  const { data: saved, error: saveError } = await supabase
    .from("resume_artifacts")
    .insert({
      user_id: userId,
      artifact_type: "targeted_resume",
      title: `${structured.target_title}${input.company ? ` - ${input.company}` : ""}`,
      content: previewText,
      job_title_target: structured.target_title,
      company_target: input.company ?? null,
      job_description: input.jobDescriptionText,
      // The gated resume with its evidence citations and the gate report
      structured_output: { engine: "studio", recordArtifactId: input.recordArtifactId, resume, findings } as unknown as Record<string, unknown>,
      rendered_document_id: documentId,
    })
    .select("id")
    .single();
  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 });

  return NextResponse.json({
    stage: input.stage,
    artifactId: saved.id,
    documentId,
    fileName: filename,
    resume,
    findings,
    gateSummary: summarize(findings),
    previewText,
  });
}
