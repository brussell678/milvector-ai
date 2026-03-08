import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { FitrepBulletsSchema } from "@/lib/validators/documents";
import { generateJson } from "@/lib/llm/client";
import { promptFitrepBullets, promptMasterResumeFromMilitaryDocs } from "@/lib/llm/prompts";
import { getEnv } from "@/lib/env";

type FitrepBulletsOutput = {
  bullets: { category: string; bullet: string; metrics_used: string[] }[];
  suggested_job_titles: string[];
  core_keywords: string[];
};

type MasterResumeOutput = {
  career_timeline: {
    role_title: string;
    organization: string;
    date_range: string;
    observed_periods: string[];
    notes: string;
  }[];
  accomplishment_bank: {
    bullet: string;
    fitrep_date_range: string;
    source: "MRO" | "RS" | "RO";
    metrics_used: string[];
  }[];
  skills_and_credentials: {
    education_training: string[];
    certifications: string[];
    technical_training: string[];
    leadership_pme: string[];
  };
  master_resume: string;
  validation_questions: string[];
};

type ExperienceEntry = {
  role: string;
  organization: string;
  dateRange: string;
  bullets: string[];
};

function normalizeText(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function compactTextByPriority(text: string, maxChars: number, priorityPattern: RegExp) {
  const normalized = normalizeText(text);
  if (normalized.length <= maxChars) return normalized;

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const priority: string[] = [];
  const fallback: string[] = [];
  for (const line of lines) {
    if (priorityPattern.test(line)) priority.push(line);
    else fallback.push(line);
  }

  const selected: string[] = [];
  let used = 0;

  const appendLines = (source: string[]) => {
    for (const line of source) {
      const next = line.length + 1;
      if (used + next > maxChars) break;
      selected.push(line);
      used += next;
    }
  };

  appendLines(priority);
  appendLines(fallback);

  if (selected.length === 0) return normalized.slice(0, maxChars);
  return selected.join("\n");
}

function buildFitrepCorpus(
  docs: Array<{ doc_type: string; filename: string; extracted_text: string | null; created_at: string }>,
  maxTotalChars: number
) {
  const linePriority =
    /(led|managed|oversaw|directed|improved|reduced|increased|trained|developed|implemented|readiness|maintenance|operations|logistics|budget|cost|savings|award|inspection|compliance|mission|deploy|%|\$|\d)/i;
  const docsByRecency = [...docs].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const perDocCap = Math.max(1400, Math.min(5000, Math.floor(maxTotalChars / Math.max(docsByRecency.length, 1)) - 120));
  const chosen: Array<{ created_at: string; block: string }> = [];
  let used = 0;

  for (const doc of docsByRecency) {
    const raw = doc.extracted_text ?? "";
    if (!raw.trim()) continue;
    const header = `### ${doc.doc_type}: ${doc.filename}\n`;
    const remaining = maxTotalChars - used;
    if (remaining <= header.length + 200) continue;
    const compact = compactTextByPriority(raw, Math.min(perDocCap, remaining - header.length), linePriority);
    const block = `${header}${compact}\n`;
    if (used + block.length > maxTotalChars) continue;
    chosen.push({ created_at: doc.created_at, block });
    used += block.length;
  }

  const chunks = chosen
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((x) => x.block);

  return {
    text: chunks.join("\n"),
    includedDocCount: chosen.length,
    detectedDocCount: docs.length,
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseMonthYear(value: string) {
  const match = value.trim().match(/^([A-Za-z]{3,9})\s+(\d{4})$/);
  if (!match) return null;
  const monthIdx = MONTHS.findIndex((m) => m.toLowerCase() === match[1].slice(0, 3).toLowerCase());
  if (monthIdx < 0) return null;
  return { month: monthIdx, year: Number(match[2]) };
}

function compareMonthYear(a: { month: number; year: number }, b: { month: number; year: number }) {
  if (a.year !== b.year) return a.year - b.year;
  return a.month - b.month;
}

function formatMonthYear(value: { month: number; year: number }) {
  return `${MONTHS[value.month]} ${value.year}`;
}

function mergeDateRanges(existing: string, incoming: string) {
  const parseRange = (range: string) => {
    const [leftRaw, rightRaw] = range.split(/\s*-\s*/);
    if (!leftRaw || !rightRaw) return null;
    const left = parseMonthYear(leftRaw);
    const rightIsPresent = /^present$/i.test(rightRaw.trim());
    const right = rightIsPresent ? null : parseMonthYear(rightRaw);
    if (!left || (!rightIsPresent && !right)) return null;
    return { start: left, end: right, present: rightIsPresent };
  };

  const one = parseRange(existing);
  const two = parseRange(incoming);
  if (!one || !two) return existing === incoming ? existing : `${existing} / ${incoming}`;

  const earliestStart = compareMonthYear(one.start, two.start) <= 0 ? one.start : two.start;
  const endIsPresent = one.present || two.present;
  let latestEnd: { month: number; year: number } | null = null;

  if (!endIsPresent) {
    if (one.end && two.end) latestEnd = compareMonthYear(one.end, two.end) >= 0 ? one.end : two.end;
    else latestEnd = one.end ?? two.end;
  }

  return `${formatMonthYear(earliestStart)} - ${endIsPresent ? "Present" : formatMonthYear(latestEnd!)}`;
}

function mergeProfessionalExperience(masterResume: string) {
  const lines = masterResume.replace(/\r\n/g, "\n").split("\n");
  const profIdx = lines.findIndex((l) => l.trim() === "Professional Experience");
  if (profIdx < 0) return masterResume;
  const afterProf = lines.slice(profIdx + 1);
  const endOffset = afterProf.findIndex((l) => l.trim() === "Education & Training");
  const endIdx = endOffset >= 0 ? profIdx + 1 + endOffset : lines.length;

  const before = lines.slice(0, profIdx + 1);
  const expLines = lines.slice(profIdx + 1, endIdx);
  const after = lines.slice(endIdx);

  const entries: ExperienceEntry[] = [];
  let current: ExperienceEntry | null = null;

  const flush = () => {
    if (!current) return;
    entries.push(current);
    current = null;
  };

  for (const rawLine of expLines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("- ")) {
      if (!current) continue;
      current.bullets.push(line);
      continue;
    }

    flush();
    const parts = line.split(" | ").map((p) => p.trim());
    if (parts.length < 3) continue;
    current = {
      role: parts[0],
      organization: parts[1],
      dateRange: parts.slice(2).join(" | "),
      bullets: [],
    };
  }
  flush();
  if (entries.length === 0) return masterResume;

  const merged: ExperienceEntry[] = [];
  for (const entry of entries) {
    const prev = merged.at(-1);
    if (!prev) {
      merged.push({ ...entry });
      continue;
    }
    if (
      prev.role.trim().toLowerCase() === entry.role.trim().toLowerCase() &&
      prev.organization.trim().toLowerCase() === entry.organization.trim().toLowerCase()
    ) {
      prev.dateRange = mergeDateRanges(prev.dateRange, entry.dateRange);
      for (const bullet of entry.bullets) {
        if (!prev.bullets.includes(bullet)) prev.bullets.push(bullet);
      }
      continue;
    }
    merged.push({ ...entry });
  }

  const rebuilt: string[] = [];
  rebuilt.push("");
  for (const entry of merged) {
    rebuilt.push(`${entry.role} | ${entry.organization} | ${entry.dateRange}`);
    for (const bullet of entry.bullets) rebuilt.push(bullet);
    rebuilt.push("");
  }
  if (rebuilt.at(-1) === "") rebuilt.pop();

  return [...before, ...rebuilt, ...after].join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function POST(req: Request) {
  const env = getEnv();
  const { userId } = await requireUser();
  const supabase = await supabaseServer();

  const body = await req.json();
  const parsed = FitrepBulletsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { mode, documentId, pastedText, vmetText, jstText, fitrepsText, targetRole } = parsed.data;

  // Load profile (optional)
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

  let extractedText = pastedText ?? "";

  let sourceDocumentId: string | null = null;

  if (!extractedText && documentId) {
    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .eq("user_id", userId)
      .single();

    if (docErr) return NextResponse.json({ error: "Document not found" }, { status: 404 });
    extractedText = doc.extracted_text ?? "";
    sourceDocumentId = doc.id;
  }

  if (mode === "bullets" && (!extractedText || extractedText.trim().length < 50)) {
    return NextResponse.json({ error: "No usable text. Extract text first or paste content." }, { status: 400 });
  }

  const profileContext = {
    branch: profile?.branch ?? "USMC",
    mos: profile?.mos ?? null,
    rank: profile?.rank ?? null,
    targetRole: targetRole ?? null,
    serviceComponent: profile?.service_component ?? null,
    yearsServiceAtEas:
      profile?.years_service_at_eas === null || profile?.years_service_at_eas === undefined
        ? null
        : Number(profile.years_service_at_eas),
    offDutyEducation: profile?.off_duty_education ?? [],
    civilianCertifications: profile?.civilian_certifications ?? [],
    additionalTraining: profile?.additional_training ?? [],
  };

  if (mode === "master_resume") {
    let resolvedVmetText = vmetText ?? "";
    let resolvedJstText = jstText ?? "";
    let resolvedFitrepsText = fitrepsText ?? "";
    let sourceDocumentIdFromSet: string | null = null;
    let fitrepDocsDetected = 0;
    let fitrepDocsIncluded = 0;

    if (!resolvedVmetText || !resolvedJstText || !resolvedFitrepsText) {
      const { data: docs, error: docsErr } = await supabase
        .from("documents")
        .select("id,doc_type,filename,created_at,extracted_text,text_extracted")
        .eq("user_id", userId)
        .eq("text_extracted", true)
        .not("extracted_text", "is", null)
        .in("doc_type", ["VMET", "JST", "FITREP", "EVAL"])
        .order("created_at", { ascending: true });

      if (docsErr) {
        return NextResponse.json({ error: docsErr.message }, { status: 500 });
      }

      const vmetDoc = docs?.find((d) => d.doc_type === "VMET");
      const jstDoc = docs?.find((d) => d.doc_type === "JST");
      const fitrepDocs = docs?.filter((d) => d.doc_type === "FITREP" || d.doc_type === "EVAL") ?? [];
      fitrepDocsDetected = fitrepDocs.length;

      if (!resolvedVmetText && vmetDoc?.extracted_text) resolvedVmetText = vmetDoc.extracted_text;
      if (!resolvedJstText && jstDoc?.extracted_text) resolvedJstText = jstDoc.extracted_text;
      if (!resolvedFitrepsText) {
        const corpus = buildFitrepCorpus(fitrepDocs, 60000);
        resolvedFitrepsText = corpus.text;
        fitrepDocsIncluded = corpus.includedDocCount;
      }
      sourceDocumentIdFromSet = fitrepDocs.at(-1)?.id ?? vmetDoc?.id ?? jstDoc?.id ?? null;
    } else {
      fitrepDocsDetected = 0;
      fitrepDocsIncluded = 0;
    }

    const credentialPriority =
      /(cert|certificate|course|training|education|degree|diploma|qualification|pme|school|completed|awarded|\d{4})/i;
    resolvedVmetText = compactTextByPriority(resolvedVmetText, 16000, credentialPriority);
    resolvedJstText = compactTextByPriority(resolvedJstText, 16000, credentialPriority);
    resolvedFitrepsText = compactTextByPriority(
      resolvedFitrepsText,
      60000,
      /(led|managed|oversaw|directed|improved|reduced|increased|trained|developed|implemented|readiness|maintenance|operations|logistics|budget|cost|savings|award|inspection|compliance|mission|deploy|%|\$|\d)/i
    );

    if (!resolvedVmetText || !resolvedJstText || !resolvedFitrepsText) {
      return NextResponse.json(
        { error: "Missing source text. Upload/extract VMET + JST + FITREP/EVAL docs (or paste all three manually)." },
        { status: 400 }
      );
    }

    const prompt = promptMasterResumeFromMilitaryDocs({
      ...profileContext,
      vmetText: resolvedVmetText,
      jstText: resolvedJstText,
      fitrepsText: resolvedFitrepsText,
    });

    const started = Date.now();
    const llm = await generateJson<MasterResumeOutput>(prompt, {
      timeoutMs: 180000,
      model: env.MASTER_RESUME_MODEL ?? env.OPENAI_MODEL,
      temperature: 0.1,
    });
    const latency = Date.now() - started;

    const baseRun = {
      user_id: userId,
      tool_name: "fitrep_bullets" as const,
      input_json: {
        mode,
        hasVmet: !!resolvedVmetText,
        hasJst: !!resolvedJstText,
        fitrepsLen: resolvedFitrepsText.length,
        targetRole: targetRole ?? null,
      },
      latency_ms: latency,
    };

    if (!llm.ok) {
      const message = llm.error.includes("Request too large")
        ? "Input too large for current model/rate limit. Reduce documents, or retry later."
        : llm.error;
      await supabase.from("tool_runs").insert({
        ...baseRun,
        status: "error",
        error_message: message,
        output_json: null,
      });
      return NextResponse.json({ error: message }, { status: 500 });
    }

    await supabase.from("tool_runs").insert({
      ...baseRun,
      status: "success",
      output_json: llm.data as unknown as Record<string, unknown>,
      tokens_in: llm.tokensIn ?? null,
      tokens_out: llm.tokensOut ?? null,
    });

    const normalizedMasterResume = mergeProfessionalExperience(llm.data.master_resume);
    const title = `Master resume (${new Date().toISOString().slice(0, 10)})`;
    const { data: artifact, error: artErr } = await supabase
      .from("resume_artifacts")
      .insert({
        user_id: userId,
        artifact_type: "master_resume",
        title,
        content: normalizedMasterResume,
        source_document_id: sourceDocumentId ?? sourceDocumentIdFromSet,
      })
      .select("id")
      .single();

    if (artErr) return NextResponse.json({ error: artErr.message }, { status: 500 });

    let autosavedDocumentId: string | null = null;
    let autosaveWarning: string | null = null;
    try {
      const documentId = crypto.randomUUID();
      const filename = `master_resume_${new Date().toISOString().slice(0, 10)}_${artifact.id.slice(0, 8)}.txt`;
      const storagePath = `${userId}/${documentId}/${filename}`;
      const buffer = Buffer.from(normalizedMasterResume, "utf8");

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(storagePath, buffer, { contentType: "text/plain; charset=utf-8", upsert: false });

      if (uploadError) {
        autosaveWarning = `Master resume generated, but auto-save to Documents failed: ${uploadError.message}`;
      } else {
        const { data: insertedDoc, error: insertDocError } = await supabase
          .from("documents")
          .insert({
            id: documentId,
            user_id: userId,
            doc_type: "MASTER_RESUME",
            filename,
            storage_path: storagePath,
            mime_type: "text/plain",
            size_bytes: buffer.byteLength,
            text_extracted: true,
            extracted_text: normalizedMasterResume,
          })
          .select("id")
          .single();

        if (insertDocError) {
          autosaveWarning = `Master resume generated, but auto-save metadata failed: ${insertDocError.message}`;
        } else {
          autosavedDocumentId = insertedDoc.id;
        }
      }
    } catch (error) {
      autosaveWarning = error instanceof Error
        ? `Master resume generated, but auto-save encountered an error: ${error.message}`
        : "Master resume generated, but auto-save encountered an unknown error.";
    }

    return NextResponse.json({
      artifactId: artifact.id,
      autosavedDocumentId,
      autosaveWarning,
      mode,
      fitrepDocsDetected,
      fitrepDocsIncluded,
      fitrepDocsTruncated: fitrepDocsDetected > 0 && fitrepDocsIncluded < fitrepDocsDetected,
      ...llm.data,
      master_resume: normalizedMasterResume,
    });
  }

  const prompt = promptFitrepBullets({
    extractedText,
    ...profileContext,
  });

  const started = Date.now();
  const llm = await generateJson<FitrepBulletsOutput>(prompt);
  const latency = Date.now() - started;

  // tool_runs: log attempt
  const baseRun = {
    user_id: userId,
    tool_name: "fitrep_bullets" as const,
    input_json: { mode, documentId: documentId ?? null, hasPastedText: !!pastedText, targetRole: targetRole ?? null },
    latency_ms: latency,
  };

  if (!llm.ok) {
    await supabase.from("tool_runs").insert({
      ...baseRun,
      status: "error",
      error_message: llm.error,
      output_json: null,
    });

    return NextResponse.json({ error: llm.error }, { status: 500 });
  }

  await supabase.from("tool_runs").insert({
    ...baseRun,
    status: "success",
    output_json: llm.data as Record<string, unknown>,
    tokens_in: llm.tokensIn ?? null,
    tokens_out: llm.tokensOut ?? null,
  });

  // Save artifact: master bullets as markdown lines
  const content = llm.data.bullets.map(b => `- ${b.bullet}`).join("\n");
  const title = `Master bullets (${new Date().toISOString().slice(0,10)})`;

  const { data: artifact, error: artErr } = await supabase
    .from("resume_artifacts")
    .insert({
      user_id: userId,
      artifact_type: "master_bullets",
      title,
      content,
      source_document_id: sourceDocumentId,
    })
    .select("id")
    .single();

  if (artErr) return NextResponse.json({ error: artErr.message }, { status: 500 });

  return NextResponse.json({ artifactId: artifact.id, ...llm.data });
}
