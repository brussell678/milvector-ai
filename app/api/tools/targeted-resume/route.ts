import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authReplies, requireUser } from "@/lib/auth";
import { enforceAiUsageLimit } from "@/lib/usage-limit";
import { supabaseServer } from "@/lib/supabase/server";
import { getEnv } from "@/lib/env";
import { runLoggedJson } from "@/lib/tools/run";
import { promptFillFromMaster, promptSummaryRewrite, promptTailorLines, promptTailorPlan, promptVerifyLines } from "@/lib/llm/prompts-resume";
import { gateTargetedResume } from "@/lib/resume/build";
import { citedLines, masterInfo, openCorrectionList, runFitCheck, structureChosen } from "@/lib/resume/fit-check";
import { summarize } from "@/lib/resume/gates";
import { POSTING_LIMIT, PASTE_LIMIT } from "@/lib/resume/limits";
import { recordForPrompt } from "@/lib/resume/record";
import { addRoles, assembleTailored, closeSlots, figureChecks, mergeAdditions, mergeRewrites, planSlots, restoredSlots, rewriteRows, splitProjects, timelineGaps, unusedLines, verifyProblems } from "@/lib/resume/targeting";
import { loadChosenMaster, loadMasterByRef, MASTER_PROBLEM, type ChosenMaster } from "@/lib/resume-source";
import { buildTargetedResumeFilename, buildTargetedResumeText, renderTargetedResumeDocx, type StructuredExperience, type StructuredTargetedResume } from "@/lib/resume-template";

// The rebuilt Targeted Resume Builder (docs/TARGETED_RESUME_PLAN.md, Phase 3).
// Works from the member's own master resume, structured once per version:
//   fit    the posting mapped against the master, before anything is written
//   build  the targeted resume, checked against the master, with every figure
//          listed for the member to confirm before sending

export const maxDuration = 300;

const TOOL = "resume_targeter";

// Rewrite and verification calls run side by side in batches, so a build
// waits for its slowest batch instead of the sum of every line.
const REWRITE_BATCH = 6;
const VERIFY_BATCH = 10;
async function inBatches<T, R>(items: T[], size: number, run: (batch: T[]) => Promise<R>): Promise<R[]> {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return Promise.all(batches.map(run));
}
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
  pastedText: z.string().max(PASTE_LIMIT).optional().nullable(),
  jobTitle: z.string().trim().min(2).max(200),
  company: z.string().trim().max(200).optional().nullable(),
  jobDescriptionText: z.string().trim().min(100).max(POSTING_LIMIT),
};

const InputSchema = z.discriminatedUnion("stage", [
  z.object({ stage: z.literal("fit"), ...base }),
  z.object({ stage: z.literal("build"), ...base, fitMap: z.record(z.string(), z.any()).optional() }),
]);

