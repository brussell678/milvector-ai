import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { enforceAiUsageLimit } from "@/lib/usage-limit";
import { supabaseServer } from "@/lib/supabase/server";
import { getEnv } from "@/lib/env";
import { redactPII } from "@/lib/redact";
import { runLoggedJson } from "@/lib/tools/run";
import { promptFillFromMaster, promptFitMap, promptSummaryRewrite, promptTargetedFromRecord } from "@/lib/llm/prompts-resume";
import { buildFitMap, gateTargetedResume } from "@/lib/resume/build";
import { summarize } from "@/lib/resume/gates";
import { recordForPrompt } from "@/lib/resume/record";
import { targetedResumeV2Enabled } from "@/lib/resume/studio-access";
import { structuredMaster } from "@/lib/resume/structured-master";
import { figureChecks, mergeAdditions, splitProjects, timelineGaps, unusedLines } from "@/lib/resume/targeting";
import { loadChosenMaster, loadMasterByRef, MASTER_PROBLEM, type ChosenMaster } from "@/lib/resume-source";
import { buildTargetedResumeFilename, buildTargetedResumeText, renderTargetedResumeDocx, type StructuredExperience, type StructuredTargetedResume } from "@/lib/resume-template";

// The rebuilt Targeted Resume Builder (docs/TARGETED_RESUME_PLAN.md, Phase 3).
// Works from the member's own master resume, structured once per version:
//   fit    the posting mapped against the master, before anything is written
//   build  the targeted resume, checked against the master, with every figure
//          listed for the member to confirm before sending

export const maxDuration = 300;

const TOOL = "resume_targeter";
// Under this the draft gets one top-up from master lines it did not use.
const FILL_BELOW_PAGES = 1.8;
// No role, however relevant, crowds out the rest of the career.
const MAX_BULLETS_PER_ROLE = 8;
// Undated project sections are extras: at most this many, in the order the
// model ranked them, so they never crowd out jobs.
const MAX_PROJECTS = 2;

/** Keeps the jobs and the first MAX_PROJECTS undated project sections. */
function capProjects(raw: Record<string, unknown>, projectIds: Set<string>): Record<string, unknown> {
  if (!Array.isArray(raw.experience)) return raw;
  let projects = 0;
  const experience = raw.experience.filter((entry) => {
    const id = String((entry as Record<string, unknown>)?.role_id ?? "");
    if (!projectIds.has(id)) return true;
    projects += 1;
    return projects <= MAX_PROJECTS;
  });
  return { ...raw, experience };
}

const base = {
  source: z.enum(["master", "paste"]).default("master"),
  masterRef: z.string().max(80).optional().nullable(),
  pastedText: z.string().max(40000).optional().nullable(),
  jobTitle: z.string().trim().min(2).max(200),
  company: z.string().trim().max(200).optional().nullable(),
  jobDescriptionText: z.string().trim().min(100).max(30000),
};

const InputSchema = z.discriminatedUnion("stage", [
  z.object({ stage: z.literal("fit"), ...base }),
  z.object({ stage: z.literal("build"), ...base, fitMap: z.record(z.any()).optional() }),
]);

