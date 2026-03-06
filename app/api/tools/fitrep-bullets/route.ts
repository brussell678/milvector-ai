import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { FitrepBulletsSchema } from "@/lib/validators/documents";
import { generateJson } from "@/lib/llm/client";
import { promptFitrepBullets } from "@/lib/llm/prompts";

type FitrepBulletsOutput = {
  bullets: { category: string; bullet: string; metrics_used: string[] }[];
  suggested_job_titles: string[];
  core_keywords: string[];
};

export async function POST(req: Request) {
  const { userId } = await requireUser();
  const supabase = supabaseServer();

  const body = await req.json();
  const parsed = FitrepBulletsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { documentId, pastedText, targetRole } = parsed.data;

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

  if (!extractedText || extractedText.trim().length < 50) {
    return NextResponse.json({ error: "No usable text. Extract text first or paste content." }, { status: 400 });
  }

  const prompt = promptFitrepBullets({
    extractedText,
    branch: profile?.branch ?? "USMC",
    mos: profile?.mos ?? null,
    rank: profile?.rank ?? null,
    targetRole: targetRole ?? null,
  });

  const started = Date.now();
  const llm = await generateJson<FitrepBulletsOutput>(prompt);
  const latency = Date.now() - started;

  // tool_runs: log attempt
  const baseRun = {
    user_id: userId,
    tool_name: "fitrep_bullets" as const,
    input_json: { documentId: documentId ?? null, hasPastedText: !!pastedText, targetRole: targetRole ?? null },
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
    output_json: llm.data as any,
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