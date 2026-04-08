import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { generateImage, generateJson } from "@/lib/llm/client";
import {
  promptLinkedinBanner,
  promptLinkedinCareerSuggestions,
  promptLinkedinProfileGeneration,
  promptLinkedinProfileScore,
  promptLinkedinResumeAnalysis,
} from "@/lib/llm/prompts";
import { LinkedinBuilderInputSchema } from "@/lib/validators/tools";

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

type EditableLinkedinProfileDocument = {
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

type ProfileScoreOutput = {
  overall_score: number;
  recruiter_readiness: string;
  strengths: string[];
  improvement_priorities: string[];
  section_scores: Array<{
    section: string;
    score: number;
    max_score: number;
    rationale: string;
    actions: string[];
  }>;
};

type SavedLinkedinProfileRow = {
  id: string;
  version_label: string | null;
  resume_text: string;
  target_role: string | null;
  industry: string | null;
  industry_tuning: string | null;
  location_pref: string | null;
  analysis_context: unknown;
  career_suggestions: unknown;
  generated_profile: unknown;
  profile_score: unknown;
  banner_output: unknown;
  banner_image_path: string | null;
  created_at: string;
  updated_at: string | null;
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
      ? data.suggested_roles
          .map((role) => ({
            title: String(role?.title ?? "").trim(),
            why_fit: String(role?.why_fit ?? "").trim(),
            target_industries: toStringArray(role?.target_industries),
            seniority: String(role?.seniority ?? "").trim(),
          }))
          .filter((role) => role.title)
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

function normalizeProfileScore(data: Partial<ProfileScoreOutput>): ProfileScoreOutput {
  return {
    overall_score: Math.max(0, Math.min(100, Number(data.overall_score ?? 0) || 0)),
    recruiter_readiness: String(data.recruiter_readiness ?? "").trim(),
    strengths: toStringArray(data.strengths),
    improvement_priorities: toStringArray(data.improvement_priorities),
    section_scores: Array.isArray(data.section_scores)
      ? data.section_scores
          .map((section) => ({
            section: String(section?.section ?? "").trim(),
            score: Math.max(0, Number(section?.score ?? 0) || 0),
            max_score: Math.max(1, Number(section?.max_score ?? 20) || 20),
            rationale: String(section?.rationale ?? "").trim(),
            actions: toStringArray(section?.actions),
          }))
          .filter((section) => section.section)
      : [],
  };
}

async function getMasterResumeText(args: {
  supabase: Awaited<ReturnType<typeof supabaseServer>>;
  userId: string;
  masterResumeArtifactId?: string;
  masterResumeDocumentId?: string;
  pastedResumeText?: string;
}) {
  let masterResumeText = args.pastedResumeText ?? "";

  if (!masterResumeText && args.masterResumeArtifactId) {
    const { data: artifact, error } = await args.supabase
      .from("resume_artifacts")
      .select("content")
      .eq("id", args.masterResumeArtifactId)
      .eq("user_id", args.userId)
      .single();

    if (error) {
      return { error: "Master resume artifact not found." } as const;
    }

    masterResumeText = artifact.content;
  }

  if (!masterResumeText && args.masterResumeDocumentId) {
    const { data: document, error } = await args.supabase
      .from("documents")
      .select("extracted_text,text_extracted")
      .eq("id", args.masterResumeDocumentId)
      .eq("user_id", args.userId)
      .single();

    if (error) {
      return { error: "Master resume document not found." } as const;
    }

    if (!document.text_extracted || !document.extracted_text) {
      return { error: "Selected master resume document is not extracted yet." } as const;
    }

    masterResumeText = document.extracted_text;
  }

  return { masterResumeText } as const;
}

async function signBannerUrl(supabase: Awaited<ReturnType<typeof supabaseServer>>, path: string | null) {
  if (!path) return null;

  const { data } = await supabase.storage.from("linkedin-banners").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

function toStoredJson(value: unknown) {
  return (value ?? {}) as Record<string, unknown>;
}

function renderLinkedinProfileDocument(args: {
  targetRole: string;
  industry: string;
  industryTuning?: string | null;
  locationPref?: string | null;
  versionLabel?: string | null;
  profile: EditableLinkedinProfileDocument;
  score?: ProfileScoreOutput | null;
  banner?: BannerOutput | null;
}) {
  const sections = [
    "# MilVector LinkedIn Profile Draft",
    "",
    `Version Label: ${args.versionLabel?.trim() || "Not set"}`,
    `Target Role: ${args.targetRole}`,
    `Industry: ${args.industry}`,
    `Industry Tuning: ${args.industryTuning?.trim() || "Not set"}`,
    `Location Preference: ${args.locationPref?.trim() || "Not set"}`,
    "",
    "## Headlines",
    ...args.profile.headlines.map((item) => `- ${item}`),
    "",
    "## About Versions",
    ...args.profile.about_versions.flatMap((about, index) => [`### About ${index + 1}`, about, ""]),
    "## Experience",
    ...args.profile.experience.flatMap((entry) => [`### ${entry.title}`, ...entry.bullets.map((bullet) => `- ${bullet}`), ""]),
    "## Skills",
    ...args.profile.skills.map((skill) => `- ${skill}`),
    "",
    "## Connection Targets",
    ...args.profile.networking_guidance.connection_targets.map((item) => `- ${item}`),
    "",
    "## Outreach Messages",
    ...args.profile.networking_guidance.outreach_messages.flatMap((message, index) => [`### Outreach ${index + 1}`, message, ""]),
    "## Activation Plan",
    ...args.profile.networking_guidance.activation_plan.map((item) => `- ${item}`),
  ];

  if (args.score) {
    sections.push(
      "",
      "## Profile Score",
      `Overall Score: ${args.score.overall_score}/100`,
      args.score.recruiter_readiness,
      "",
      "### Strengths",
      ...args.score.strengths.map((item) => `- ${item}`),
      "",
      "### Improvement Priorities",
      ...args.score.improvement_priorities.map((item) => `- ${item}`)
    );
  }

  if (args.banner) {
    sections.push(
      "",
      "## Banner Prompt",
      args.banner.banner_prompt,
      "",
      "### Style Notes",
      ...args.banner.style_notes.map((item) => `- ${item}`),
      "",
      "### Visual Focus",
      ...args.banner.visual_focus.map((item) => `- ${item}`)
    );
  }

  return sections.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function saveLinkedinProfileDocument(args: {
  supabase: Awaited<ReturnType<typeof supabaseServer>>;
  userId: string;
  filename: string;
  content: string;
}) {
  const documentId = crypto.randomUUID();
  const safeName = args.filename.replace(/[^\w.\- ]+/g, "_");
  const storagePath = `${args.userId}/${documentId}/${safeName}`;
  const buffer = Buffer.from(args.content, "utf8");
  const mimeType = "text/markdown; charset=utf-8";

  const { error: uploadError } = await args.supabase.storage
    .from("documents")
    .upload(storagePath, buffer, { contentType: mimeType, upsert: false });

  if (uploadError) {
    return { error: uploadError.message } as const;
  }

  const { error: insertError } = await args.supabase.from("documents").insert({
    id: documentId,
    user_id: args.userId,
    doc_type: "LINKEDIN_PROFILE",
    filename: args.filename,
    storage_path: storagePath,
    mime_type: mimeType,
    size_bytes: buffer.byteLength,
    text_extracted: true,
    extracted_text: args.content,
  });

  if (insertError) {
    await args.supabase.storage.from("documents").remove([storagePath]);
    return { error: insertError.message } as const;
  }

  return { documentId } as const;
}

async function formatLinkedinBannerImage(sourcePng: Buffer) {
  const base = sharp(sourcePng).resize(1584, 396, {
    fit: "cover",
    position: "centre",
  });

  const pngBuffer = await base.clone().png({
    compressionLevel: 9,
    palette: true,
    quality: 90,
  }).toBuffer();

  if (pngBuffer.byteLength <= 8 * 1024 * 1024) {
    return {
      buffer: pngBuffer,
      contentType: "image/png",
      extension: "png",
      sizeBytes: pngBuffer.byteLength,
    } as const;
  }

  const jpegBuffer = await base.clone().jpeg({
    quality: 88,
    mozjpeg: true,
  }).toBuffer();

  if (jpegBuffer.byteLength <= 8 * 1024 * 1024) {
    return {
      buffer: jpegBuffer,
      contentType: "image/jpeg",
      extension: "jpg",
      sizeBytes: jpegBuffer.byteLength,
    } as const;
  }

  const tighterJpegBuffer = await base.clone().jpeg({
    quality: 76,
    mozjpeg: true,
  }).toBuffer();

  return {
    buffer: tighterJpegBuffer,
    contentType: "image/jpeg",
    extension: "jpg",
    sizeBytes: tighterJpegBuffer.byteLength,
  } as const;
}

export async function GET() {
  const { userId } = await requireUser();
  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .from("linkedin_profiles")
    .select(
      "id,version_label,resume_text,target_role,industry,industry_tuning,location_pref,analysis_context,career_suggestions,generated_profile,profile_score,banner_output,banner_image_path,created_at,updated_at"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as SavedLinkedinProfileRow[];
  const profiles = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      versionLabel: row.version_label,
      resumeText: row.resume_text,
      targetRole: row.target_role,
      industry: row.industry,
      industryTuning: row.industry_tuning,
      locationPref: row.location_pref,
      analysisContext: row.analysis_context ?? {},
      careerSuggestions: row.career_suggestions ?? {},
      generatedProfile: row.generated_profile ?? {},
      profileScore: row.profile_score ?? {},
      bannerOutput: row.banner_output ?? {},
      bannerImageUrl: await signBannerUrl(supabase, row.banner_image_path),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  );

  return NextResponse.json({ profiles });
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
    profileId,
    profileJson,
    targetRole,
    industry,
    industryTuning,
    secondaryRoles,
    locationPref,
    tone,
    bannerPrompt,
    versionLabel,
  } = parsed.data;

  const baseRun = {
    user_id: userId,
    tool_name: "linkedin_builder" as const,
    input_json: {
      workflowStage,
      profileId: profileId ?? null,
      masterResumeArtifactId: masterResumeArtifactId ?? null,
      masterResumeDocumentId: masterResumeDocumentId ?? null,
      targetRole: targetRole ?? null,
      industry: industry ?? null,
      industryTuning: industryTuning ?? null,
      locationPref: locationPref ?? null,
      versionLabel: versionLabel ?? null,
    },
  };

  const started = Date.now();

  if (workflowStage === "resume_analysis" || workflowStage === "career_suggestions" || workflowStage === "generate_profile") {
    const resumeResult = await getMasterResumeText({
      supabase,
      userId,
      masterResumeArtifactId,
      masterResumeDocumentId,
      pastedResumeText,
    });

    if ("error" in resumeResult) {
      const resumeError = resumeResult.error ?? "Unable to load master resume.";
      return NextResponse.json({ error: resumeError }, { status: resumeError.includes("not found") ? 404 : 400 });
    }

    const masterResumeText = resumeResult.masterResumeText;
    if (!masterResumeText || masterResumeText.trim().length < 100) {
      return NextResponse.json({ error: "Provide a master resume source or pasted resume text." }, { status: 400 });
    }

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
        output_json: toStoredJson(normalized),
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
        output_json: toStoredJson(normalized),
        tokens_in: llm.tokensIn ?? null,
        tokens_out: llm.tokensOut ?? null,
      });

      return NextResponse.json(normalized);
    }

    if (!targetRole || !industry) {
      return NextResponse.json({ error: "Target role and industry are required to generate a LinkedIn profile." }, { status: 400 });
    }

    const effectiveIndustry = industryTuning ? `${industry} | Industry tuning: ${industryTuning}` : industry;
    const llm = await generateJson<LinkedinProfileOutput>(
      promptLinkedinProfileGeneration({
        masterResumeText,
        analysisContextJson: JSON.stringify(analysisContext ?? {}),
        targetRole,
        industry: effectiveIndustry,
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
      output_json: toStoredJson(normalized),
      tokens_in: llm.tokensIn ?? null,
      tokens_out: llm.tokensOut ?? null,
    });

    const { data: saved, error: saveError } = await supabase
      .from("linkedin_profiles")
      .insert({
        user_id: userId,
        version_label: versionLabel?.trim() || null,
        resume_text: masterResumeText,
        target_role: targetRole,
        industry,
        industry_tuning: industryTuning ?? null,
        location_pref: locationPref ?? null,
        analysis_context: toStoredJson(analysisContext),
        career_suggestions: toStoredJson(analysisContext && "careerSuggestions" in analysisContext ? analysisContext.careerSuggestions : {}),
        generated_profile: toStoredJson(normalized),
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 500 });
    }

    return NextResponse.json({ profileId: saved.id, ...normalized });
  }

  if (workflowStage === "score_profile") {
    if (!targetRole || !industry || !profileJson) {
      return NextResponse.json({ error: "Target role, industry, and generated profile data are required to score the profile." }, { status: 400 });
    }

    const llm = await generateJson<ProfileScoreOutput>(
      promptLinkedinProfileScore({
        targetRole,
        industry,
        industryTuning: industryTuning ?? null,
        generatedProfileJson: JSON.stringify(profileJson),
      })
    );
    const latency = Date.now() - started;

    if (!llm.ok) {
      await supabase.from("tool_runs").insert({ ...baseRun, latency_ms: latency, status: "error", error_message: llm.error });
      return NextResponse.json({ error: llm.error }, { status: 500 });
    }

    const normalized = normalizeProfileScore(llm.data);
    await supabase.from("tool_runs").insert({
      ...baseRun,
      latency_ms: latency,
      status: "success",
      output_json: toStoredJson(normalized),
      tokens_in: llm.tokensIn ?? null,
      tokens_out: llm.tokensOut ?? null,
    });

    if (profileId) {
      await supabase
        .from("linkedin_profiles")
        .update({
          profile_score: toStoredJson(normalized),
          updated_at: new Date().toISOString(),
        })
        .eq("id", profileId)
        .eq("user_id", userId);
    }

    return NextResponse.json(normalized);
  }

  if (workflowStage === "save_document") {
    if (!targetRole || !industry || !profileJson) {
      return NextResponse.json({ error: "Target role, industry, and profile data are required to save a LinkedIn draft document." }, { status: 400 });
    }

    const normalizedProfile = normalizeLinkedinProfile(profileJson as Partial<LinkedinProfileOutput>);
    const scorePayload = analysisContext && "profileScore" in analysisContext
      ? normalizeProfileScore((analysisContext.profileScore ?? {}) as Partial<ProfileScoreOutput>)
      : null;
    const bannerPayload = analysisContext && "bannerOutput" in analysisContext
      ? normalizeBanner((analysisContext.bannerOutput ?? {}) as Partial<BannerOutput>)
      : null;
    const content = renderLinkedinProfileDocument({
      targetRole,
      industry,
      industryTuning: industryTuning ?? null,
      locationPref: locationPref ?? null,
      versionLabel: versionLabel ?? null,
      profile: normalizedProfile,
      score: scorePayload,
      banner: bannerPayload,
    });
    const filenameBase = versionLabel?.trim() || targetRole.trim() || "LinkedIn Profile Draft";
    const savedDocument = await saveLinkedinProfileDocument({
      supabase,
      userId,
      filename: `${filenameBase}.md`,
      content,
    });

    if ("error" in savedDocument) {
      return NextResponse.json({ error: savedDocument.error }, { status: 500 });
    }

    return NextResponse.json({ documentId: savedDocument.documentId, filename: `${filenameBase}.md` });
  }

  if (!targetRole || !industry) {
    return NextResponse.json({ error: "Target role and industry are required." }, { status: 400 });
  }

  if (workflowStage === "banner_prompt") {
    const effectiveIndustry = industryTuning ? `${industry} | Industry tuning: ${industryTuning}` : industry;
    const llm = await generateJson<BannerOutput>(
      promptLinkedinBanner({
        targetRole,
        industry: effectiveIndustry,
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
      output_json: toStoredJson(normalized),
      tokens_in: llm.tokensIn ?? null,
      tokens_out: llm.tokensOut ?? null,
    });

    if (profileId) {
      await supabase
        .from("linkedin_profiles")
        .update({
          banner_output: toStoredJson(normalized),
          updated_at: new Date().toISOString(),
        })
        .eq("id", profileId)
        .eq("user_id", userId);
    }

    return NextResponse.json(normalized);
  }

  const promptToUse = bannerPrompt?.trim();
  if (!promptToUse || promptToUse.length < 20) {
    return NextResponse.json({ error: "Generate a banner prompt before requesting a banner image." }, { status: 400 });
  }

  const imageResult = await generateImage({ prompt: promptToUse });
  const latency = Date.now() - started;

  if (!imageResult.ok) {
    await supabase.from("tool_runs").insert({ ...baseRun, latency_ms: latency, status: "error", error_message: imageResult.error });
    return NextResponse.json({ error: imageResult.error }, { status: 500 });
  }

  const generatedBytes = Buffer.from(imageResult.b64Json, "base64");
  const formattedBanner = await formatLinkedinBannerImage(generatedBytes);
  const storagePath = `${userId}/${crypto.randomUUID()}.${formattedBanner.extension}`;
  const { error: uploadError } = await supabase.storage.from("linkedin-banners").upload(storagePath, formattedBanner.buffer, {
    contentType: formattedBanner.contentType,
    upsert: false,
  });

  if (uploadError) {
    await supabase.from("tool_runs").insert({ ...baseRun, latency_ms: latency, status: "error", error_message: uploadError.message });
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const signedUrl = await signBannerUrl(supabase, storagePath);
  await supabase.from("tool_runs").insert({
    ...baseRun,
    latency_ms: latency,
    status: "success",
    output_json: toStoredJson({
      bannerImagePath: storagePath,
      signedUrl,
      revisedPrompt: imageResult.revisedPrompt ?? null,
      width: 1584,
      height: 396,
      aspectRatio: "4:1",
      contentType: formattedBanner.contentType,
      sizeBytes: formattedBanner.sizeBytes,
    }),
    tokens_in: imageResult.tokensIn ?? null,
    tokens_out: imageResult.tokensOut ?? null,
  });

  if (profileId) {
    await supabase
      .from("linkedin_profiles")
      .update({
        banner_image_path: storagePath,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profileId)
      .eq("user_id", userId);
  }

  return NextResponse.json({
    imageUrl: signedUrl,
    revisedPrompt: imageResult.revisedPrompt ?? null,
    width: 1584,
    height: 396,
    aspectRatio: "4:1",
    contentType: formattedBanner.contentType,
    sizeBytes: formattedBanner.sizeBytes,
  });
}