async function handlePOST(req: Request) {
  const { userId, email } = await requireUser();
  const supabase = await supabaseServer();

  const parsed = InputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    const message =
      field === "jobDescriptionText"
        ? issue?.code === "too_big"
          ? `That posting is over ${POSTING_LIMIT.toLocaleString("en-US")} characters. Cut the benefits and company boilerplate, keep the duties and requirements, and try again.`
          : "Paste the full job posting."
        : field === "pastedText" && issue?.code === "too_big"
          ? `That resume is over ${PASTE_LIMIT.toLocaleString("en-US")} characters. Paste only the resume itself.`
          : field === "jobTitle"
            ? "Enter the job title."
            : "That request was not understood. Refresh the page and try again.";
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
    // Corrections the uploaded master now says itself are closed.
    const resolved = chosen.corrections?.resolved ?? [];
    if (resolved.length) await supabase.from("master_corrections").update({ resolved_at: new Date().toISOString() }).in("id", resolved).eq("user_id", userId);
  }

  const overLimit = await enforceAiUsageLimit({ supabase, userId, email });
  if (overLimit) return overLimit;
  const env = getEnv();
  // The writing steps and the verification step can run on different models.
  const writeModel = { model: env.TARGETED_RESUME_MODEL, reasoningEffort: env.TARGETED_RESUME_EFFORT };
  const checkModel = { model: env.TARGETED_RESUME_VERIFY_MODEL ?? env.TARGETED_RESUME_MODEL, reasoningEffort: env.TARGETED_RESUME_VERIFY_EFFORT ?? env.TARGETED_RESUME_EFFORT };

  const structured = await structureChosen({ supabase, userId, chosen, sourceRef, toolName: TOOL });
  if (!structured.ok) return NextResponse.json({ error: structured.error }, { status: structured.status });
  const { record, support, supportLines } = structured.master;
  const recordText = recordForPrompt(record);
  const openList = openCorrectionList(chosen);
  const master = masterInfo(chosen, structured.master);
  const meta = { engine: "master-v2", stage: input.stage, jobTitle: input.jobTitle, company: input.company ?? null, jdLen: input.jobDescriptionText.length };

  if (input.stage === "fit") {
    const fit = await runFitCheck({ supabase, userId, toolName: TOOL, inputJson: meta, record, jobTitle: input.jobTitle, company: input.company, jobDescriptionText: input.jobDescriptionText });
    if (!fit.ok) return NextResponse.json({ error: fit.error }, { status: 500 });
    return NextResponse.json({ stage: input.stage, master, fitMap: fit.fitMap, cited: citedLines(fit.fitMap, record), corrections: openList });
  }

  // ── Build ──
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  const yearsOfService = profile?.years_service_at_eas === null || profile?.years_service_at_eas === undefined ? null : Number(profile.years_service_at_eas);
  // Conditions of the job (travel, schedule) are nothing a resume can show, so the plan does not aim at them.
  const fitRequirements = Array.isArray(input.fitMap?.requirements)
    ? (input.fitMap.requirements as Record<string, unknown>[]).filter((r) => r.type !== "condition")
    : [];
  const fitMapText = fitRequirements
    .slice(0, 20)
    .map((r) => `- [${r.type}/${r.assessment}] ${r.requirement} :: ${Array.isArray(r.evidence) ? r.evidence.join(", ") : ""}`)
    .join("\n");

  // Tailoring, step one: the plan chooses what goes on the page, by line id.
  const plan = await runLoggedJson<Record<string, unknown>>({
    supabase,
    userId,
    toolName: TOOL,
    inputJson: { ...meta, stage: "plan" },
    prompt: promptTailorPlan({ jobTitle: input.jobTitle, company: input.company, jobDescriptionText: input.jobDescriptionText, recordText, fitMapText, yearsOfService }),
    ...writeModel,
    timeoutMs: 200000,
    temperature: 0.2,
    storeOutput: () => null,
  });
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: 500 });

  // Step two: each chosen master line reworded for the posting. If this
  // request fails, the master's own lines stand.
  // A job the plan skipped that would read as a gap goes in now, so it is
  // tailored with everything else instead of topped up afterwards.
  const planned = planSlots(plan.data, record);
  const skipped = timelineGaps(record, { experience: planned.experience.map((e) => ({ roleId: e.roleId, title: "", organization: "", dates: "", bullets: [] })) });
  const layout = addRoles(planned, record, skipped.map((role) => role.id));
  const keywords = (Array.isArray(plan.data.keywords) ? plan.data.keywords : []).map(String).slice(0, 25);
  const rewriteBatches = await inBatches(layout.slots, REWRITE_BATCH, (lines) =>
    runLoggedJson<Record<string, unknown>>({
      supabase,
      userId,
      toolName: TOOL,
      inputJson: { ...meta, stage: "rewrite", lines: lines.length },
      step: true,
      prompt: promptTailorLines({ jobTitle: input.jobTitle, company: input.company, jobDescriptionText: input.jobDescriptionText, keywords, lines }),
      ...writeModel,
      timeoutMs: 150000,
      temperature: 0.4,
      storeOutput: () => null,
    }),
  );
  let rewrites = rewriteBatches.flatMap((batch) => rewriteRows(batch.ok ? batch.data : []));

  // Verification: a separate request reads each rewrite, and each summary
  // sentence, beside the member's own lines it came from and names any claim
  // those lines do not state. Code decides what happens: a flagged bullet gets
  // one more try, told what was wrong, and keeps the master's own line if it
  // is flagged again; a flagged summary sentence is dropped and rewritten.
  const lineText = new Map(record.roles.flatMap((r) => r.accomplishments.map((a) => [a.id, a.text] as const)));
  const verify = async (items: { slot: string; lines: string[]; text: string }[], stage: string) => {
    if (env.TARGETED_RESUME_VERIFY !== "on") return new Map<string, string>();
    const checks = await inBatches(items, VERIFY_BATCH, (batch) =>
      runLoggedJson<Record<string, unknown>>({
        supabase,
        userId,
        toolName: TOOL,
        inputJson: { ...meta, stage, items: batch.length },
        step: true,
        prompt: promptVerifyLines({ items: batch }),
        ...checkModel,
        timeoutMs: 120000,
        temperature: 0,
        storeOutput: () => null,
      }),
    );
    return new Map(checks.flatMap((check) => (check.ok ? [...verifyProblems(check.data)] : [])));
  };
  const summaryItems = (sentences: unknown) =>
    (Array.isArray(sentences) ? sentences : [])
      .map((sentence, i) => {
        const row = (sentence ?? {}) as Record<string, unknown>;
        const cited = (Array.isArray(row.evidence) ? row.evidence.map(String) : []).map((id) => lineText.get(id)).filter((t): t is string => !!t);
        return { slot: `SUM${i + 1}`, lines: cited.length ? cited : [support], text: String(row.text ?? "").trim() };
      })
      .filter((item) => item.text);
  const bulletItems = (texts: { slot: string; text: string }[], only?: Set<string>) => {
    const byText = new Map(texts.map((r) => [r.slot, r.text]));
    return layout.slots.filter((s) => byText.has(s.slot) && (!only || only.has(s.slot))).map((s) => ({ slot: s.slot, lines: s.lines, text: byText.get(s.slot)! }));
  };
  const isBulletSlot = (slot: string) => /^S\d+$/.test(slot);

  const firstCheck = await verify([...bulletItems(rewrites), ...summaryItems(plan.data.summary)], "verify");
  const plannedSummary = Array.isArray(plan.data.summary) ? (plan.data.summary as unknown[]) : null;
  const summaryFlagged = plannedSummary ? plannedSummary.filter((_, i) => firstCheck.has(`SUM${i + 1}`)).map((s) => String((s as Record<string, unknown>)?.text ?? "")) : [];
  const planUsed = plannedSummary ? { ...plan.data, summary: plannedSummary.filter((_, i) => !firstCheck.has(`SUM${i + 1}`)) } : plan.data;

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
      postingText: input.jobDescriptionText,
    });

  let raw = assembleTailored(planUsed, layout, rewrites);
  let result = gate(raw);

  // One more try at the bullets a check put back, the verification flagged, or
  // the rewrite barely changed, each told what was wrong; then the retried
  // ones are verified and every check runs again. What still fails keeps the
  // master's own line.
  let repaired = 0;
  const flagged = [...firstCheck.keys()].filter(isBulletSlot);
  const failedSlots = [...restoredSlots(result.resume, layout)];
  for (const slot of flagged) {
    const s = layout.slots.find((x) => x.slot === slot);
    if (s && !failedSlots.some((f) => f.slot === slot)) failedSlots.push({ ...s, previous: rewrites.find((r) => r.slot === slot)?.text ?? s.lines[0], problem: `states something its lines do not: ${firstCheck.get(slot)}` });
  }
  for (const close of closeSlots(layout, rewrites)) if (!failedSlots.some((f) => f.slot === close.slot)) failedSlots.push(close);
  if (failedSlots.length > 0) {
    const retryBatches = await inBatches(failedSlots, REWRITE_BATCH, (lines) =>
      runLoggedJson<Record<string, unknown>>({
        supabase,
        userId,
        toolName: TOOL,
        inputJson: { ...meta, stage: "rewrite_again", lines: lines.length },
        step: true,
        prompt: promptTailorLines({ jobTitle: input.jobTitle, company: input.company, jobDescriptionText: input.jobDescriptionText, keywords, lines }),
        ...writeModel,
        timeoutMs: 120000,
        temperature: 0.3,
        storeOutput: () => null,
      }),
    );
    const retryRows = retryBatches.flatMap((batch) => rewriteRows(batch.ok ? batch.data : []));
    const retried = new Set(retryRows.map((r) => r.slot));
    const firstFailed = new Set([...restoredSlots(result.resume, layout).map((s) => s.slot), ...flagged]);
    let merged = mergeRewrites(rewrites, retryRows);
    const secondCheck = await verify(bulletItems(merged, retried), "verify_again");
    // Flagged twice, or flagged and not rewritten again: the master's own line.
    const masterOnly = new Set([...secondCheck.keys(), ...flagged.filter((slot) => !retried.has(slot))]);
    merged = merged.filter((r) => !masterOnly.has(r.slot));
    let again = gate(assembleTailored(planUsed, layout, merged));
    // A retry that broke a line which passed before keeps the earlier wording.
    const broke = new Set(restoredSlots(again.resume, layout).map((s) => s.slot).filter((slot) => !firstFailed.has(slot)));
    if (broke.size > 0) {
      const earlier = new Map(rewrites.map((r) => [r.slot, r.text]));
      merged = merged.flatMap((r) => (broke.has(r.slot) ? (earlier.has(r.slot) ? [{ slot: r.slot, text: earlier.get(r.slot)! }] : []) : [r]));
      again = gate(assembleTailored(planUsed, layout, merged));
    }
    const stillFailed = new Set([...restoredSlots(again.resume, layout).map((s) => s.slot), ...masterOnly]);
    repaired = [...firstFailed].filter((slot) => !stillFailed.has(slot)).length;
    rewrites = merged;
    raw = assembleTailored(planUsed, layout, rewrites);
    result = again;
  }

  // A check or the verification took sentences out of the summary: one
  // rewrite from the master's own lines, verified and checked again.
  let summaryRewritten = false;
  if (result.summaryRemoved.length > 0 || summaryFlagged.length > 0) {
    const retry = await runLoggedJson<Record<string, unknown>>({
      supabase,
      userId,
      toolName: TOOL,
      inputJson: { ...meta, stage: "summary_rewrite" },
      step: true,
      prompt: promptSummaryRewrite({ jobTitle: input.jobTitle, company: input.company, kept: result.resume.summary, removed: [...result.summaryRemoved, ...summaryFlagged], support, recordText }),
      ...writeModel,
      timeoutMs: 60000,
      temperature: 0.2,
      storeOutput: () => null,
    });
    // Cited sentences, checked like the plan's; a plain string is not accepted,
    // since it could only be checked against the whole master.
    const proposed = retry.ok && Array.isArray(retry.data.summary) && retry.data.summary.length > 0 ? (retry.data.summary as unknown[]) : null;
    if (proposed) {
      const summaryCheck = await verify(summaryItems(proposed), "verify_summary");
      const next = proposed.filter((_, i) => !summaryCheck.has(`SUM${i + 1}`));
      const again = next.length > 0 ? gate({ ...raw, summary: next }) : null;
      if (again && again.summaryRemoved.length === 0) {
        raw = { ...raw, summary: next };
        result = again;
        summaryRewritten = true;
      }
    }
  }

  // Never ship an empty summary: the master's own summary passes by definition.
  if (!result.resume.summary.trim() && record.summary.trim()) {
    raw = { ...raw, summary: record.summary };
    result = gate(raw);
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
      step: true,
      prompt: promptFillFromMaster({ jobTitle: input.jobTitle, company: input.company, jobDescriptionText: input.jobDescriptionText, draftText, unusedText: unused, pages: result.resume.estimatedPages, missingRoles }),
      ...writeModel,
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
    tagline: resume.tagline,
    executive_summary: resume.summary,
    core_skills: resume.skills,
    experience: jobs.map(asSection),
    selected_projects: projects.map(asSection),
    highlights: resume.highlights.map((group) => ({ heading: group.heading, bullets: group.bullets.map((b) => b.text) })),
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
      // The resume in the shape downloads render from, plus what the checks found.
      structured_output: { ...structuredResume, engine: "master-v2", sourceRef, checked: { resume, findings, figures } } as unknown as Record<string, unknown>,
      rendered_document_id: documentId,
    })
    .select("id")
    .single();

  return NextResponse.json({
    stage: input.stage,
    master,
    corrections: openList,
    resume: { ...resume, jobs, projects },
    findings,
    gateSummary: summarize(findings),
    figures,
    notes: { summaryRewritten, filled, closedGaps, repaired, flagged: flagged.length + summaryFlagged.length },
    // The Word file's header comes from the Profile; say so when it is empty.
    contactMissing: !contact.full_name?.trim(),
    previewText,
    fileName: filename,
    documentId,
    artifactId: saved?.id ?? null,
  });
}

export const POST = authReplies(handlePOST);
