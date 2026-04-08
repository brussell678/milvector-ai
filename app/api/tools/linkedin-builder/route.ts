import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { LinkedinBuilderInputSchema } from "@/lib/validators/tools";
import { generateJson } from "@/lib/llm/client";
import {
  promptLinkedinBanner,
  promptLinkedinCareerSuggestions,
  promptLinkedinProfileGeneration,
  promptLinkedinResumeAnalysis,
} from "@/lib/llm/prompts";

type ResumeAnalysisOutput = {
  strengths: string[];
  functional_areas: string[];
  leadership_scope: string[];
  role_families: string[];
  skills: string[];
  civilian_translation_notes: string[];
  positioning_summary: string;
};

type CareerSuggestionOutput = {
  suggested_roles: Array<{
    title: string;
    why_fit: string;
    target_industries: string[];
    seniority: string;
  }>;
  suggested_industries: string[];
  recommended_seniority: string;
  positioning_advice: string[];
  location_strategy: string;
};

type LinkedinProfileOutput = {
  headlines: string[];
  about_versions: string[];
  experience: Array<{
    title: string;
    bullets: string[];
  }>;
  skills: string[];
  networking_guidance: {
    connection_targets: string[];
    outreach_messages: string[];
    activation_plan: string[];
  };
};

type BannerOutput = {
  banner_prompt: string;
  style_notes: string[];
  visual_focus: string[];
};

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function normalizeResumeAnalysis(data: Partial<ResumeAnalysisOutput>): ResumeAnalysisOutput {
  return {
    strengths: toStringArray(data.strengths),
    functional_areas: toStringArray(data.functional_areas),
    leadership_scope: toStringArray(data.leadership_scope),
    role_families: toStringArray(data.role_families),
    skills: toStringArray(data.skills),
    civilian_translation_notes: toStringArray(data.civilian_translation_notes),
    positioning_summary: String(data.positioning_summary ?? "").trim(),
  };
}

function normalizeCareerSuggestions(data: Partial<CareerSuggestionOutput>): CareerSuggestionOutput {
  return {
    suggested_roles: Array.isArray(data.suggested_roles)
      ? data.suggested_roles.map((role) => ({
          title: String(role?.title ?? "").trim(),
          why_fit: String(role?.why_fit ?? "").trim(),
          target_industries: toStringArray(role?.target_industries),
          seniority: String(role?.seniority ?? "").trim(),
        })).filter((role) => role.title)
      : [],
    suggested_industries: toStringArray(data.suggested_industries),
    recommended_seniority: String(data.recommended_seniority ?? "").trim(),
    positioning_advice: toStringArray(data.positioning_advice),
    location_strategy: String(data.location_strategy ?? "").trim(),
  };
}

function normalizeLinkedinProfile(data: Partial<LinkedinProfileOutput>): LinkedinProfileOutput {
  return {
    headlines: toStringArray(data.headlines),
    about_versions: toStringArray(data.about_versions),
    experience: Array.isArray(data.experience)
      ? data.experience
          .map((entry) => ({
            title: String(entry?.title ?? "").trim(),
            bullets: toStringArray(entry?.bullets),
          }))
          .filter((entry) => entry.title || entry.bullets.length > 0)
      : [],
    skills: toStringArray(data.skills),
    networking_guidance: {
      connection_targets: toStringArray(data.networking_guidance?.connection_targets),
      outreach_messages: toStringArray(data.networking_guidance?.outreach_messages),
      activation_plan: toStringArray(data.networking_guidance?.activation_plan),
    },
  };
}

function normalizeBanner(data: Partial<BannerOutput>): BannerOutput {
  return {
    banner_prompt: String(data.banner_prompt ?? "").trim(),
    style_notes: toStringArray(data.style_notes),
    visual_focus: toStringArray(data.visual_focus),
  };
}

