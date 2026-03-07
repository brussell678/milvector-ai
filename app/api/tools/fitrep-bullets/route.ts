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
  docs: Array<{ doc_type: string; filename: string; extracted_text: string | null }>,
  maxTotalChars: number
) {
  const linePriority =
    /(led|managed|oversaw|directed|improved|reduced|increased|trained|developed|implemented|readiness|maintenance|operations|logistics|budget|cost|savings|award|inspection|compliance|mission|deploy|%|\$|\d)/i;
  const perDocCap = 5000;
  const chunks: string[] = [];
  let used = 0;

  for (const doc of docs) {
    const raw = doc.extracted_text ?? "";
    if (!raw.trim()) continue;
    const compact = compactTextByPriority(raw, perDocCap, linePriority);
    const block = `### ${doc.doc_type}: ${doc.filename}\n${compact}\n`;
    if (used + block.length > maxTotalChars) break;
    chunks.push(block);
    used += block.length;
  }

  return chunks.join("\n");
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
  };

  if (mode === "master_resume") {
    let resolvedVmetText = vmetText ?? "";
    let resolvedJstText = jstText ?? "";
    let resolvedFitrepsText = fitrepsText ?? "";
    let sourceDocumentIdFromSet: string | null = null;

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

      if (!resolvedVmetText && vmetDoc?.extracted_text) resolvedVmetText = vmetDoc.extracted_text;
      if (!resolvedJstText && jstDoc?.extracted_text) resolvedJstText = jstDoc.extracted_text;
      if (!resolvedFitrepsText) {
        resolvedFitrepsText = buildFitrepCorpus(fitrepDocs, 60000);
      }
      sourceDocumentIdFromSet = fitrepDocs.at(-1)?.id ?? vmetDoc?.id ?? jstDoc?.id ?? null;
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

    const title = `Master resume (${new Date().toISOString().slice(0, 10)})`;
    const { data: artifact, error: artErr } = await supabase
      .from("resume_artifacts")
      .insert({
        user_id: userId,
        artifact_type: "master_resume",
        title,
        content: llm.data.master_resume,
        source_document_id: sourceDocumentId ?? sourceDocumentIdFromSet,
      })
      .select("id")
      .single();

    if (artErr) return NextResponse.json({ error: artErr.message }, { status: 500 });

    return NextResponse.json({ artifactId: artifact.id, mode, ...llm.data });
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
