import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { ResumeTargeterInputSchema } from "@/lib/validators/tools";
import { generateJson } from "@/lib/llm/client";
import { promptResumeTargeter } from "@/lib/llm/prompts";

type ResumeTargeterOutput = {
  targeted_resume: string;
  keywords_added: string[];
  changes_made: string[];
  ats_alignment_notes: string[];
};

export async function POST(req: Request) {
  const { userId } = await requireUser();
  const supabase = supabaseServer();

  const body = await req.json();
  const parsed = ResumeTargeterInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { masterBulletsArtifactId, pastedResumeText, jobDescriptionText, company, jobTitle } = parsed.data;

  let masterText = pastedResumeText ?? "";

  if (!masterText && masterBulletsArtifactId) {
    const { data: artifact, error: artErr } = await supabase
      .from("resume_artifacts")
      .select("*")
      .eq("id", masterBulletsArtifactId)
      .eq("user_id", userId)
      .single();

    if (artErr) return NextResponse.json({ error: "Master bullets not found" }, { status: 404 });
    masterText = artifact.content;
  }

  if (!masterText || masterText.trim().length < 100) {
    return NextResponse.json({ error: "Provide master bullets artifact or pasted resume text." }, { status: 400 });
  }

  const prompt = promptResumeTargeter({
    masterBulletsText: masterText,
    jobDescriptionText,
    company: company ?? null,
    jobTitle: jobTitle ?? null,
  });

  const started = Date.now();
  const llm = await generateJson<ResumeTargeterOutput>(prompt);
  const latency = Date.now() - started;

  const baseRun = {
    user_id: userId,
    tool_name: "resume_targeter" as const,
    input_json: { masterBulletsArtifactId: masterBulletsArtifactId ?? null, jdLen: jobDescriptionText.length, company, jobTitle },
    latency_ms: latency,
  };

  if (!llm.ok) {
    await supabase.from("tool_runs").insert({ ...baseRun, status: "error", error_message: llm.error });
    return NextResponse.json({ error: llm.error }, { status: 500 });
  }

  await supabase.from("tool_runs").insert({
    ...baseRun,
    status: "success",
    output_json: llm.data as any,
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
      job_description: jobDescriptionText,
    })
    .select("id")
    .single();

  if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 });

  return NextResponse.json({ artifactId: saved.id, ...llm.data });
}