export async function POST(req: Request) {
  const { userId } = await requireUser();
  const supabase = await supabaseServer();

  const body = await req.json();
  const parsed = LinkedinBuilderInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const {
    workflowStage,
    masterResumeArtifactId,
    masterResumeDocumentId,
    pastedResumeText,
    analysisContext,
    targetRole,
    industry,
    secondaryRoles,
    locationPref,
    tone,
  } = parsed.data;

  let masterResumeText = pastedResumeText ?? "";

  if (!masterResumeText && masterResumeArtifactId) {
    const { data: artifact, error } = await supabase
      .from("resume_artifacts")
      .select("content")
      .eq("id", masterResumeArtifactId)
      .eq("user_id", userId)
      .single();

    if (error) return NextResponse.json({ error: "Master resume artifact not found." }, { status: 404 });
    masterResumeText = artifact.content;
  }

  if (!masterResumeText && masterResumeDocumentId) {
    const { data: document, error } = await supabase
      .from("documents")
      .select("extracted_text,text_extracted")
      .eq("id", masterResumeDocumentId)
      .eq("user_id", userId)
      .single();

    if (error) return NextResponse.json({ error: "Master resume document not found." }, { status: 404 });
    if (!document.text_extracted || !document.extracted_text) {
      return NextResponse.json({ error: "Selected master resume document is not extracted yet." }, { status: 400 });
    }
    masterResumeText = document.extracted_text;
  }

  const baseRun = {
    user_id: userId,
    tool_name: "linkedin_builder" as const,
    input_json: {
      workflowStage,
      masterResumeArtifactId: masterResumeArtifactId ?? null,
      masterResumeDocumentId: masterResumeDocumentId ?? null,
      targetRole: targetRole ?? null,
      industry: industry ?? null,
      locationPref: locationPref ?? null,
    },
  };

  if (workflowStage !== "banner_prompt" && (!masterResumeText || masterResumeText.trim().length < 100)) {
    return NextResponse.json({ error: "Provide a master resume source or pasted resume text." }, { status: 400 });
  }

  const started = Date.now();

  if (workflowStage === "resume_analysis") {
    const llm = await generateJson<ResumeAnalysisOutput>(promptLinkedinResumeAnalysis({ masterResumeText }));
    const latency = Date.now() - started;

    if (!llm.ok) {
      await supabase.from("tool_runs").insert({ ...baseRun, latency_ms: latency, status: "error", error_message: llm.error });
      return NextResponse.json({ error: llm.error }, { status: 500 });
    }

    const normalized = normalizeResumeAnalysis(llm.data);
    await supabase.from("tool_runs").insert({
      ...baseRun,
      latency_ms: latency,
      status: "success",
      output_json: normalized as unknown as Record<string, unknown>,
      tokens_in: llm.tokensIn ?? null,
      tokens_out: llm.tokensOut ?? null,
    });

    return NextResponse.json(normalized);
  }

  if (workflowStage === "career_suggestions") {
    const llm = await generateJson<CareerSuggestionOutput>(
      promptLinkedinCareerSuggestions({
        masterResumeText,
        analysisContextJson: JSON.stringify(analysisContext ?? {}),
        locationPref: locationPref ?? null,
      })
    );
    const latency = Date.now() - started;

    if (!llm.ok) {
      await supabase.from("tool_runs").insert({ ...baseRun, latency_ms: latency, status: "error", error_message: llm.error });
      return NextResponse.json({ error: llm.error }, { status: 500 });
    }

    const normalized = normalizeCareerSuggestions(llm.data);
    await supabase.from("tool_runs").insert({
      ...baseRun,
      latency_ms: latency,
      status: "success",
      output_json: normalized as unknown as Record<string, unknown>,
      tokens_in: llm.tokensIn ?? null,
      tokens_out: llm.tokensOut ?? null,
    });

    return NextResponse.json(normalized);
  }

  if (workflowStage === "generate_profile") {
    if (!targetRole || !industry) {
      return NextResponse.json({ error: "Target role and industry are required to generate a LinkedIn profile." }, { status: 400 });
    }

    const llm = await generateJson<LinkedinProfileOutput>(
      promptLinkedinProfileGeneration({
        masterResumeText,
        analysisContextJson: JSON.stringify(analysisContext ?? {}),
        targetRole,
        industry,
        secondaryRoles: secondaryRoles ?? [],
        locationPref: locationPref ?? null,
      }),
      { timeoutMs: 90000 }
    );
    const latency = Date.now() - started;

    if (!llm.ok) {
      await supabase.from("tool_runs").insert({ ...baseRun, latency_ms: latency, status: "error", error_message: llm.error });
      return NextResponse.json({ error: llm.error }, { status: 500 });
    }

    const normalized = normalizeLinkedinProfile(llm.data);

    await supabase.from("tool_runs").insert({
      ...baseRun,
      latency_ms: latency,
      status: "success",
      output_json: normalized as unknown as Record<string, unknown>,
      tokens_in: llm.tokensIn ?? null,
      tokens_out: llm.tokensOut ?? null,
    });

    const { data: saved, error: saveError } = await supabase
      .from("linkedin_profiles")
      .insert({
        user_id: userId,
        resume_text: masterResumeText,
        target_role: targetRole,
        industry,
        location_pref: locationPref ?? null,
        generated_profile: normalized as unknown as Record<string, unknown>,
      })
      .select("id")
      .single();

    if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 });

    return NextResponse.json({ profileId: saved.id, ...normalized });
  }

  if (!targetRole || !industry) {
    return NextResponse.json({ error: "Target role and industry are required to generate a banner prompt." }, { status: 400 });
  }

  const llm = await generateJson<BannerOutput>(
    promptLinkedinBanner({
      targetRole,
      industry,
      tone: tone ?? null,
    })
  );
  const latency = Date.now() - started;

  if (!llm.ok) {
    await supabase.from("tool_runs").insert({ ...baseRun, latency_ms: latency, status: "error", error_message: llm.error });
    return NextResponse.json({ error: llm.error }, { status: 500 });
  }

  const normalized = normalizeBanner(llm.data);
  await supabase.from("tool_runs").insert({
    ...baseRun,
    latency_ms: latency,
    status: "success",
    output_json: normalized as unknown as Record<string, unknown>,
    tokens_in: llm.tokensIn ?? null,
    tokens_out: llm.tokensOut ?? null,
  });

  return NextResponse.json(normalized);
}
