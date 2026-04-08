import { z } from "zod";

export const MosTranslatorInputSchema = z.object({
  mos: z.string().min(2),
  billets: z.array(z.string()).optional().nullable(),
  yearsExp: z.number().int().min(0).max(60).optional().nullable(),
  interests: z.array(z.string()).optional().nullable(),
});

export const JdDecoderInputSchema = z.object({
  jobDescriptionText: z.string().min(100),
});

export const ResumeTargeterInputSchema = z.object({
  workflowStage: z.enum(["quick_generate", "title_research", "posting_analysis", "generate_resume"]).optional().default("quick_generate"),
  userConfirmedGenerate: z.boolean().optional(),
  masterResumeArtifactId: z.string().uuid().optional(),
  masterBulletsArtifactId: z.string().uuid().optional(),
  masterResumeDocumentId: z.string().uuid().optional(),
  pastedResumeText: z.string().min(100).optional(),
  stage1Context: z.record(z.any()).optional(),
  stage2Context: z.record(z.any()).optional(),
  jobDescriptionText: z.string().min(100).optional(),
  company: z.string().optional().nullable(),
  jobTitle: z.string().optional().nullable(),
});

export const LinkedinBuilderInputSchema = z.object({
  workflowStage: z.enum(["resume_analysis", "career_suggestions", "generate_profile", "score_profile", "banner_prompt", "banner_image", "save_document"]),
  masterResumeArtifactId: z.string().uuid().optional(),
  masterResumeDocumentId: z.string().uuid().optional(),
  pastedResumeText: z.string().min(100).optional(),
  analysisContext: z.record(z.any()).optional(),
  profileId: z.string().uuid().optional(),
  profileJson: z.record(z.any()).optional(),
  targetRole: z.string().min(2).optional().nullable(),
  industry: z.string().min(2).optional().nullable(),
  industryTuning: z.string().optional().nullable(),
  secondaryRoles: z.array(z.string()).optional().nullable(),
  locationPref: z.string().optional().nullable(),
  tone: z.string().optional().nullable(),
  bannerPrompt: z.string().min(20).optional().nullable(),
  versionLabel: z.string().max(120).optional().nullable(),
});