export async function POST(req: Request) {
  const { userId, email } = await requireUser();
  if (!targetedResumeV2Enabled(email)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const supabase = await supabaseServer();

  const parsed = InputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    const message = field === "jobDescriptionText" ? "Paste the full job posting." : field === "jobTitle" ? "Enter the job title." : "That request was not understood. Refresh the page and try again.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const input = parsed.data;

  // The resume to work from: the member's master, or text pasted for this run.
  let chosen: ChosenMaster;
  let sourceRef: string;
  if (input.source === "paste") {
    const text = (input.pastedText ?? "").trim();
    if (text.length < 100) return NextResponse.json({ error: "Paste the whole resume you want to work from." }, { status: 400 });
    chosen = { ok: true, text, option: { ref: "paste", kind: "document", id: "pasted", name: "Pasted resume", origin: "uploaded", createdAt: new Date().toISOString(), ready: true } };
    sourceRef = "paste";
  } else {
    chosen = input.masterRef ? await loadMasterByRef(supabase, userId, input.masterRef) : await loadChosenMaster(supabase, userId);
    if (!chosen.ok) return NextResponse.json({ error: MASTER_PROBLEM[chosen.reason] }, { status: 400 });
    sourceRef = chosen.option.ref;
  }

  const overLimit = await enforceAiUsageLimit({ supabase, userId, email });
  if (overLimit) return overLimit;
  const env = getEnv();

  const structured = await structuredMaster({
    supabase,
    userId,
    text: redactPII(chosen.text).text,
    sourceRef,
    source: { documentId: chosen.option.id, filename: chosen.option.name, docType: chosen.option.kind === "document" ? "MASTER_RESUME" : "SAVED_MASTER" },
    model: env.MASTER_RESUME_MODEL,
    toolName: TOOL,
  });
  if (!structured.ok) return NextResponse.json({ error: structured.error }, { status: structured.status });
  const { record, support, supportLines, dropped } = structured.master;
  const recordText = recordForPrompt(record);
  const master = { name: chosen.option.name, origin: chosen.option.origin, roles: record.roles.length, lines: record.stats.accomplishments, dropped: dropped.length, notes: record.openQuestions };
  const meta = { engine: "master-v2", stage: input.stage, jobTitle: input.jobTitle, company: input.company ?? null, jdLen: input.jobDescriptionText.length };

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
    const fitMap = buildFitMap(run.data, record);
    // The master's own words for each cited line, so the member sees evidence, not ids.
    const lines: Record<string, string> = {};
    for (const role of record.roles) {
      lines[role.id] = [role.title, role.organization, [role.start, role.end].filter(Boolean).join(" - ")].filter(Boolean).join(", ");
      for (const a of role.accomplishments) lines[a.id] = a.text;
    }
    for (const c of record.credentials) lines[c.id] = c.text;
    const cited = Object.fromEntries(fitMap.requirements.flatMap((r) => r.evidence).filter((id) => lines[id]).map((id) => [id, lines[id]]));
    return NextResponse.json({ stage: input.stage, master, fitMap, cited });
  }

  // ── Build ──
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
    prompt: promptTargetedFromRecord({ jobTitle: input.jobTitle, company: input.company, jobDescriptionText: input.jobDescriptionText, recordText, fitMapText, yearsOfService, source: "master" }),
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
  const projectIds = new Set(record.roles.filter((role) => !role.start && !role.end).map((role) => role.id));
  const gate = (raw: Record<string, unknown>) =>
    gateTargetedResume({
      raw: capProjects(raw, projectIds),
      record,
      profileClearance: profile?.security_clearance ?? null,
      yearsOfService,
      contactLines,
      titlesFromRecord: true,
      extraSupport: support,
      maxBulletsPerRole: MAX_BULLETS_PER_ROLE,
    });

  let raw = run.data;
  let result = gate(raw);

  // A check took sentences out of the summary: one rewrite from the master's
  // own words, then every check again.
  let summaryRewritten = false;
  if (result.summaryRemoved.length > 0) {
    const retry = await runLoggedJson<Record<string, unknown>>({
      supabase,
      userId,
      toolName: TOOL,
      inputJson: { ...meta, stage: "summary_rewrite" },
      prompt: promptSummaryRewrite({ jobTitle: input.jobTitle, company: input.company, kept: result.resume.summary, removed: result.summaryRemoved, support }),
      model: env.TARGETED_RESUME_MODEL,
      timeoutMs: 60000,
      temperature: 0.2,
      storeOutput: () => null,
    });
    if (retry.ok && typeof retry.data.summary === "string" && retry.data.summary.trim()) {
      const again = gate({ ...raw, summary: retry.data.summary });
      if (again.summaryRemoved.length === 0) {
        raw = { ...raw, summary: retry.data.summary };
        result = again;
        summaryRewritten = true;
      }
    }
  }

  // Short of two pages, or skipping a job: one top-up from master lines not
  // yet used, then every check again. Kept only if it added bullets without
  // shortening the resume or widening a gap.
  let filled = 0;
  let closedGaps = 0;
  const unused = unusedLines(record, raw);
  const gaps = timelineGaps(record, result.resume);
  if ((result.resume.estimatedPages < FILL_BELOW_PAGES || gaps.length > 0) && unused) {
    const missingRoles = gaps.map((role) => `${role.id} | ${role.title} | ${role.organization} | ${[role.start, role.end].filter(Boolean).join(" - ")}`).join("\n");
    const draftText = result.resume.experience.map((role) => [`${role.roleId} | ${role.title}`, ...role.bullets.map((b) => `  - ${b.text}`)].join("\n")).join("\n");
    const top = await runLoggedJson<Record<string, unknown>>({
      supabase,
      userId,
      toolName: TOOL,
      inputJson: { ...meta, stage: "fill", pages: result.resume.estimatedPages },
      prompt: promptFillFromMaster({ jobTitle: input.jobTitle, company: input.company, jobDescriptionText: input.jobDescriptionText, draftText, unusedText: unused, pages: result.resume.estimatedPages, missingRoles }),
      model: env.TARGETED_RESUME_MODEL,
      timeoutMs: 120000,
      temperature: 0.2,
      storeOutput: () => null,
    });
    if (top.ok) {
      const merged = mergeAdditions(raw, top.data.additions);
      const again = gate(merged);
      const before = result.resume.experience.reduce((n, r) => n + r.bullets.length, 0);
      const after = again.resume.experience.reduce((n, r) => n + r.bullets.length, 0);
      // Closing a gap is worth it on its own, even if the length trim then
      // takes as many bullets off older roles as were added.
      const fewerGaps = timelineGaps(record, again.resume).length < gaps.length;
      const longer = after > before && again.resume.estimatedPages >= result.resume.estimatedPages;
      if (fewerGaps || longer) {
        raw = merged;
        result = again;
        filled = Math.max(after - before, 0);
        closedGaps = gaps.length - timelineGaps(record, again.resume).length;
      }
    }
  }

  const { resume, findings } = result;
  // Any job still skipped is reported, so the member can explain it or add it.
  const leftOut = timelineGaps(record, resume);
  findings.push({
    gate: "structure",
    level: leftOut.length > 0 ? "warn" : "pass",
    check: "No unexplained gap in your timeline",
    detail:
      leftOut.length > 0
        ? `Left out: ${leftOut.map((role) => `${role.title} (${[role.start, role.end].filter(Boolean).join(" - ")})`).join("; ")}. Be ready to explain the gap, or build again.`
        : "Every job in the span this resume covers is included.",
  });
  if (resume.experience.length === 0) {
    return NextResponse.json({ error: "No bullets survived the checks against your master resume. Try again, or check that your master lists your roles with their bullets.", findings }, { status: 422 });
  }

  const { jobs, projects } = splitProjects(resume);
  const asSection = (role: (typeof jobs)[number]): StructuredExperience => ({ role_title: role.title, organization: role.organization, location: "", dates: role.dates, bullets: role.bullets.map((b) => b.text) });
  const structuredResume: StructuredTargetedResume = {
    target_title: resume.targetTitle || input.jobTitle,
    executive_summary: resume.summary,
    core_skills: resume.skills,
    experience: jobs.map(asSection),
    selected_projects: projects.map(asSection),
    off_duty_education: resume.education,
    civilian_certifications: resume.certifications,
    additional_training: resume.training,
  };

  const previewText = buildTargetedResumeText({ contact, resume: structuredResume });
  const filename = buildTargetedResumeFilename({ createdAt: new Date(), jobTitle: structuredResume.target_title, company: input.company ?? null });
  const docBuffer = await renderTargetedResumeDocx({ contact, resume: structuredResume });

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

  const figures = figureChecks(resume, record, supportLines);
  const { data: saved } = await supabase
    .from("resume_artifacts")
    .insert({
      user_id: userId,
      artifact_type: "targeted_resume",
      title: `${structuredResume.target_title}${input.company ? ` - ${input.company}` : ""}`,
      content: previewText,
      job_title_target: structuredResume.target_title,
      company_target: input.company ?? null,
      job_description: input.jobDescriptionText,
      structured_output: { engine: "master-v2", sourceRef, resume, findings, figures } as unknown as Record<string, unknown>,
      rendered_document_id: documentId,
    })
    .select("id")
    .single();

  return NextResponse.json({
    stage: input.stage,
    master,
    resume: { ...resume, jobs, projects },
    findings,
    gateSummary: summarize(findings),
    figures,
    notes: { summaryRewritten, filled, closedGaps },
    previewText,
    fileName: filename,
    documentId,
    artifactId: saved?.id ?? null,
  });
}
