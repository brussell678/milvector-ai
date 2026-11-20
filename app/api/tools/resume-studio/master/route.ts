import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { enforceAiUsageLimit } from "@/lib/usage-limit";
import { supabaseServer } from "@/lib/supabase/server";
import { getEnv } from "@/lib/env";
import { redactPII } from "@/lib/redact";
import { runLoggedJson } from "@/lib/tools/run";
import { promptFitMap, promptMasterStructure, promptSummaryRewrite, promptTargetedFromRecord } from "@/lib/llm/prompts-resume";
import { buildFitMap, gateTargetedResume } from "@/lib/resume/build";
import { summarize } from "@/lib/resume/gates";
import { recordFromMaster } from "@/lib/resume/master-record";
import { isEvidenceRecord, recordForPrompt, type EvidenceRecord } from "@/lib/resume/record";
import { resumeStudioEnabled } from "@/lib/resume/studio-access";
import { loadChosenMaster, MASTER_PROBLEM } from "@/lib/resume-source";
import { buildTargetedResumeFilename, buildTargetedResumeText, renderTargetedResumeDocx, type StructuredTargetedResume } from "@/lib/resume-template";

// Targeted Resume rebuild, Phase 2 (admin only): the targeting engine working
// from the member's own chosen master resume instead of raw records.
//   structure  split the master into roles and lines, verified word for word
//   fit        the fit map against that structure
//   generate   the targeted resume, checked against the master
// Phase 2 passes the structure back and forth; Phase 3 stores it.

export const maxDuration = 300;

const TOOL = "resume_targeter";

const job = {
  jobTitle: z.string().min(2).max(200),
  company: z.string().max(200).optional().nullable(),
  jobDescriptionText: z.string().min(100).max(30000),
};

const InputSchema = z.discriminatedUnion("stage", [
  z.object({ stage: z.literal("structure") }),
  z.object({ stage: z.literal("fit"), record: z.record(z.any()), ...job }),
  z.object({ stage: z.literal("generate"), record: z.record(z.any()), support: z.string().max(80000).default(""), fitMap: z.record(z.any()).optional(), ...job }),
]);

export async function POST(req: Request) {
  const { userId, email } = await requireUser();
  if (!resumeStudioEnabled(email)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const supabase = await supabaseServer();

  const parsed = InputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That request was not understood." }, { status: 400 });
  const input = parsed.data;

  const overLimit = await enforceAiUsageLimit({ supabase, userId, email });
  if (overLimit) return overLimit;
  const env = getEnv();

  if (input.stage === "structure") {
    const chosen = await loadChosenMaster(supabase, userId);
    if (!chosen.ok) return NextResponse.json({ error: MASTER_PROBLEM[chosen.reason] }, { status: 400 });
    const masterText = redactPII(chosen.text).text;
    const run = await runLoggedJson<Record<string, unknown>>({
      supabase,
      userId,
      toolName: TOOL,
      inputJson: { engine: "master", stage: "structure", chars: masterText.length },
      prompt: promptMasterStructure({ masterText }),
      model: env.MASTER_RESUME_MODEL,
      timeoutMs: 240000,
      temperature: 0,
      storeOutput: () => null,
    });
    if (!run.ok) return NextResponse.json({ error: run.error }, { status: 500 });
    const result = recordFromMaster({
      raw: run.data,
      masterText,
      source: { documentId: chosen.option.id, filename: chosen.option.name, docType: chosen.option.kind === "document" ? "MASTER_RESUME" : "SAVED_MASTER" },
      builtAt: new Date().toISOString(),
    });
    if (result.record.roles.length === 0) return NextResponse.json({ error: "No roles could be read from your master resume.", dropped: result.dropped }, { status: 422 });
    return NextResponse.json({ stage: input.stage, master: { name: chosen.option.name, origin: chosen.option.origin }, ...result });
  }

  const record = input.record as unknown as EvidenceRecord;
  if (!isEvidenceRecord(record)) return NextResponse.json({ error: "Structure your master resume first." }, { status: 400 });
  const recordText = recordForPrompt(record);
  const meta = { engine: "master", stage: input.stage, jobTitle: input.jobTitle, company: input.company ?? null, jdLen: input.jobDescriptionText.length };

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
      source: "master",
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
  const gate = (raw: Record<string, unknown>) =>
    gateTargetedResume({
      raw,
      record,
      profileClearance: profile?.security_clearance ?? null,
      yearsOfService,
      contactLines,
      titlesFromRecord: true,
      extraSupport: input.support,
    });
  let { resume, findings, summaryRemoved } = gate(run.data);

  // A check took sentences out of the summary: one rewrite from the master's
  // own words, then the same checks again. Never a loosened check.
  let summaryRewritten = false;
  if (summaryRemoved.length > 0) {
    const retry = await runLoggedJson<Record<string, unknown>>({
      supabase,
      userId,
      toolName: TOOL,
      inputJson: { ...meta, stage: "summary_rewrite" },
      prompt: promptSummaryRewrite({ jobTitle: input.jobTitle, company: input.company, kept: resume.summary, removed: summaryRemoved, support: input.support }),
      model: env.TARGETED_RESUME_MODEL,
      timeoutMs: 60000,
      temperature: 0.2,
      storeOutput: () => null,
    });
    if (retry.ok && typeof retry.data.summary === "string" && retry.data.summary.trim()) {
      const again = gate({ ...run.data, summary: retry.data.summary });
      if (again.summaryRemoved.length === 0) {
        ({ resume, findings, summaryRemoved } = again);
        summaryRewritten = true;
      }
    }
  }
  if (resume.experience.length === 0) {
    return NextResponse.json({ error: "No bullets survived the checks against your master resume.", findings }, { status: 422 });
  }

  const structured: StructuredTargetedResume = {
    target_title: resume.targetTitle || input.jobTitle,
    executive_summary: resume.summary,
    core_skills: resume.skills,
    experience: resume.experience.map((role) => ({ role_title: role.title, organization: role.organization, location: "", dates: role.dates, bullets: role.bullets.map((b) => b.text) })),
    off_duty_education: resume.education,
    civilian_certifications: resume.certifications,
    additional_training: resume.training,
  };
  const docBuffer = await renderTargetedResumeDocx({ contact, resume: structured });
  return NextResponse.json({
    stage: input.stage,
    resume,
    findings,
    gateSummary: summarize(findings),
    summaryRewritten,
    previewText: buildTargetedResumeText({ contact, resume: structured }),
    fileName: buildTargetedResumeFilename({ createdAt: new Date(), jobTitle: structured.target_title, company: input.company ?? null }),
    docxBase64: Buffer.from(docBuffer).toString("base64"),
  });
}
