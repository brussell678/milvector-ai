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
  masterBulletsArtifactId: z.string().uuid().optional(),
  pastedResumeText: z.string().min(100).optional(),
  jobDescriptionText: z.string().min(100),
  company: z.string().optional().nullable(),
  jobTitle: z.string().optional().nullable(),
});